-- Paiement à chaque clip validé (montant choisi à la validation, bonus possible),
-- rubrique Vidéos (rushs à clipper) et parrainage entre clippeurs.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

-- Montant proposé par défaut quand Enrick valide un clip de la campagne.
alter table public.clip_campaigns
  add column amount_per_clip numeric(10,2) not null default 7 check (amount_per_clip between 0 and 1000);

-- Ce que rapporte le clip : fixé à la validation, plus un bonus éventuel.
alter table public.clip_clips
  add column amount numeric(10,2) check (amount is null or amount between 0 and 10000),
  add column bonus numeric(10,2) not null default 0 check (bonus between 0 and 10000);

-- Parrainage : qui a fait venir le clippeur, et dans quel versement sa prime a été payée.
alter table public.clip_candidates
  add column referred_by uuid references public.clip_clippers(id) on delete set null;
alter table public.clip_clippers
  add column referred_by uuid references public.clip_clippers(id) on delete set null,
  add column referral_payout_id uuid references public.clip_payouts(id) on delete set null,
  add constraint clip_clippers_no_self_referral check (referred_by is null or referred_by <> id);
create index clip_clippers_referred_by on public.clip_clippers(referred_by) where referred_by is not null;

alter table public.clip_payouts
  add column referral_amount numeric(10,2) not null default 0 check (referral_amount >= 0);

-- Vidéos d'Enrick à clipper (les fichiers restent sur son Drive).
create table public.clip_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 2 and 120),
  note text check (note is null or length(note) <= 600),
  url text not null check (url ~ '^https://' and length(url) <= 500),
  campaign_id uuid references public.clip_campaigns(id) on delete set null,
  created_at timestamptz not null default now()
);
create index clip_videos_created on public.clip_videos(created_at desc);

alter table public.clip_videos enable row level security;
revoke all on public.clip_videos from public, anon, authenticated;
grant select, insert, update, delete on public.clip_videos to service_role;

commit;
