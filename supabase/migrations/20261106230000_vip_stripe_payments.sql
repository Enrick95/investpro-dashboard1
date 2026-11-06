-- Paiements Stripe de l'abonnement VIP : chaque paiement donne automatiquement un lien d'accès au canal.
create table if not exists public.vip_stripe_payments (
  id uuid primary key default gen_random_uuid(),
  checkout_session_id text not null unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  email text,
  full_name text,
  phone text,
  telegram_username text,
  amount_total integer,
  currency text,
  status text not null default 'active' check (status in ('active','past_due','canceled')),
  invite_url text,
  invite_created_at timestamptz,
  channel_joined_at timestamptz,
  channel_user_id bigint,
  channel_username text,
  removed_at timestamptz,
  last_payment_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vip_stripe_payments_subscription_idx on public.vip_stripe_payments (stripe_subscription_id);
create index if not exists vip_stripe_payments_invite_idx on public.vip_stripe_payments (invite_url);
create index if not exists vip_stripe_payments_email_idx on public.vip_stripe_payments (lower(email));
-- Accès réservé au serveur (clé service) : aucune lecture ni écriture depuis le navigateur.
alter table public.vip_stripe_payments enable row level security;
revoke all on public.vip_stripe_payments from anon, authenticated;
