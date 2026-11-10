-- Limite des inscriptions directes à l'espace clippeurs (adresse IP hachée, purgée après 2 jours).
create table public.clip_signup_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null check (char_length(ip_hash) between 8 and 64),
  created_at timestamptz not null default now()
);

create index clip_signup_attempts_ip_created on public.clip_signup_attempts(ip_hash, created_at desc);
create index clip_signup_attempts_created on public.clip_signup_attempts(created_at);

alter table public.clip_signup_attempts enable row level security;
revoke all on public.clip_signup_attempts from public, anon, authenticated;
grant select, insert, delete on public.clip_signup_attempts to service_role;
grant usage, select on sequence public.clip_signup_attempts_id_seq to service_role;
