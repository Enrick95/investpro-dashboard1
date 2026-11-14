begin;

-- Captures des statistiques d'un clip (vues, rétention, temps de visionnage…) envoyées par le clippeur.
-- Stockage privé : seuls le clippeur et l'admin les voient, par liens signés à durée limitée.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clip-analytics', 'clip-analytics', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.clip_captures (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references public.clip_clips(id) on delete cascade,
  clipper_id uuid not null references public.clip_clippers(id) on delete cascade,
  path text not null unique check (length(path) <= 300),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 8388608),
  created_at timestamptz not null default now()
);
create index if not exists clip_captures_clip on public.clip_captures (clip_id, created_at);
create index if not exists clip_captures_clipper on public.clip_captures (clipper_id, created_at desc);

alter table public.clip_captures enable row level security;
revoke all on public.clip_captures from public, anon, authenticated;
grant select, insert, update, delete on public.clip_captures to service_role;

commit;
