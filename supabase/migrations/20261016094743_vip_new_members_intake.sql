-- New VIP intake: explicit broker/deposit or payment review, preserving existing-member access.
-- This extends the existing requests and leaves all member access unchanged.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

alter table public.vip_access_requests
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

comment on column public.vip_access_requests.declared_deposit_usd is 'Member declaration of actual USD funding, excluding bonus; never proof or automatic authorization.';
comment on column public.vip_access_requests.copy_requested is 'Interest in optional Copy only; never automatically activates copy trading.';
comment on column public.vip_access_requests.verified_payment is 'Administrator confirmed the actual Stripe payment; not supplied by a member or a checkout redirect.';

-- Keep the original ownership-only SELECT RLS and absence of member write grants.
alter table public.vip_access_requests enable row level security;
revoke all on public.vip_access_requests from public, anon, authenticated;
grant select on public.vip_access_requests to authenticated;
grant select, insert, update, delete on public.vip_access_requests to service_role;

-- The checked RPC has a distinct name to keep Data API resolution unambiguous.
-- The eight-argument compatibility wrapper cannot bypass new verification.
create function public.vip_review_access_request_checked(
  p_request_id uuid, p_action text, p_reviewed_by uuid,
  p_first_name text, p_last_name text, p_type text,
  p_affiliation_broker text, p_paid_on date,
  p_verified_deposit_usd numeric, p_broker_linked_verified boolean,
  p_payment_verified boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_request public.vip_access_requests%rowtype;
  v_now timestamptz;
  v_expires_at timestamptz;
begin
  if p_request_id is null or p_reviewed_by is null or p_action is null or p_action not in ('approve', 'deny') then
    raise exception 'vip_request_approval_invalid';
  end if;
  select * into v_request from public.vip_access_requests where id = p_request_id for update;
  if not found or v_request.status <> 'pending' then raise exception 'vip_request_unavailable'; end if;
  v_now := clock_timestamp();
  if p_action = 'deny' then
    update public.vip_access_requests set status = 'denied', reviewed_at = v_now, reviewed_by = p_reviewed_by
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
    v_expires_at := public.vip_paid_on_expiry(p_paid_on);
    if v_expires_at is null or not isfinite(v_expires_at) or v_expires_at <= v_now then
      raise exception 'vip_request_approval_invalid';
    end if;
  end if;
  if exists (select 1 from public.vip_memberships where user_id = v_request.user_id) then
    raise exception 'vip_membership_exists';
  end if;
  insert into public.vip_memberships(
    user_id, email, type, first_name, last_name, affiliation_broker,
    started_at, expires_at, status, created_at, updated_at
  ) values (
    v_request.user_id, v_request.email, p_type, p_first_name, p_last_name, p_affiliation_broker,
    v_now, v_expires_at, 'active', v_now, v_now
  );
  update public.vip_access_requests set status = 'approved', reviewed_at = v_now, reviewed_by = p_reviewed_by,
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
revoke all on function public.vip_review_access_request_checked(uuid,text,uuid,text,text,text,text,date,numeric,boolean,boolean) from public, anon, authenticated;
grant execute on function public.vip_review_access_request_checked(uuid,text,uuid,text,text,text,text,date,numeric,boolean,boolean) to service_role;

create or replace function public.vip_review_access_request(
  p_request_id uuid, p_action text, p_reviewed_by uuid,
  p_first_name text, p_last_name text, p_type text,
  p_affiliation_broker text, p_paid_on date
) returns jsonb language sql security invoker set search_path = '' as $$
  select public.vip_review_access_request_checked(
    p_request_id, p_action, p_reviewed_by, p_first_name, p_last_name,
    p_type, p_affiliation_broker, p_paid_on, null::numeric, false, false
  );
$$;
revoke all on function public.vip_review_access_request(uuid,text,uuid,text,text,text,text,date) from public, anon, authenticated;
grant execute on function public.vip_review_access_request(uuid,text,uuid,text,text,text,text,date) to service_role;
notify pgrst, 'reload schema';
commit;
