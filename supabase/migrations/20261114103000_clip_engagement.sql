-- Engagement des clips TikTok, relevé en même temps que les vues sur la page publique
-- de la vidéo : j'aime, commentaires, partages et enregistrements.
-- Vide (null) tant que rien n'est relevé, et pour les réseaux qui ne les montrent pas.
alter table public.clip_clips
  add column if not exists likes bigint check (likes is null or likes >= 0),
  add column if not exists comments bigint check (comments is null or comments >= 0),
  add column if not exists shares bigint check (shares is null or shares >= 0),
  add column if not exists saves bigint check (saves is null or saves >= 0),
  add column if not exists engagement_at timestamptz;
