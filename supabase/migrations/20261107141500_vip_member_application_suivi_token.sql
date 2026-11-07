-- Suivi d'une demande « nouveau membre » : le navigateur du client garde un jeton privé.
-- Seule son empreinte SHA-256 est stockée. Le jeton ne donne que l'état du dossier, jamais le lien du canal.
alter table public.vip_member_applications
  add column if not exists suivi_token_hash text check (suivi_token_hash is null or suivi_token_hash ~ '^[0-9a-f]{64}$');

create unique index if not exists vip_member_applications_suivi_token_hash_key
  on public.vip_member_applications (suivi_token_hash)
  where suivi_token_hash is not null;
