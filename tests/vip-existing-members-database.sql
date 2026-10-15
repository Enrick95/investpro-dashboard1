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

create function pg_temp.vip_review_access_request(
  p_request_id uuid, p_action text, p_reviewed_by uuid,
  p_first_name text, p_last_name text, p_type text,
  p_affiliation_broker text, p_paid_on date
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
  -- Check the clock after both locks: a payment must still cover the member
  -- when approval can actually be committed, not when waiting began.
  perform pg_advisory_xact_lock(hashtextextended(v_request.user_id::text, 0));
  v_now := clock_timestamp();
  if not public.vip_identity_name_valid(p_first_name) or not public.vip_identity_name_valid(p_last_name)
    or p_type is null or p_type not in ('affiliation', 'abonnement')
    or (p_type = 'affiliation' and (p_affiliation_broker is null or p_affiliation_broker not in ('raise_fx', 'vantage', 'puprime', 'axi') or p_paid_on is not null))
    or (p_type = 'abonnement' and (p_affiliation_broker is not null or p_paid_on is null or not isfinite(p_paid_on) or p_paid_on > (v_now at time zone 'Europe/Paris')::date))
  then raise exception 'vip_request_approval_invalid'; end if;
  if p_type = 'abonnement' then
    v_expires_at := pg_temp.vip_paid_on_expiry(p_paid_on);
    if v_expires_at is null or not isfinite(v_expires_at) or v_expires_at <= v_now then
      raise exception 'vip_request_approval_invalid';
    end if;
  end if;

  -- Serialize approvals for the same account. The membership's unique user_id
  -- additionally makes any race with invitation redemption fail atomically.
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
    verified_type = p_type, verified_affiliation_broker = p_affiliation_broker, verified_paid_on = p_paid_on, verified_expires_at = v_expires_at
    where id = p_request_id returning * into v_request;
  -- This function sends no notifications, creates no invitation/token and never
  -- modifies an existing membership or a Telegram invitation setting.
  return to_jsonb(v_request);
exception when unique_violation then
  raise exception 'vip_membership_exists';
end;
$$;
revoke all on function pg_temp.vip_review_access_request(uuid, text, uuid, text, text, text, text, date) from public, anon, authenticated;
grant execute on function pg_temp.vip_review_access_request(uuid, text, uuid, text, text, text, text, date) to service_role;


do $grant$ begin execute format('grant usage on schema %I to authenticated,service_role,anon', (select nspname from pg_catalog.pg_namespace where oid = pg_my_temp_schema())); end $grant$;
insert into pg_temp.vip_access_requests(id,user_id,email,first_name,last_name,telegram_username,type,affiliation_broker,paid_on) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','one@example.invalid','Test','Un',null,'affiliation',null,null),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','two@example.invalid','Test','Deux','test_deux','abonnement',null,(clock_timestamp() at time zone 'Europe/Paris')::date-1),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','33333333-3333-4333-8333-333333333333','three@example.invalid','Test','Trois',null,'affiliation','axi',null);
do $verify$
begin
 if has_table_privilege('anon','pg_temp.vip_access_requests','SELECT')
 or has_table_privilege('authenticated','pg_temp.vip_access_requests','INSERT')
 or has_table_privilege('authenticated','pg_temp.vip_access_requests','UPDATE')
 or has_table_privilege('authenticated','pg_temp.vip_access_requests','DELETE')
 or has_function_privilege('authenticated','pg_temp.vip_review_access_request(uuid,text,uuid,text,text,text,text,date)','EXECUTE')
 or has_function_privilege('anon','pg_temp.vip_review_access_request(uuid,text,uuid,text,text,text,text,date)','EXECUTE')
 or has_function_privilege('authenticated','pg_temp.vip_paid_on_expiry(date)','EXECUTE')
 or has_function_privilege('anon','pg_temp.vip_paid_on_expiry(date)','EXECUTE')
 then raise exception 'privilege_test_failed'; end if;
end $verify$;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $verify$
begin
 if (select count(*) from pg_temp.vip_access_requests) <> 1
 or not exists(select 1 from pg_temp.vip_access_requests where email='one@example.invalid')
 then raise exception 'own_read_test_failed'; end if;
 begin
  update pg_temp.vip_access_requests set status='approved';
  raise exception 'self_grant_was_allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform pg_temp.vip_review_access_request('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','approve','44444444-4444-4444-8444-444444444444','Test','Un','affiliation','axi',null);
  raise exception 'rpc_was_allowed';
 exception when insufficient_privilege then null; end;
end $verify$;
reset role;
set local role service_role;
do $verify$
declare v_test_paid_on date := (clock_timestamp() at time zone 'Europe/Paris')::date;
 paid_until timestamptz := pg_temp.vip_paid_on_expiry(v_test_paid_on);
begin
 if pg_temp.vip_paid_on_expiry('2024-01-31'::date) <> '2024-02-28 23:00:00+00'::timestamptz
 or pg_temp.vip_paid_on_expiry('2026-01-31'::date) <> '2026-02-27 23:00:00+00'::timestamptz
 or pg_temp.vip_paid_on_expiry('2026-02-28'::date) <> '2026-03-27 23:00:00+00'::timestamptz
 or pg_temp.vip_paid_on_expiry('2026-02-28'::date) = '2026-03-28 00:00:00+00'::timestamptz
 or pg_temp.vip_paid_on_expiry('2026-09-25'::date) <> '2026-10-24 22:00:00+00'::timestamptz
 or pg_temp.vip_paid_on_expiry('2026-09-26'::date) <> '2026-10-25 23:00:00+00'::timestamptz
 or pg_temp.vip_paid_on_expiry('2028-02-26'::date) <> '2028-03-25 23:00:00+00'::timestamptz
 or pg_temp.vip_paid_on_expiry('2028-02-27'::date) <> '2028-03-26 22:00:00+00'::timestamptz
 or pg_temp.vip_paid_on_expiry('2026-12-31'::date) <> '2027-01-30 23:00:00+00'::timestamptz
 or pg_temp.vip_paid_on_expiry(null) is not null
 or pg_temp.vip_paid_on_expiry('infinity'::date) is not null
 then raise exception 'paris_calendar_expiry_failed'; end if;
 begin
  perform pg_temp.vip_review_access_request('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',null,'44444444-4444-4444-8444-444444444444','Test','Un','affiliation','axi',null);
  raise exception 'null_action_was_allowed';
 exception when raise_exception then if sqlerrm <> 'vip_request_approval_invalid' then raise; end if; end;
 begin
  perform pg_temp.vip_review_access_request('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','approve','44444444-4444-4444-8444-444444444444','Test','Deux','abonnement',null,v_test_paid_on+1);
  raise exception 'future_payment_was_allowed';
 exception when raise_exception then if sqlerrm <> 'vip_request_approval_invalid' then raise; end if; end;
 begin
  perform pg_temp.vip_review_access_request('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','approve','44444444-4444-4444-8444-444444444444','Test','Deux','abonnement',null,null);
  raise exception 'missing_payment_was_allowed';
 exception when raise_exception then if sqlerrm <> 'vip_request_approval_invalid' then raise; end if; end;
 begin
  perform pg_temp.vip_review_access_request('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','approve','44444444-4444-4444-8444-444444444444','Test','Un','affiliation',null,null);
  raise exception 'missing_broker_was_allowed';
 exception when raise_exception then if sqlerrm <> 'vip_request_approval_invalid' then raise; end if; end;
 perform pg_temp.vip_review_access_request('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','approve','44444444-4444-4444-8444-444444444444','Test','Un','affiliation','axi',null);
 if not exists(select 1 from pg_temp.vip_memberships where user_id='11111111-1111-4111-8111-111111111111' and affiliation_broker='axi' and expires_at is null) then raise exception 'affiliation_approval_failed'; end if;
 begin
  perform pg_temp.vip_review_access_request('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','approve','44444444-4444-4444-8444-444444444444','Test','Un','affiliation','axi',null);
  raise exception 'double_approval_was_allowed';
 exception when raise_exception then if sqlerrm <> 'vip_request_unavailable' then raise; end if; end;
 begin
  perform pg_temp.vip_review_access_request('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','approve','44444444-4444-4444-8444-444444444444','Test','Deux','abonnement',null,((clock_timestamp() at time zone 'Europe/Paris')::date-interval '2 months')::date);
  raise exception 'expired_approval_was_allowed';
 exception when raise_exception then if sqlerrm <> 'vip_request_approval_invalid' then raise; end if; end;
 perform pg_temp.vip_review_access_request('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','approve','44444444-4444-4444-8444-444444444444','Test','Deux','abonnement',null,v_test_paid_on);
 if not exists(select 1 from pg_temp.vip_memberships where user_id='22222222-2222-4222-8222-222222222222' and expires_at=paid_until) then raise exception 'paid_expiry_changed'; end if;
 if not exists(select 1 from pg_temp.vip_access_requests where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and vip_access_requests.paid_on=v_test_paid_on-1 and verified_paid_on=v_test_paid_on and verified_expires_at=paid_until and status='approved') then raise exception 'payment_history_missing'; end if;
 perform pg_temp.vip_review_access_request('cccccccc-cccc-4ccc-8ccc-cccccccccccc','deny','44444444-4444-4444-8444-444444444444',null,null,null,null,null);
 if exists(select 1 from pg_temp.vip_memberships where user_id='33333333-3333-4333-8333-333333333333') then raise exception 'denial_granted_access'; end if;
end $verify$;
reset role;
do $verify$
begin
 begin
  insert into pg_temp.vip_access_requests(user_id,email,first_name,last_name,type,status,reviewed_at,reviewed_by)
  values('33333333-3333-4333-8333-333333333333','three@example.invalid','Test','Trois','affiliation','approved',clock_timestamp(),'44444444-4444-4444-8444-444444444444');
  raise exception 'null_verified_type_was_allowed';
 exception when check_violation then null; end;
 insert into pg_temp.vip_access_requests(id,user_id,email,first_name,last_name,type) values
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111','one@example.invalid','Test','Un','affiliation');
 begin
  insert into pg_temp.vip_access_requests(user_id,email,first_name,last_name,type) values
  ('11111111-1111-4111-8111-111111111111','one@example.invalid','Test','Un','affiliation');
  raise exception 'duplicate_pending_was_allowed';
 exception when unique_violation then null; end;
 begin
  perform pg_temp.vip_review_access_request('dddddddd-dddd-4ddd-8ddd-dddddddddddd','approve','44444444-4444-4444-8444-444444444444','Test','Un','affiliation','vantage',null);
  raise exception 'existing_membership_was_overwritten';
 exception when raise_exception then if sqlerrm <> 'vip_membership_exists' then raise; end if; end;
 if not exists(select 1 from pg_temp.vip_memberships where user_id='11111111-1111-4111-8111-111111111111' and affiliation_broker='axi') then raise exception 'existing_membership_changed'; end if;
end $verify$;
select 'PASS: temporary schema only; RLS, no self-grant, service approval, payment date, Paris calendar/DST expiry, payment history, future/expired dates, denial, duplicates, conflicts, NULL checks' as verification;
rollback;
