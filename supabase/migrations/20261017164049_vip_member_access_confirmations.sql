-- Future access confirmations only: this migration never backfills existing members.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

create table public.vip_access_confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null unique,
  title text not null check (length(title) between 1 and 160),
  message text not null check (length(message) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email_status text not null default 'pending' check (email_status in ('pending','processing','sent','failed','skipped')),
  email_attempts integer not null default 0 check (email_attempts between 0 and 4),
  email_last_error text,
  email_next_attempt_at timestamptz default now(),
  constraint vip_access_confirmation_identity check (event_key = 'vip:access:' || id::text || ':' || user_id::text)
);
create index vip_access_confirmation_email_pending on public.vip_access_confirmations(email_next_attempt_at,created_at,id)
  where email_status in ('pending','failed','processing');
create index vip_access_confirmation_user on public.vip_access_confirmations(user_id,created_at desc);
alter table public.vip_access_confirmations enable row level security;
revoke all on public.vip_access_confirmations from public, anon, authenticated;
grant select, insert, update, delete on public.vip_access_confirmations to service_role;
comment on table public.vip_access_confirmations is 'Private transactional confirmations of future inactive-to-active VIP transitions, with independent email delivery state. No browser access or historical backfill.';

alter table public.vip_notification_outbox drop constraint vip_notification_outbox_kind_check;
alter table public.vip_notification_outbox add constraint vip_notification_outbox_kind_check
  check (kind in ('publication','renewal','admin_event','access_confirmation'));

create function public.vip_capture_access_confirmation()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_was_active boolean := false;
  v_is_active boolean;
  v_id uuid := gen_random_uuid();
  v_key text;
  v_title text := 'Votre accès VIP est validé';
  v_message text := 'L’équipe a validé votre accès InvestPro VIP. Vous pouvez maintenant ouvrir votre espace privé.';
begin
  v_is_active := new.status = 'active' and new.started_at <= v_now and (
    (new.type = 'affiliation' and new.expires_at is null)
    or (new.type = 'abonnement' and new.expires_at is not null and new.expires_at > new.started_at and new.expires_at > v_now)
  );
  if tg_op = 'UPDATE' then
    v_was_active := old.status = 'active' and old.started_at <= v_now and (
      (old.type = 'affiliation' and old.expires_at is null)
      or (old.type = 'abonnement' and old.expires_at is not null and old.expires_at > old.started_at and old.expires_at > v_now)
    );
  end if;
  if not coalesce(v_is_active,false) or coalesce(v_was_active,false) then return new; end if;
  v_key := 'vip:access:' || v_id::text || ':' || new.user_id::text;
  insert into public.vip_access_confirmations(id,user_id,event_key,title,message)
    values (v_id,new.user_id,v_key,v_title,v_message);
  insert into public.investpro_notifications(user_id,event_key,title,message,href)
    values (new.user_id,v_key,v_title,v_message,'/dashboard/vip');
  insert into public.vip_notification_outbox(user_id,event_key,title,message,href,kind)
    values (new.user_id,v_key,v_title,v_message,'/dashboard/vip','access_confirmation');
  return new;
end;
$$;
revoke all on function public.vip_capture_access_confirmation() from public, anon, authenticated;
grant execute on function public.vip_capture_access_confirmation() to service_role;
create trigger vip_membership_access_confirmation
  after insert or update of status,type,started_at,expires_at on public.vip_memberships
  for each row execute function public.vip_capture_access_confirmation();

-- Atomic leases and a bounded lifetime keep retry requests inside the provider's
-- 24-hour idempotency window. Failed/expired rows remain available for inspection.
create function public.vip_claim_access_confirmation_emails(p_limit integer default 20)
returns setof public.vip_access_confirmations language sql security invoker set search_path = '' as $$
  with candidates as (
    select id from public.vip_access_confirmations
    where email_attempts < 4 and created_at > now() - interval '23 hours' and (
      (email_status in ('pending','failed') and email_next_attempt_at <= now())
      or (email_status = 'processing' and updated_at < now() - interval '10 minutes')
    )
    order by created_at,id
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,20),20))
  )
  update public.vip_access_confirmations as confirmation
    set email_status = 'processing', email_attempts = email_attempts + 1, updated_at = now()
    from candidates where confirmation.id = candidates.id
    returning confirmation.*;
$$;
revoke all on function public.vip_claim_access_confirmation_emails(integer) from public, anon, authenticated;
grant execute on function public.vip_claim_access_confirmation_emails(integer) to service_role;
notify pgrst, 'reload schema';
commit;


