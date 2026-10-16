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


create temporary table vip_notification_outbox(id uuid primary key default gen_random_uuid(),kind text not null constraint vip_notification_outbox_kind_check check(kind in ('publication','renewal')));
insert into pg_temp.vip_notification_outbox(kind) values ('publication'),('renewal');
insert into pg_temp.vip_access_requests(id,user_id,email,first_name,last_name,type,affiliation_broker) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','historical@example.invalid','Historique','Un','affiliation','axi');

-- Future VIP administrative activity only. No historical row is backfilled.
set local lock_timeout = '3s';
set local statement_timeout = '15s';

create table pg_temp.vip_admin_activity_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  request_id uuid not null references pg_temp.vip_access_requests(id) on delete cascade,
  kind text not null check (kind in ('requested', 'approved', 'denied')),
  title text not null check (length(title) between 1 and 120),
  message text not null check (length(message) between 1 and 500),
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  constraint vip_admin_activity_event_identity check (
    event_key = 'vip:admin:' || case when kind = 'requested' then 'request' else kind end || ':' || request_id::text
  )
);
create index vip_admin_activity_pending on pg_temp.vip_admin_activity_events(created_at,id) where dispatched_at is null;
create index vip_admin_activity_recent on pg_temp.vip_admin_activity_events(created_at desc);
create index vip_admin_activity_request on pg_temp.vip_admin_activity_events(request_id);
alter table pg_temp.vip_admin_activity_events enable row level security;
revoke all on pg_temp.vip_admin_activity_events from public, anon, authenticated;
grant select, insert, update, delete on pg_temp.vip_admin_activity_events to service_role;
comment on table pg_temp.vip_admin_activity_events is 'Private durable administrative activity from future VIP request transitions; clients never directly read or write this table.';

create function pg_temp.vip_capture_admin_activity()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_kind text;
  v_title text;
  v_type text;
  v_broker text;
  v_origin text;
  v_message text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then return new; end if;
    v_kind := 'requested';
    v_title := 'Demande VIP reçue';
  elsif tg_op = 'UPDATE' then
    if old.status is not distinct from new.status or new.status not in ('approved', 'denied') then return new; end if;
    v_kind := new.status;
    v_title := case when new.status = 'approved' then 'Accès VIP validé' else 'Demande VIP refusée' end;
  else
    return new;
  end if;
  v_type := case when new.status = 'approved' then coalesce(new.verified_type,new.type) else new.type end;
  v_broker := case when new.status = 'approved' then coalesce(new.verified_affiliation_broker,new.affiliation_broker) else new.affiliation_broker end;
  v_origin := case when v_type = 'abonnement' then 'Abonnement' else 'Affiliation' end;
  if v_type = 'affiliation' then
    v_origin := v_origin || ' · ' || case v_broker
      when 'raise_fx' then 'Raise FX' when 'vantage' then 'Vantage'
      when 'puprime' then 'PU Prime' when 'axi' then 'Axi' else 'Broker à vérifier' end;
  end if;
  v_message := new.first_name || ' ' || new.last_name || ' · ' || v_origin;
  if v_kind = 'requested' then
    v_message := v_message || case when v_type = 'abonnement' then ' · Paiement à vérifier.' else ' · Demande à vérifier.' end;
  elsif v_kind = 'approved' then
    v_message := v_message || ' · Accès validé par l’équipe.';
  else
    v_message := v_message || ' · Demande refusée par l’équipe.';
  end if;
  insert into pg_temp.vip_admin_activity_events(event_key,request_id,kind,title,message)
    values ('vip:admin:' || case when v_kind = 'requested' then 'request' else v_kind end || ':' || new.id::text,new.id,v_kind,v_title,v_message)
    on conflict (event_key) do nothing;
  return new;
end;
$$;
revoke all on function pg_temp.vip_capture_admin_activity() from public, anon, authenticated;
grant execute on function pg_temp.vip_capture_admin_activity() to service_role;
create trigger vip_access_request_admin_activity
  after insert or update of status on pg_temp.vip_access_requests
  for each row execute function pg_temp.vip_capture_admin_activity();

-- Administrators are re-authorized by the delivery worker before admin_event
-- pushes; these events grant no membership and never claim payment on a click.
alter table pg_temp.vip_notification_outbox drop constraint vip_notification_outbox_kind_check;
alter table pg_temp.vip_notification_outbox add constraint vip_notification_outbox_kind_check
  check (kind in ('publication','renewal','admin_event'));

-- Activity fixture assertions, isolated in pg_temp and rolled back.
do $$ begin
  if exists(select 1 from pg_temp.vip_admin_activity_events) then raise exception 'activity_history_backfilled'; end if;
  if has_table_privilege('anon','pg_temp.vip_admin_activity_events','SELECT')
    or has_table_privilege('authenticated','pg_temp.vip_admin_activity_events','SELECT')
    or has_table_privilege('authenticated','pg_temp.vip_admin_activity_events','INSERT')
    or has_table_privilege('authenticated','pg_temp.vip_admin_activity_events','UPDATE')
    or has_table_privilege('authenticated','pg_temp.vip_admin_activity_events','DELETE')
    or has_function_privilege('authenticated','pg_temp.vip_capture_admin_activity()','EXECUTE')
    or has_function_privilege('anon','pg_temp.vip_capture_admin_activity()','EXECUTE')
  then raise exception 'admin_activity_privilege_leak'; end if;
  if (select count(*) from pg_temp.vip_notification_outbox) <> 2 then raise exception 'outbox_history_changed'; end if;
  insert into pg_temp.vip_notification_outbox(kind) values ('admin_event');
  begin
    insert into pg_temp.vip_notification_outbox(kind) values ('untrusted_kind');
    raise exception 'untrusted_outbox_kind_accepted';
  exception when check_violation then null; end;
end $$;

set local role service_role;
insert into pg_temp.vip_access_requests(id,user_id,email,first_name,last_name,type,affiliation_broker) values
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','new@example.invalid','Nouveau','Deux','affiliation','vantage'),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd','44444444-4444-4444-8444-444444444444','denied@example.invalid','Refus','Quatre','affiliation','puprime');
insert into pg_temp.vip_access_requests(id,user_id,email,first_name,last_name,type,paid_on) values
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','33333333-3333-4333-8333-333333333333','subscription@example.invalid','Abonnement','Trois','abonnement',(clock_timestamp() at time zone 'Europe/Paris')::date);
do $$ begin
  if (select count(*) from pg_temp.vip_admin_activity_events) <> 3 then raise exception 'new_request_activity_missing'; end if;
  if not exists(select 1 from pg_temp.vip_admin_activity_events where event_key='vip:admin:request:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and kind='requested' and title='Demande VIP reçue' and message like '%Affiliation · Vantage%' and dispatched_at is null)
  then raise exception 'affiliation_activity_content_invalid'; end if;
  if not exists(select 1 from pg_temp.vip_admin_activity_events where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' and message like '%Paiement à vérifier.%' and message not ilike '%confirmé%' and message not ilike '%payé%')
  then raise exception 'declaration_claimed_confirmed_payment'; end if;
end $$;

update pg_temp.vip_access_requests set status='approved',reviewed_at=now(),reviewed_by='44444444-4444-4444-8444-444444444444',verified_type='affiliation',verified_affiliation_broker='vantage'
where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
update pg_temp.vip_access_requests set status='approved',reviewed_at=now(),reviewed_by='44444444-4444-4444-8444-444444444444',verified_type='abonnement',verified_paid_on=paid_on,verified_expires_at=pg_temp.vip_paid_on_expiry(paid_on)
where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
update pg_temp.vip_access_requests set status='denied',reviewed_at=now(),reviewed_by='44444444-4444-4444-8444-444444444444'
where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
-- An UPDATE which mentions status without changing it must not repeat alerts.
update pg_temp.vip_access_requests set status='approved',first_name='Nouveau'
where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
do $$ begin
  if (select count(*) from pg_temp.vip_admin_activity_events) <> 6 then raise exception 'status_activity_count_invalid'; end if;
  if not exists(select 1 from pg_temp.vip_admin_activity_events where event_key='vip:admin:approved:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and kind='approved' and title='Accès VIP validé')
  then raise exception 'approved_activity_missing'; end if;
  if not exists(select 1 from pg_temp.vip_admin_activity_events where event_key='vip:admin:denied:dddddddd-dddd-4ddd-8ddd-dddddddddddd' and kind='denied' and title='Demande VIP refusée')
  then raise exception 'denied_activity_missing'; end if;
  if exists(select 1 from pg_temp.vip_admin_activity_events where request_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  then raise exception 'historical_request_backfilled'; end if;
end $$;
-- A future review of an old pending declaration is still real new activity.
update pg_temp.vip_access_requests set status='approved',reviewed_at=now(),reviewed_by='44444444-4444-4444-8444-444444444444',verified_type='affiliation',verified_affiliation_broker='axi'
where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
do $$ begin
  if (select count(*) from pg_temp.vip_admin_activity_events) <> 7 then raise exception 'future_legacy_review_not_captured'; end if;
  if (select count(*) from pg_temp.vip_admin_activity_events where request_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1
  then raise exception 'legacy_review_backfilled_request'; end if;
end $$;
reset role;

set local role authenticated;
do $$ begin
  begin
    perform id from pg_temp.vip_admin_activity_events;
    raise exception 'member_read_private_admin_activity';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

delete from pg_temp.vip_access_requests where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
do $$ begin
  if exists(select 1 from pg_temp.vip_admin_activity_events where request_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd')
  then raise exception 'activity_request_cascade_failed'; end if;
end $$;
select 'vip_admin_activity_sql_checks_passed' as result;
rollback;
