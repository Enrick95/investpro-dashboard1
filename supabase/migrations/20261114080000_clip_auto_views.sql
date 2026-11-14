begin;

-- Vues relevées automatiquement sur la page publique du clip (TikTok, YouTube).
-- views_auto_at : dernière tentative de relevé ; views_auto_error : motif du dernier échec (null si réussi).
alter table public.clip_clips
  add column if not exists views_auto_at timestamptz,
  add column if not exists views_auto_error text check (views_auto_error is null or length(views_auto_error) <= 40);

create index if not exists clip_clips_views_auto on public.clip_clips (views_auto_at nulls first) where status <> 'rejected';

commit;
