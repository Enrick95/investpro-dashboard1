-- Future VIP administrative activity only. No historical row is backfilled.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

create table public.vip_admin_activity_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  request_id uuid not null references public.vip_access_requests(id) on delete cascade,
  kind text not null check (kind in ('requested', 'approved', 'denied')),
  title text not null check (length(title) between 1 and 120),
  message text not null check (length(message) between 1 and 500),
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  constraint vip_admin_activity_event_identity check (
    event_key = 'vip:admin:' || case when kind = 'requested' then 'request' else kind end || ':' || request_id::text
  )
);
create index vip_admin_activity_pending on public.vip_admin_activity_events(created_at,id) where dispatched_at is null;
create index vip_admin_activity_recent on public.vip_admin_activity_events(created_at desc);
create index vip_admin_activity_request on public.vip_admin_activity_events(request_id);
alter table public.vip_admin_activity_events enable row level security;
revoke all on public.vip_admin_activity_events from public, anon, authenticated;
grant select, insert, update, delete on public.vip_admin_activity_events to service_role;
comment on table public.vip_admin_activity_events is 'Private durable administrative activity from future VIP request transitions; clients never directly read or write this table.';

create function public.vip_capture_admin_activity()
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
  insert into public.vip_admin_activity_events(event_key,request_id,kind,title,message)
    values ('vip:admin:' || case when v_kind = 'requested' then 'request' else v_kind end || ':' || new.id::text,new.id,v_kind,v_title,v_message)
    on conflict (event_key) do nothing;
  return new;
end;
$$;
revoke all on function public.vip_capture_admin_activity() from public, anon, authenticated;
grant execute on function public.vip_capture_admin_activity() to service_role;
create trigger vip_access_request_admin_activity
  after insert or update of status on public.vip_access_requests
  for each row execute function public.vip_capture_admin_activity();

-- Administrators are re-authorized by the delivery worker before admin_event
-- pushes; these events grant no membership and never claim payment on a click.
alter table public.vip_notification_outbox drop constraint vip_notification_outbox_kind_check;
alter table public.vip_notification_outbox add constraint vip_notification_outbox_kind_check
  check (kind in ('publication','renewal','admin_event'));
notify pgrst, 'reload schema';
commit;
