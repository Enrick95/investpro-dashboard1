begin;

create table if not exists public.copier_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists copier_push_subscriptions_user_idx
  on public.copier_push_subscriptions(user_id);

alter table public.copier_push_subscriptions enable row level security;
revoke all on public.copier_push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.copier_push_subscriptions to service_role;

create table if not exists public.copier_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('email', 'push')),
  title text not null,
  message text not null,
  href text not null default '/dashboard/copieur',
  status text not null check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_key, user_id, channel)
);

create index if not exists copier_notification_deliveries_recent_idx
  on public.copier_notification_deliveries(status, updated_at desc);

create table if not exists public.investpro_announcements (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  admin_user_id uuid not null,
  title text not null,
  message text not null,
  href text not null default '/dashboard',
  recipient_count integer not null default 0,
  push_recipient_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists investpro_announcements_recent_idx
  on public.investpro_announcements(created_at desc);

alter table public.copier_notification_deliveries enable row level security;
revoke all on public.copier_notification_deliveries from anon, authenticated;
grant select, insert, update on public.copier_notification_deliveries to service_role;

alter table public.investpro_announcements enable row level security;
revoke all on public.investpro_announcements from anon, authenticated;
grant select, insert, update on public.investpro_announcements to service_role;

commit;
