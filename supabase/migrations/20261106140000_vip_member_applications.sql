begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

create table public.vip_member_applications (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 254),
  first_name text not null check (public.vip_identity_name_valid(first_name)),
  last_name text not null check (public.vip_identity_name_valid(last_name)),
  telegram_username text not null check (telegram_username ~ '^[a-z][a-z0-9_]{4,31}$'),
  phone_whatsapp text not null check (phone_whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  affiliation_broker text not null check (affiliation_broker in ('bullwaves','raise_fx','vtmarkets','puprime','axi')),
  mt_platform text not null check (mt_platform in ('MT4','MT5')),
  broker_account_id text not null check (broker_account_id ~ '^[0-9]{4,12}$'),
  mt_server text not null check (length(mt_server) between 2 and 100),
  deposit_range text not null check (deposit_range in ('300-499','500-999','1000-plus')),
  declared_deposit_usd numeric not null check (declared_deposit_usd in (300,500,1000)),
  via_enrick_link boolean not null check (via_enrick_link is true),
  proof_path text not null check (proof_path like (id::text || '/%')),
  status text not null default 'submitted' check (status in ('submitted','approved','denied','claimed')),
  revision integer not null default 0 check (revision >= 0),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  verified_first_name text check (verified_first_name is null or public.vip_identity_name_valid(verified_first_name)),
  verified_last_name text check (verified_last_name is null or public.vip_identity_name_valid(verified_last_name)),
  verified_affiliation_broker text check (verified_affiliation_broker is null or verified_affiliation_broker in ('bullwaves','raise_fx','vtmarkets','puprime','axi')),
  verified_deposit_usd numeric check (verified_deposit_usd is null or verified_deposit_usd between 300 and 100000000),
  broker_linked_verified boolean not null default false,
  approval_email_sent_at timestamptz,
  claim_expires_at timestamptz,
  claimed_user_id uuid references auth.users(id) on delete set null,
  claim_request_id uuid references public.vip_access_requests(id) on delete set null,
  rejection_reason text,
  created_at timestamptz not null default now(),
  constraint vip_member_application_state check (
    (status = 'submitted' and reviewed_at is null and reviewed_by is null and verified_first_name is null and verified_last_name is null and verified_affiliation_broker is null and verified_deposit_usd is null and claimed_user_id is null and claim_request_id is null)
    or (status in ('approved','claimed') and reviewed_at is not null and reviewed_by is not null and verified_first_name is not null and verified_last_name is not null and verified_affiliation_broker is not null and verified_deposit_usd >= 300 and broker_linked_verified and claim_expires_at is not null)
    or (status = 'denied' and reviewed_at is not null and reviewed_by is not null and rejection_reason is not null and length(rejection_reason) between 5 and 300 and claimed_user_id is null and claim_request_id is null)
  ),
  constraint vip_member_application_claim_state check (
    (status <> 'claimed' and claimed_user_id is null and claim_request_id is null)
    or (status = 'claimed' and claimed_user_id is not null and claim_request_id is not null)
  )
);
create unique index vip_member_application_email_open on public.vip_member_applications(email)
  where status in ('submitted','approved');
create index vip_member_applications_status_created on public.vip_member_applications(status, created_at desc);

alter table public.vip_member_applications enable row level security;
revoke all on public.vip_member_applications from public, anon, authenticated;
grant select, insert, update, delete on public.vip_member_applications to service_role;

-- A verified email plus an approved application is required. The application UUID
-- is only a locator; it does not grant access on its own.
create function public.vip_claim_member_application(
  p_application_id uuid,
  p_user_id uuid,
  p_email text,
  p_email_confirmed_at timestamptz,
  p_proof_path text,
  p_invite_url text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_app public.vip_member_applications%rowtype;
  v_account_id bigint;
  v_request_id uuid;
  v_review jsonb;
  v_member_number bigint;
begin
  if p_application_id is null or p_user_id is null or p_email_confirmed_at is null
    or p_email is null or p_email <> lower(btrim(p_email))
    or p_proof_path is null or p_proof_path !~ ('^' || p_user_id::text || '/[A-Za-z0-9._-]+$')
    or p_invite_url is null or p_invite_url !~ '^https://t\.me/'
  then raise exception 'vip_member_application_invalid'; end if;

  select * into v_app from public.vip_member_applications
    where id = p_application_id and email = p_email for update;
  if not found then raise exception 'vip_member_application_unavailable'; end if;
  if v_app.status = 'claimed' then
    if v_app.claimed_user_id = p_user_id and v_app.claim_request_id is not null then
      return jsonb_build_object('request_id',v_app.claim_request_id,'status','claimed');
    end if;
    raise exception 'vip_member_application_unavailable';
  end if;
  if v_app.status <> 'approved' or v_app.claim_expires_at <= clock_timestamp() then
    raise exception 'vip_member_application_unavailable';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  if exists (select 1 from public.vip_memberships where user_id = p_user_id) then
    raise exception 'vip_membership_exists';
  end if;

  insert into public.trading_accounts(user_id,name,account_type,platform,broker,currency,initial_balance,current_balance,connection_type)
    values (p_user_id, v_app.affiliation_broker || ' · ' || v_app.mt_platform || ' · ' || v_app.broker_account_id || ' · ' || v_app.mt_server,
      'real',v_app.mt_platform,v_app.affiliation_broker,'USD',0,0,'manual')
    returning id into v_account_id;

  insert into public.vip_access_requests(
    user_id,email,first_name,last_name,telegram_username,type,affiliation_broker,status,
    request_kind,broker_account_kind,broker_account_id,broker_email,declared_deposit_usd,copy_requested,
    member_intake,phone_whatsapp,mt_platform,mt_server,deposit_range,proof_path,via_enrick_link,trading_account_id
  ) values (
    p_user_id,p_email,v_app.verified_first_name,v_app.verified_last_name,v_app.telegram_username,'affiliation',v_app.verified_affiliation_broker,'pending',
    'new','new',v_app.broker_account_id,p_email,v_app.declared_deposit_usd,false,
    true,v_app.phone_whatsapp,v_app.mt_platform,v_app.mt_server,v_app.deposit_range,p_proof_path,true,v_account_id
  ) returning id into v_request_id;

  v_review := public.vip_review_access_request_revision(
    v_request_id,0,'approve',v_app.reviewed_by,
    v_app.verified_first_name,v_app.verified_last_name,'affiliation',v_app.verified_affiliation_broker,null,
    v_app.verified_deposit_usd,v_app.broker_linked_verified,false
  );
  select member_number into v_member_number from public.vip_memberships where user_id=p_user_id;
  if v_member_number is null then raise exception 'vip_membership_number_unavailable'; end if;
  update public.vip_access_requests set channel_invite_url=p_invite_url,member_number=v_member_number
    where id=v_request_id and status='approved';

  update public.vip_member_applications set status='claimed',claimed_user_id=p_user_id,claim_request_id=v_request_id
    where id=p_application_id and status='approved';
  if not found then raise exception 'vip_member_application_unavailable'; end if;

  return jsonb_build_object('request_id',v_request_id,'status','approved','first_name',v_app.verified_first_name,
    'last_name',v_app.verified_last_name,'member_number',v_member_number,'channel_invite_url',p_invite_url,'trading_account_id',v_account_id);
end;
$$;
revoke all on function public.vip_claim_member_application(uuid,uuid,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.vip_claim_member_application(uuid,uuid,text,timestamptz,text,text) to service_role;

notify pgrst,'reload schema';
commit;
