-- Copie du compte d'Enrick (onglet « Copie » de l'espace VIP, en mode Bientôt) : les membres VIP qui demandent
-- à être prévenus de l'ouverture. Lue et écrite uniquement par l'API /api/vip/copie (clé de service).
create table if not exists public.vip_copy_interest (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.vip_copy_interest enable row level security;
revoke all on public.vip_copy_interest from anon, authenticated;
