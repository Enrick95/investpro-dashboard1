-- Additive VIP membership schema. Apply as one transaction; no user or invitation is seeded.
begin;

create table public.vip_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 254),
  type text not null check (type in ('affiliation', 'abonnement')),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  constraint vip_invitation_valid_interval check (expires_at > created_at)
);
create index vip_invitations_email_idx on public.vip_invitations(email, created_at desc);

create table public.vip_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 254),
  type text not null check (type in ('affiliation', 'abonnement')),
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'suspended')),
  renewal_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vip_membership_expiry check (
    (type = 'affiliation' and expires_at is null)
    or (type = 'abonnement' and expires_at is not null and expires_at > started_at)
  )
);
create index vip_memberships_expiry_idx on public.vip_memberships(expires_at) where type = 'abonnement' and status = 'active';
create index vip_memberships_email_idx on public.vip_memberships(email);

create table public.vip_settings (
  id smallint primary key default 1 check (id = 1),
  telegram_invite_url text check (telegram_invite_url is null or length(telegram_invite_url) <= 2048),
  updated_at timestamptz not null default now()
);
insert into public.vip_settings(id) values (1);

create table public.vip_posts (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('signal', 'analysis', 'followup', 'partnership')),
  title text not null check (length(btrim(title)) between 1 and 160),
  body text not null check (length(btrim(body)) between 1 and 12000),
  symbol text check (symbol is null or length(symbol) between 1 and 32),
  direction text check (direction is null or direction in ('buy', 'sell')),
  levels jsonb not null default '{}'::jsonb check (jsonb_typeof(levels) = 'object'),
  image_url text check (image_url is null or length(image_url) <= 4096),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published boolean not null default false
);
create index vip_posts_recent_idx on public.vip_posts(created_at desc) where published;

create table public.vip_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 10 and 4096 and endpoint like 'https://%'),
  p256dh text not null check (length(p256dh) between 1 and 256),
  auth text not null check (length(auth) between 1 and 128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vip_push_subscriptions_user_idx on public.vip_push_subscriptions(user_id);

create table public.vip_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null unique check (length(event_key) between 1 and 240),
  title text not null check (length(title) between 1 and 160),
  message text not null check (length(message) <= 500),
  href text not null default '/dashboard/vip' check (href like '/dashboard/%' and length(href) <= 250),
  kind text not null check (kind in ('publication', 'renewal')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vip_notification_pending_idx on public.vip_notification_outbox(status, updated_at, created_at) where status in ('pending', 'failed', 'processing');

alter table public.vip_invitations enable row level security;
alter table public.vip_memberships enable row level security;
alter table public.vip_settings enable row level security;
alter table public.vip_posts enable row level security;
alter table public.vip_push_subscriptions enable row level security;
alter table public.vip_notification_outbox enable row level security;

revoke all on public.vip_invitations, public.vip_memberships, public.vip_settings, public.vip_posts, public.vip_push_subscriptions, public.vip_notification_outbox from anon, authenticated;
grant select, insert, update, delete on public.vip_invitations, public.vip_memberships, public.vip_settings, public.vip_posts, public.vip_push_subscriptions, public.vip_notification_outbox to service_role;
grant select on public.vip_memberships, public.vip_posts to authenticated;

create policy vip_membership_own_read on public.vip_memberships for select to authenticated
  using ((select auth.uid()) = user_id);

-- Expiry is enforced at query time. Hiding a client tab or waiting for cron is not authorization.
create policy vip_posts_active_member_read on public.vip_posts for select to authenticated
  using (
    published and exists (
      select 1 from public.vip_memberships as member
      where member.user_id = (select auth.uid())
        and member.status = 'active'
        and member.started_at <= now()
        and (
          (member.type = 'affiliation' and member.expires_at is null)
          or (member.type = 'abonnement' and member.expires_at > now())
        )
    )
  );

create function public.vip_redeem_invitation(p_code_hash text, p_user_id uuid, p_email text, p_email_confirmed_at timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_invitation public.vip_invitations%rowtype;
  v_member public.vip_memberships%rowtype;
  v_email text;
  v_now timestamptz;
begin
  if p_user_id is null or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'vip_invitation_invalid';
  end if;
  -- The same lock is used by all membership mutations for this account.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  -- These identity fields come only from server-side auth.getUser(). This RPC is service-only.
  -- The service role cannot SELECT auth.users; no auth-schema grant or definer escalation is needed.
  v_email := lower(btrim(p_email));
  if v_email is null or v_email = '' or p_email_confirmed_at is null then
    raise exception 'vip_email_unconfirmed';
  end if;
  select * into v_invitation from public.vip_invitations
    where code_hash = p_code_hash for update;
  v_now := clock_timestamp();
  if not found or v_invitation.email <> v_email or v_invitation.expires_at <= v_now
    or v_invitation.revoked_at is not null or v_invitation.redeemed_at is not null then
    raise exception 'vip_invitation_unavailable';
  end if;
  if exists (select 1 from public.vip_memberships where user_id = p_user_id) then
    raise exception 'vip_membership_exists';
  end if;
  insert into public.vip_memberships(user_id, email, type, started_at, expires_at, status, created_at, updated_at)
  values (
    p_user_id, v_email, v_invitation.type, v_now,
    case when v_invitation.type = 'abonnement' then ((v_now at time zone 'UTC') + interval '1 month') at time zone 'UTC' else null end,
    'active', v_now, v_now
  ) returning * into v_member;
  update public.vip_invitations set redeemed_at = v_now, redeemed_by = p_user_id where id = v_invitation.id;
  return to_jsonb(v_member);
end;
$$;
revoke all on function public.vip_redeem_invitation(text, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.vip_redeem_invitation(text, uuid, text, timestamptz) to service_role;

create function public.vip_admin_membership_action(p_user_id uuid, p_action text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_member public.vip_memberships%rowtype;
  v_now timestamptz;
  v_base timestamptz;
begin
  if p_user_id is null or p_action is null or p_action not in ('renew', 'suspend', 'resume') then
    raise exception 'vip_action_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  select * into v_member from public.vip_memberships where user_id = p_user_id for update;
  if not found then raise exception 'vip_membership_missing'; end if;
  v_now := clock_timestamp();
  if p_action = 'renew' then
    if v_member.type <> 'abonnement' then raise exception 'vip_subscription_required'; end if;
    v_base := greatest(v_now, v_member.expires_at);
    update public.vip_memberships set
      expires_at = ((v_base at time zone 'UTC') + interval '1 month') at time zone 'UTC',
      status = 'active', renewal_requested_at = null, updated_at = v_now
      where user_id = p_user_id returning * into v_member;
  else
    -- Resume only lifts suspension. An expired subscription remains expired.
    update public.vip_memberships set status = case when p_action = 'suspend' then 'suspended' else 'active' end,
      updated_at = v_now where user_id = p_user_id returning * into v_member;
  end if;
  return to_jsonb(v_member);
end;
$$;
revoke all on function public.vip_admin_membership_action(uuid, text) from public, anon, authenticated;
grant execute on function public.vip_admin_membership_action(uuid, text) to service_role;

create function public.vip_request_renewal(p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_member public.vip_memberships%rowtype;
begin
  if p_user_id is null then raise exception 'vip_membership_missing'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  select * into v_member from public.vip_memberships where user_id = p_user_id for update;
  if not found then raise exception 'vip_membership_missing'; end if;
  if v_member.type <> 'abonnement' then raise exception 'vip_subscription_required'; end if;
  update public.vip_memberships set renewal_requested_at = coalesce(renewal_requested_at, now()),
    updated_at = case when renewal_requested_at is null then now() else updated_at end
    where user_id = p_user_id returning * into v_member;
  return to_jsonb(v_member);
end;
$$;
revoke all on function public.vip_request_renewal(uuid) from public, anon, authenticated;
grant execute on function public.vip_request_renewal(uuid) to service_role;

create function public.vip_claim_notifications(p_limit integer default 50)
returns setof public.vip_notification_outbox language sql security invoker set search_path = '' as $$
  with candidates as (
    select id from public.vip_notification_outbox
    where attempts < 3 and (
      status in ('pending', 'failed')
      or (status = 'processing' and updated_at < now() - interval '10 minutes')
    )
    order by created_at, id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  )
  update public.vip_notification_outbox as notification
    set status = 'processing', attempts = attempts + 1, updated_at = now()
    from candidates where notification.id = candidates.id
    returning notification.*;
$$;
revoke all on function public.vip_claim_notifications(integer) from public, anon, authenticated;
grant execute on function public.vip_claim_notifications(integer) to service_role;

create function public.vip_register_push(p_user_id uuid, p_endpoint text, p_p256dh text, p_auth text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_owner uuid;
begin
  if p_user_id is null or p_endpoint is null or length(p_endpoint) > 4096 or p_endpoint not like 'https://%'
    or p_p256dh is null or length(p_p256dh) not between 1 and 256
    or p_auth is null or length(p_auth) not between 1 and 128 then
    raise exception 'vip_push_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  select user_id into v_owner from public.vip_push_subscriptions where endpoint = p_endpoint;
  if found and v_owner <> p_user_id then raise exception 'vip_push_endpoint_owned'; end if;
  if not found and (select count(*) from public.vip_push_subscriptions where user_id = p_user_id) >= 10 then
    raise exception 'vip_push_limit';
  end if;
  insert into public.vip_push_subscriptions(user_id, endpoint, p256dh, auth)
    values (p_user_id, p_endpoint, p_p256dh, p_auth)
    on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, updated_at = now()
      where public.vip_push_subscriptions.user_id = excluded.user_id
    returning id into v_id;
  if v_id is null then raise exception 'vip_push_endpoint_owned'; end if;
  return v_id;
end;
$$;
revoke all on function public.vip_register_push(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.vip_register_push(uuid, text, text, text) to service_role;

-- Invoked by the authenticated service-only publication endpoint. Content remains in vip_posts.
CREATE OR REPLACE FUNCTION public.vip_queue_publication_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.published THEN
    INSERT INTO public.investpro_notifications(user_id,event_key,title,message,href)
    SELECT user_id,'vip:post:'||NEW.id::text||':'||user_id::text,'InvestPro VIP · Nouvelle publication',
      CASE NEW.category WHEN 'signal' THEN 'Un nouveau signal est disponible dans votre espace privé.' WHEN 'analysis' THEN 'Une nouvelle analyse est disponible dans votre espace privé.' WHEN 'partnership' THEN 'Une nouvelle présentation de partenariat est disponible.' ELSE 'Une nouvelle mise à jour est disponible dans votre espace privé.' END,
      '/dashboard/vip'
    FROM public.vip_memberships
    WHERE status='active' AND started_at<=now() AND (expires_at IS NULL OR expires_at>now())
    ON CONFLICT(event_key) DO NOTHING;
    INSERT INTO public.vip_notification_outbox(user_id,event_key,title,message,href,kind)
    SELECT user_id,'vip:post:'||NEW.id::text||':'||user_id::text,'InvestPro VIP · Nouvelle publication',
      CASE NEW.category WHEN 'signal' THEN 'Un nouveau signal est disponible dans votre espace privé.' WHEN 'analysis' THEN 'Une nouvelle analyse est disponible dans votre espace privé.' WHEN 'partnership' THEN 'Une nouvelle présentation de partenariat est disponible.' ELSE 'Une nouvelle mise à jour est disponible dans votre espace privé.' END,
      '/dashboard/vip','publication'
    FROM public.vip_memberships
    WHERE status='active' AND started_at<=now() AND (expires_at IS NULL OR expires_at>now())
    ON CONFLICT(event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.vip_queue_publication_notice() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vip_queue_publication_notice() TO service_role;
CREATE TRIGGER vip_post_notification_insert AFTER INSERT ON public.vip_posts
FOR EACH ROW EXECUTE FUNCTION public.vip_queue_publication_notice();

CREATE OR REPLACE FUNCTION public.vip_enqueue_due_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE inserted_count integer;
BEGIN
  INSERT INTO public.vip_notification_outbox(user_id,event_key,title,message,href,kind)
  SELECT user_id,'vip:renewal:'||user_id::text||':'||expires_at::text||':'||CASE WHEN expires_at<=now() THEN 'expired' ELSE 'j3' END,
    CASE WHEN expires_at<=now() THEN 'InvestPro VIP · Abonnement arrivé à échéance' ELSE 'InvestPro VIP · Renouvellement à prévoir' END,
    CASE WHEN expires_at<=now() THEN 'Votre accès VIP est arrivé à échéance. Demandez son renouvellement à l’équipe.' ELSE 'Votre abonnement VIP arrive à échéance dans moins de trois jours. Retrouvez la date et demandez son renouvellement dans votre espace.' END,
    '/dashboard/vip','renewal'
  FROM public.vip_memberships
  WHERE type='abonnement' AND status='active' AND started_at<=now() AND expires_at IS NOT NULL
    AND expires_at<=now()+interval '3 days' AND expires_at>now()-interval '7 days'
  ON CONFLICT(event_key) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  INSERT INTO public.investpro_notifications(user_id,event_key,title,message,href)
  SELECT user_id,event_key,title,message,href FROM public.vip_notification_outbox
  WHERE kind='renewal' AND created_at>now()-interval '8 days'
  ON CONFLICT(event_key) DO NOTHING;
  RETURN inserted_count;
END;
$$;
REVOKE ALL ON FUNCTION public.vip_enqueue_due_reminders() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vip_enqueue_due_reminders() TO service_role;

commit;
