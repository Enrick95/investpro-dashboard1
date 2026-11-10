-- Programme clippeurs (investprotrading.fr/clip) : campagnes, clippeurs, comptes,
-- candidatures, clips soumis et paiements. Accès uniquement par les routes serveur
-- (service_role) : aucune lecture directe depuis le navigateur.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

create sequence public.clip_clipper_ref_seq start with 1;
create sequence public.clip_clip_ref_seq start with 100;
create sequence public.clip_payout_ref_seq start with 400;

create table public.clip_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 3 and 80),
  platforms text not null default 'TikTok · Shorts · Reels' check (length(btrim(platforms)) between 2 and 80),
  brief text not null default '' check (length(brief) <= 2000),
  forbidden text not null default '' check (length(forbidden) <= 600),
  rushes_url text check (rushes_url is null or (rushes_url ~ '^https://' and length(rushes_url) <= 500)),
  starts_on date not null,
  ends_on date not null,
  quota_per_clipper integer not null default 10 check (quota_per_clipper between 1 and 500),
  rate_per_1000 numeric(8,2) not null default 1.00 check (rate_per_1000 between 0 and 100),
  min_views integer not null default 8000 check (min_views between 0 and 10000000),
  max_per_clip numeric(10,2) not null default 150 check (max_per_clip between 0 and 100000),
  vip_bonus numeric(10,2) not null default 20 check (vip_bonus between 0 and 10000),
  status text not null default 'active' check (status in ('draft','active','ended')),
  created_at timestamptz not null default now(),
  constraint clip_campaign_dates check (ends_on >= starts_on)
);
create index clip_campaigns_status_start on public.clip_campaigns(status, starts_on desc);

create table public.clip_clippers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  ref text not null unique default ('CR-' || lpad(nextval('public.clip_clipper_ref_seq')::text, 3, '0')),
  display_name text not null check (length(btrim(display_name)) between 2 and 60),
  whatsapp text check (whatsapp is null or whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  telegram text check (telegram is null or telegram ~ '^[A-Za-z0-9_]{4,32}$'),
  tracking_code text not null unique check (tracking_code ~ '^[a-z0-9-]{3,40}$'),
  status text not null default 'test' check (status in ('test','active','paused')),
  payout_method text check (payout_method is null or payout_method in ('usdt_trc20','wise','paypal','sepa')),
  payout_details text check (payout_details is null or length(payout_details) <= 200),
  admin_note text check (admin_note is null or length(admin_note) <= 1000),
  created_at timestamptz not null default now()
);

create table public.clip_accounts (
  id uuid primary key default gen_random_uuid(),
  clipper_id uuid not null references public.clip_clippers(id) on delete cascade,
  platform text not null check (platform in ('tiktok','instagram','youtube')),
  handle text not null check (handle ~ '^[a-z0-9._-]{2,40}$'),
  followers integer check (followers is null or followers between 0 and 1000000000),
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  constraint clip_accounts_platform_handle unique (platform, handle)
);
create index clip_accounts_clipper on public.clip_accounts(clipper_id);

create table public.clip_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text check (email is null or length(email) <= 254),
  display_name text not null check (length(btrim(display_name)) between 2 and 60),
  whatsapp text not null check (whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  telegram text check (telegram is null or telegram ~ '^[A-Za-z0-9_]{4,32}$'),
  accounts text not null check (length(btrim(accounts)) between 3 and 400),
  availability text not null check (length(btrim(availability)) between 1 and 60),
  sample_url text check (sample_url is null or (sample_url ~ '^https://' and length(sample_url) <= 500)),
  message text check (message is null or length(message) <= 600),
  source text not null default 'form' check (source in ('form','whatsapp')),
  status text not null default 'new' check (status in ('new','accepted','refused')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index clip_candidates_one_open on public.clip_candidates(user_id) where status = 'new';
create index clip_candidates_status_created on public.clip_candidates(status, created_at desc);

create table public.clip_payouts (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('PY-' || lpad(nextval('public.clip_payout_ref_seq')::text, 4, '0')),
  clipper_id uuid not null references public.clip_clippers(id) on delete restrict,
  cycle_start date not null,
  cycle_end date not null,
  clips_count integer not null default 0 check (clips_count >= 0),
  views_total bigint not null default 0 check (views_total >= 0),
  base_amount numeric(10,2) not null default 0 check (base_amount >= 0),
  bonus_amount numeric(10,2) not null default 0 check (bonus_amount >= 0),
  deduction_amount numeric(10,2) not null default 0 check (deduction_amount >= 0),
  total numeric(10,2) not null check (total >= 0),
  method text check (method is null or length(method) <= 60),
  proof text check (proof is null or length(proof) <= 300),
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index clip_payouts_clipper_paid on public.clip_payouts(clipper_id, paid_at desc);

create table public.clip_clips (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('CL-' || nextval('public.clip_clip_ref_seq')::text),
  clipper_id uuid not null references public.clip_clippers(id) on delete cascade,
  campaign_id uuid not null references public.clip_campaigns(id) on delete restrict,
  platform text not null check (platform in ('tiktok','instagram','youtube')),
  url text not null unique check (url ~ '^https://' and length(url) <= 500),
  title text not null check (length(btrim(title)) between 2 and 120),
  published_at timestamptz not null,
  status text not null default 'review' check (status in ('review','approved','rejected')),
  reject_reason text check (reject_reason is null or length(reject_reason) <= 200),
  views bigint not null default 0 check (views >= 0),
  views_updated_at timestamptz,
  frozen_views bigint check (frozen_views is null or frozen_views >= 0),
  frozen_at timestamptz,
  payout_id uuid references public.clip_payouts(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint clip_clips_reject_reason check (status <> 'rejected' or reject_reason is not null)
);
create index clip_clips_clipper_created on public.clip_clips(clipper_id, created_at desc);
create index clip_clips_status_created on public.clip_clips(status, created_at);
create index clip_clips_to_freeze on public.clip_clips(published_at) where status = 'approved' and frozen_views is null;

alter table public.clip_campaigns enable row level security;
alter table public.clip_clippers enable row level security;
alter table public.clip_accounts enable row level security;
alter table public.clip_candidates enable row level security;
alter table public.clip_payouts enable row level security;
alter table public.clip_clips enable row level security;

revoke all on public.clip_campaigns, public.clip_clippers, public.clip_accounts, public.clip_candidates, public.clip_payouts, public.clip_clips from public, anon, authenticated;
grant select, insert, update, delete on public.clip_campaigns, public.clip_clippers, public.clip_accounts, public.clip_candidates, public.clip_payouts, public.clip_clips to service_role;

revoke all on sequence public.clip_clipper_ref_seq, public.clip_clip_ref_seq, public.clip_payout_ref_seq from public, anon, authenticated;
grant usage, select on sequence public.clip_clipper_ref_seq, public.clip_clip_ref_seq, public.clip_payout_ref_seq to service_role;

commit;
