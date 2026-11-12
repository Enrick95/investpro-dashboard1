begin;

-- E-mail à chaque nouvelle vidéo : activé par défaut, le clippeur peut le couper (profil ou lien du mail).
alter table public.clip_clippers add column if not exists notify_email boolean not null default true;

-- Téléphones (et navigateurs) des clippeurs abonnés aux notifications.
-- home : l'adresse de leur espace sur l'appareil (/login sur investproclip.com, /clip/login ailleurs).
create table if not exists public.clip_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  clipper_id uuid not null references public.clip_clippers(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 4096),
  p256dh text not null check (length(p256dh) between 80 and 100),
  auth text not null check (length(auth) between 20 and 30),
  home text not null default '/login' check (home in ('/login', '/clip/login')),
  user_agent text check (user_agent is null or length(user_agent) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clip_push_subscriptions_clipper on public.clip_push_subscriptions(clipper_id);

alter table public.clip_push_subscriptions enable row level security;
revoke all on public.clip_push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.clip_push_subscriptions to service_role;

-- Bilan de l'envoi pour chaque vidéo publiée : une seule vague, jamais renvoyée quand on modifie la vidéo.
alter table public.clip_videos
  add column if not exists notified_at timestamptz,
  add column if not exists notified_push integer check (notified_push is null or notified_push >= 0),
  add column if not exists notified_email integer check (notified_email is null or notified_email >= 0);

commit;
