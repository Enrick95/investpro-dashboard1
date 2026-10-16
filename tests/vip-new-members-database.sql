begin;
set local statement_timeout='8s';
create temporary table vip_test_users(id uuid primary key);
insert into vip_test_users values
('11111111-1111-4111-8111-111111111111'),
('22222222-2222-4222-8222-222222222222'),
('33333333-3333-4333-8333-333333333333'),
('44444444-4444-4444-8444-444444444444');
create temporary table vip_memberships(
 user_id uuid primary key references pg_temp.vip_test_users(id),
 email text, type text, first_name text,last_name text, affiliation_broker text,
 started_at timestamptz,expires_at timestamptz,status text,created_at timestamptz,updated_at timestamptz
);
grant select,insert on pg_temp.vip_memberships to service_role;
-- REVIEW DRAFT ONLY. Not applied and not registered as a Supabase migration.
-- Generate the official migration with "supabase migration new vip_existing_members"
-- before moving this reviewed SQL into supabase/migrations.
-- Requires the existing private VIP and affiliation identity migrations.

create temporary table vip_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references pg_temp.vip_test_users(id) on delete cascade,
  email text not null check (length(email) between 3 and 254),
  first_name text not null check (public.vip_identity_name_valid(first_name)),
  last_name text not null check (public.vip_identity_name_valid(last_name)),
  telegram_username text check (telegram_username is null or telegram_username ~ '^[a-z][a-z0-9_]{4,31}$'),
  type text not null check (type in ('affiliation', 'abonnement')),
  affiliation_broker text check (affiliation_broker is null or affiliation_broker in ('raise_fx', 'vantage', 'puprime', 'axi')),
  paid_on date check (paid_on is null or isfinite(paid_on)),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references pg_temp.vip_test_users(id),
  verified_type text check (verified_type is null or verified_type in ('affiliation', 'abonnement')),
  verified_affiliation_broker text check (verified_affiliation_broker is null or verified_affiliation_broker in ('raise_fx', 'vantage', 'puprime', 'axi')),
  verified_paid_on date check (verified_paid_on is null or isfinite(verified_paid_on)),
  verified_expires_at timestamptz,
  constraint vip_request_origin check (
    (type = 'affiliation' and paid_on is null)
    or (type = 'abonnement' and affiliation_broker is null and paid_on is not null)
  ),
  constraint vip_request_review check (
    (status = 'pending' and reviewed_at is null and reviewed_by is null and verified_type is null and verified_affiliation_broker is null and verified_paid_on is null and verified_expires_at is null)
    or (status = 'denied' and reviewed_at is not null and reviewed_by is not null and verified_type is null and verified_affiliation_broker is null and verified_paid_on is null and verified_expires_at is null)
    or (status = 'approved' and reviewed_at is not null and reviewed_by is not null and verified_type is not null and
      ((verified_type = 'affiliation' and verified_affiliation_broker is not null and verified_paid_on is null and verified_expires_at is null)
       or (verified_type = 'abonnement' and verified_affiliation_broker is null and verified_paid_on is not null and verified_expires_at is not null)))
  )
);

-- One pending application per verified account, even with simultaneous submissions.
create unique index vip_access_request_pending_user on pg_temp.vip_access_requests(user_id) where status = 'pending';
create index vip_access_request_owner_created on pg_temp.vip_access_requests(user_id, created_at desc);
create index vip_access_request_reviewer on pg_temp.vip_access_requests(reviewed_by);
create index vip_access_request_pending_created on pg_temp.vip_access_requests(created_at) where status = 'pending';
alter table pg_temp.vip_access_requests enable row level security;
revoke all on pg_temp.vip_access_requests from public, anon, authenticated;
grant select on pg_temp.vip_access_requests to authenticated;
grant select, insert, update, delete on pg_temp.vip_access_requests to service_role;
create policy vip_access_request_own_read on pg_temp.vip_access_requests for select to authenticated
  using ((select auth.uid()) = user_id);
-- Members have no insert/update/delete grants or policies. All submissions pass
-- verified getUser/email confirmation and a strict whitelist in the server API.
-- Administrative reads/writes use the existing users_write permission gate and
-- the server-only service role, never user_metadata or browser role fields.

-- One calendar month from the paid date. Renewal is due at the start of that
-- corresponding date in Europe/Paris; month ends clamp and DST remains local.
create function pg_temp.vip_paid_on_expiry(p_paid_on date)
returns timestamptz language sql stable security invoker set search_path = '' as $$
  select case when p_paid_on is null or not isfinite(p_paid_on) then null
    else (p_paid_on + interval '1 month') at time zone 'Europe/Paris' end;
$$;
revoke all on function pg_temp.vip_paid_on_expiry(date) from public, anon, authenticated;
grant execute on function pg_temp.vip_paid_on_expiry(date) to service_role;


-- Reviewed draft. Generate its migration filename with the Supabase CLI.
-- This extends the existing requests and leaves all member access unchanged.
set local lock_timeout = '3s';
set local statement_timeout = '15s';

alter table pg_temp.vip_access_requests
  add column request_kind text not null default 'existing',
  add column broker_account_kind text,
  add column broker_account_id text,
  add column broker_email text,
  add column declared_deposit_usd numeric(12,2),
  add column copy_requested boolean not null default false,
  add column verified_deposit_usd numeric(12,2),
  add column verified_broker_linked boolean not null default false,
  add column verified_payment boolean not null default false,
  add constraint vip_request_kind check (request_kind in ('existing', 'new')),
  add constraint vip_request_broker_account_kind check (broker_account_kind is null or broker_account_kind in ('new', 'existing')),
  add constraint vip_request_broker_account_id check (broker_account_id is null or broker_account_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
  add constraint vip_request_broker_email check (broker_email is null or (length(broker_email) between 3 and 254 and broker_email !~ '[[:space:][:cntrl:]]' and broker_email ~ '^[^@]+@[^@]+[.][^@]+$')),
  add constraint vip_request_declared_deposit check (declared_deposit_usd is null or declared_deposit_usd between 0 and 100000000),
  add constraint vip_request_verified_deposit check (verified_deposit_usd is null or verified_deposit_usd between 0 and 100000000),
  add constraint vip_request_new_details check (
    (request_kind = 'existing' and broker_account_kind is null and broker_account_id is null and broker_email is null and declared_deposit_usd is null and not copy_requested)
    or (request_kind = 'new' and (
      (type = 'affiliation' and affiliation_broker is not null and broker_account_kind is not null and broker_account_id is not null and declared_deposit_usd is not null and declared_deposit_usd >= 300 and (not copy_requested or declared_deposit_usd >= 500))
      or (type = 'abonnement' and broker_account_kind is null and broker_account_id is null and broker_email is null and declared_deposit_usd is null and not copy_requested)
    ))
  ),
  add constraint vip_request_new_verification check (
    ((request_kind = 'existing' or status <> 'approved') and verified_deposit_usd is null and not verified_broker_linked and not verified_payment)
    or (request_kind = 'new' and status = 'approved' and verified_type = type and (
      (type = 'affiliation' and verified_broker_linked and verified_deposit_usd is not null and verified_deposit_usd >= 300 and not verified_payment)
      or (type = 'abonnement' and verified_payment and verified_deposit_usd is null and not verified_broker_linked)
    ))
  );

comment on column pg_temp.vip_access_requests.declared_deposit_usd is 'Member declaration of actual USD funding, excluding bonus; never proof or automatic authorization.';
comment on column pg_temp.vip_access_requests.copy_requested is 'Interest in optional Copy only; never automatically activates copy trading.';
comment on column pg_temp.vip_access_requests.verified_payment is 'Administrator confirmed the actual Stripe payment; not supplied by a member or a checkout redirect.';

-- Keep the original ownership-only SELECT RLS and absence of member write grants.
alter table pg_temp.vip_access_requests enable row level security;
revoke all on pg_temp.vip_access_requests from public, anon, authenticated;
grant select on pg_temp.vip_access_requests to authenticated;
grant select, insert, update, delete on pg_temp.vip_access_requests to service_role;

-- The checked RPC has a distinct name to keep Data API resolution unambiguous.
-- The eight-argument compatibility wrapper cannot bypass new verification.
create function pg_temp.vip_review_access_request_checked(
  p_request_id uuid, p_action text, p_reviewed_by uuid,
  p_first_name text, p_last_name text, p_type text,
  p_affiliation_broker text, p_paid_on date,
  p_verified_deposit_usd numeric, p_broker_linked_verified boolean,
  p_payment_verified boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_request pg_temp.vip_access_requests%rowtype;
  v_now timestamptz;
  v_expires_at timestamptz;
begin
  if p_request_id is null or p_reviewed_by is null or p_action is null or p_action not in ('approve', 'deny') then
    raise exception 'vip_request_approval_invalid';
  end if;
  select * into v_request from pg_temp.vip_access_requests where id = p_request_id for update;
  if not found or v_request.status <> 'pending' then raise exception 'vip_request_unavailable'; end if;
  v_now := clock_timestamp();
  if p_action = 'deny' then
    update pg_temp.vip_access_requests set status = 'denied', reviewed_at = v_now, reviewed_by = p_reviewed_by
      where id = p_request_id returning * into v_request;
    return to_jsonb(v_request);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_request.user_id::text, 0));
  v_now := clock_timestamp();
  if not public.vip_identity_name_valid(p_first_name) or not public.vip_identity_name_valid(p_last_name)
    or p_type is null or p_type not in ('affiliation', 'abonnement')
    or (p_type = 'affiliation' and (p_affiliation_broker is null or p_affiliation_broker not in ('raise_fx', 'vantage', 'puprime', 'axi') or p_paid_on is not null))
    or (p_type = 'abonnement' and (p_affiliation_broker is not null or p_paid_on is null or not isfinite(p_paid_on) or p_paid_on > (v_now at time zone 'Europe/Paris')::date))
  then raise exception 'vip_request_approval_invalid'; end if;
  if v_request.request_kind = 'new' then
    if p_type <> v_request.type
      or (p_type = 'affiliation' and (
        p_broker_linked_verified is distinct from true or p_verified_deposit_usd is null
        or p_verified_deposit_usd not between 300 and 100000000
        or p_verified_deposit_usd <> round(p_verified_deposit_usd, 2)
        or p_payment_verified is distinct from false
      ))
      or (p_type = 'abonnement' and (
        p_payment_verified is distinct from true or p_broker_linked_verified is distinct from false
        or p_verified_deposit_usd is not null
      ))
    then raise exception 'vip_request_approval_invalid'; end if;
  end if;
  if p_type = 'abonnement' then
    v_expires_at := pg_temp.vip_paid_on_expiry(p_paid_on);
    if v_expires_at is null or not isfinite(v_expires_at) or v_expires_at <= v_now then
      raise exception 'vip_request_approval_invalid';
    end if;
  end if;
  if exists (select 1 from pg_temp.vip_memberships where user_id = v_request.user_id) then
    raise exception 'vip_membership_exists';
  end if;
  insert into pg_temp.vip_memberships(
    user_id, email, type, first_name, last_name, affiliation_broker,
    started_at, expires_at, status, created_at, updated_at
  ) values (
    v_request.user_id, v_request.email, p_type, p_first_name, p_last_name, p_affiliation_broker,
    v_now, v_expires_at, 'active', v_now, v_now
  );
  update pg_temp.vip_access_requests set status = 'approved', reviewed_at = v_now, reviewed_by = p_reviewed_by,
    verified_type = p_type, verified_affiliation_broker = p_affiliation_broker, verified_paid_on = p_paid_on, verified_expires_at = v_expires_at,
    verified_deposit_usd = case when v_request.request_kind = 'new' and p_type = 'affiliation' then p_verified_deposit_usd else null end,
    verified_broker_linked = v_request.request_kind = 'new' and p_type = 'affiliation',
    verified_payment = v_request.request_kind = 'new' and p_type = 'abonnement'
    where id = p_request_id returning * into v_request;
  -- Copy is only a request, even when verified funding meets 500 USD.
  -- No Copy service, trade, payment, Telegram invite or push is started here.
  return to_jsonb(v_request);
exception when unique_violation then
  raise exception 'vip_membership_exists';
end;
$$;
revoke all on function pg_temp.vip_review_access_request_checked(uuid,text,uuid,text,text,text,text,date,numeric,boolean,boolean) from public, anon, authenticated;
grant execute on function pg_temp.vip_review_access_request_checked(uuid,text,uuid,text,text,text,text,date,numeric,boolean,boolean) to service_role;

create or replace function pg_temp.vip_review_access_request(
  p_request_id uuid, p_action text, p_reviewed_by uuid,
  p_first_name text, p_last_name text, p_type text,
  p_affiliation_broker text, p_paid_on date
) returns jsonb language sql security invoker set search_path = '' as $$
  select pg_temp.vip_review_access_request_checked(
    p_request_id, p_action, p_reviewed_by, p_first_name, p_last_name,
    p_type, p_affiliation_broker, p_paid_on, null::numeric, false, false
  );
$$;
revoke all on function pg_temp.vip_review_access_request(uuid,text,uuid,text,text,text,text,date) from public, anon, authenticated;
grant execute on function pg_temp.vip_review_access_request(uuid,text,uuid,text,text,text,text,date) to service_role;

-- Fixture assertions follow. All writes are to transaction-local pg_temp tables.
insert into pg_temp.vip_access_requests(id,user_id,email,first_name,last_name,type,affiliation_broker,request_kind,broker_account_kind,broker_account_id,declared_deposit_usd,copy_requested) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','one@example.invalid','Test','Un','affiliation','raise_fx','new','existing','TEST-001',500,true);
insert into pg_temp.vip_access_requests(id,user_id,email,first_name,last_name,type,paid_on,request_kind) values
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','two@example.invalid','Test','Deux','abonnement',(clock_timestamp() at time zone 'Europe/Paris')::date,'new');
insert into pg_temp.vip_access_requests(id,user_id,email,first_name,last_name,type,affiliation_broker) values
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','33333333-3333-4333-8333-333333333333','three@example.invalid','Test','Trois','affiliation','axi');

do $$ begin
  if has_table_privilege('anon','pg_temp.vip_access_requests','SELECT')
    or has_table_privilege('authenticated','pg_temp.vip_access_requests','INSERT')
    or has_table_privilege('authenticated','pg_temp.vip_access_requests','UPDATE')
    or has_table_privilege('authenticated','pg_temp.vip_access_requests','DELETE')
    or has_function_privilege('authenticated','pg_temp.vip_review_access_request_checked(uuid,text,uuid,text,text,text,text,date,numeric,boolean,boolean)','EXECUTE')
    or has_function_privilege('anon','pg_temp.vip_review_access_request_checked(uuid,text,uuid,text,text,text,text,date,numeric,boolean,boolean)','EXECUTE')
    or has_function_privilege('authenticated','pg_temp.vip_review_access_request(uuid,text,uuid,text,text,text,text,date)','EXECUTE')
  then raise exception 'new_intake_privilege_leak'; end if;
  begin
    insert into pg_temp.vip_access_requests(user_id,email,first_name,last_name,type,affiliation_broker,request_kind,broker_account_kind,broker_account_id)
    values('44444444-4444-4444-8444-444444444444','bad@example.invalid','Bad','Input','affiliation','axi','new','new','ID-1');
    raise exception 'missing_deposit_accepted';
  exception when check_violation then null; end;
end $$;

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
do $$ begin
  if (select count(*) from pg_temp.vip_access_requests) <> 1
    or not exists(select 1 from pg_temp.vip_access_requests where email='one@example.invalid')
  then raise exception 'new_intake_owner_rls_failure'; end if;
  begin
    update pg_temp.vip_access_requests set verified_broker_linked=true;
    raise exception 'member_verification_write_accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role service_role;
do $$
declare v_paid_on date := (clock_timestamp() at time zone 'Europe/Paris')::date;
begin
  begin
    perform pg_temp.vip_review_access_request('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','approve','44444444-4444-4444-8444-444444444444','Test','Un','affiliation','raise_fx',null);
    raise exception 'legacy_rpc_bypassed_new_verification';
  exception when raise_exception then if sqlerrm <> 'vip_request_approval_invalid' then raise; end if; end;
  begin
    perform pg_temp.vip_review_access_request_checked('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','approve','44444444-4444-4444-8444-444444444444','Test','Un','affiliation','raise_fx',null,299.99,true,false);
    raise exception 'underfunded_approval_accepted';
  exception when raise_exception then if sqlerrm <> 'vip_request_approval_invalid' then raise; end if; end;
  begin
    perform pg_temp.vip_review_access_request_checked('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','approve','44444444-4444-4444-8444-444444444444','Test','Un','affiliation','raise_fx',null,300,false,false);
    raise exception 'unlinked_approval_accepted';
  exception when raise_exception then if sqlerrm <> 'vip_request_approval_invalid' then raise; end if; end;
  begin
    perform pg_temp.vip_review_access_request_checked('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','approve','44444444-4444-4444-8444-444444444444','Test','Un','abonnement',null,v_paid_on,null,false,true);
    raise exception 'new_origin_swap_accepted';
  exception when raise_exception then if sqlerrm <> 'vip_request_approval_invalid' then raise; end if; end;
  begin
    perform pg_temp.vip_review_access_request_checked('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','approve','44444444-4444-4444-8444-444444444444','Test','Un','affiliation','raise_fx',null,'NaN'::numeric,true,false);
    raise exception 'nan_deposit_accepted';
  exception when raise_exception then if sqlerrm <> 'vip_request_approval_invalid' then raise; end if; end;
  begin
    perform pg_temp.vip_review_access_request_checked('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','approve','44444444-4444-4444-8444-444444444444','Test','Un','affiliation','raise_fx',null,300.001,true,false);
    raise exception 'excess_precision_accepted';
  exception when raise_exception then if sqlerrm <> 'vip_request_approval_invalid' then raise; end if; end;
  if exists(select 1 from pg_temp.vip_memberships) then raise exception 'rejected_approval_created_membership'; end if;
  perform pg_temp.vip_review_access_request_checked('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','approve','44444444-4444-4444-8444-444444444444','Test','Un','affiliation','raise_fx',null,300,true,false);
  if not exists(select 1 from pg_temp.vip_access_requests where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and status='approved' and copy_requested and verified_deposit_usd=300 and verified_broker_linked and not verified_payment)
  then raise exception 'affiliation_verification_history_missing'; end if;
  begin
    perform pg_temp.vip_review_access_request_checked('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','approve','44444444-4444-4444-8444-444444444444','Test','Deux','abonnement',null,v_paid_on,null,false,false);
    raise exception 'unverified_payment_accepted';
  exception when raise_exception then if sqlerrm <> 'vip_request_approval_invalid' then raise; end if; end;
  perform pg_temp.vip_review_access_request_checked('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','approve','44444444-4444-4444-8444-444444444444','Test','Deux','abonnement',null,v_paid_on,null,false,true);
  if not exists(select 1 from pg_temp.vip_access_requests where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and status='approved' and verified_payment and verified_paid_on=v_paid_on and verified_expires_at=pg_temp.vip_paid_on_expiry(v_paid_on))
  then raise exception 'stripe_verification_history_missing'; end if;
  perform pg_temp.vip_review_access_request('cccccccc-cccc-4ccc-8ccc-cccccccccccc','approve','44444444-4444-4444-8444-444444444444','Test','Trois','affiliation','axi',null);
  if (select count(*) from pg_temp.vip_memberships) <> 3 then raise exception 'legacy_compatibility_failure'; end if;
  begin
    perform pg_temp.vip_review_access_request_checked('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','approve','44444444-4444-4444-8444-444444444444','Test','Un','affiliation','raise_fx',null,300,true,false);
    raise exception 'repeated_approval_accepted';
  exception when raise_exception then if sqlerrm <> 'vip_request_unavailable' then raise; end if; end;
end $$;
reset role;
select 'new_vip_intake_sql_checks_passed' as result;
rollback;
