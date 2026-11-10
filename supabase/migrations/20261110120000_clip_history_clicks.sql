-- Historique des vues saisies (courbe « vues par jour ») et clics sur les liens traqués des clippeurs.
create table public.clip_view_snapshots (
  id bigint generated always as identity primary key,
  clip_id uuid not null references public.clip_clips(id) on delete cascade,
  views bigint not null check (views >= 0),
  recorded_at timestamptz not null default now()
);

create index clip_view_snapshots_recorded on public.clip_view_snapshots(recorded_at);
create index clip_view_snapshots_clip on public.clip_view_snapshots(clip_id, recorded_at);

create table public.clip_link_clicks (
  id bigint generated always as identity primary key,
  clipper_id uuid not null references public.clip_clippers(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index clip_link_clicks_clipper_created on public.clip_link_clicks(clipper_id, created_at desc);

create view public.clip_click_stats with (security_invoker = true) as
  select clipper_id,
         count(*)::bigint as total,
         (count(*) filter (where created_at > now() - interval '30 days'))::bigint as last30
  from public.clip_link_clicks
  group by clipper_id;

alter table public.clip_view_snapshots enable row level security;
alter table public.clip_link_clicks enable row level security;

revoke all on public.clip_view_snapshots, public.clip_link_clicks, public.clip_click_stats from public, anon, authenticated;
grant select, insert, delete on public.clip_view_snapshots, public.clip_link_clicks to service_role;
grant select on public.clip_click_stats to service_role;
grant usage, select on sequence public.clip_view_snapshots_id_seq, public.clip_link_clicks_id_seq to service_role;
