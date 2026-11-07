-- Compte InvestPro créé à la validation d'une demande « nouveau membre » : identifiant = e-mail, code envoyé par e-mail.
-- Le code n'est jamais stocké. Seul le lien compte <-> demande est gardé, pour renvoyer un code valide sans créer de doublon.
alter table public.vip_member_applications
  add column if not exists account_user_id uuid references auth.users(id) on delete set null,
  add column if not exists account_created boolean not null default false;
