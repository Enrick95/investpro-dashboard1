create table if not exists public.essai_vip_leads (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (char_length(nom) between 1 and 100),
  telegram text,
  telephone text,
  consentement_whatsapp boolean not null default false,
  broker text not null check (char_length(broker) between 1 and 80),
  compte text not null check (char_length(compte) between 1 and 64),
  serveur text not null check (char_length(serveur) between 1 and 128),
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'demo_active', 'completed', 'converted', 'lost')),
  temperature text not null default 'unclassified' check (temperature in ('unclassified', 'hot', 'warm', 'cold')),
  broker_affiliation_verified boolean not null default false,
  demo_account_verified boolean not null default false,
  copy_linked boolean not null default false,
  channel_joined boolean not null default false,
  copier_account_reference text check (copier_account_reference is null or char_length(copier_account_reference) <= 100),
  admin_notes text not null default '' check (char_length(admin_notes) <= 4000),
  next_follow_up_on date,
  last_contacted_at timestamptz,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint essai_vip_leads_contact_required check (telegram is not null or telephone is not null),
  constraint essai_vip_leads_whatsapp_consent check (telephone is null or consentement_whatsapp)
);

create index if not exists essai_vip_leads_status_submitted_idx on public.essai_vip_leads (status, submitted_at desc);
create index if not exists essai_vip_leads_follow_up_idx on public.essai_vip_leads (next_follow_up_on) where next_follow_up_on is not null;

alter table public.essai_vip_leads enable row level security;
revoke all on public.essai_vip_leads from public, anon, authenticated;
grant select, insert, update on public.essai_vip_leads to service_role;

comment on table public.essai_vip_leads is 'VIP demo trial lead tracker. The demo account password is intentionally not stored here.';
