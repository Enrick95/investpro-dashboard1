-- Captures des stats : l'envoi est d'abord réservé (ligne sans confirmed_at),
-- puis confirmé une fois l'image reçue et vérifiée. Les réservations jamais
-- terminées (réseau coupé, appli fermée) sont retirées au bout de 15 min,
-- et elles comptent dans la limite de 6 captures par clip.
alter table public.clip_captures add column if not exists confirmed_at timestamptz;

create index if not exists clip_captures_pending_idx
  on public.clip_captures (clipper_id, created_at)
  where confirmed_at is null;
