begin;

-- Additive and compatible with the current publication endpoint. Existing rows and image URLs stay intact.
alter table public.vip_posts add column image_path text;
alter table public.vip_posts add constraint vip_posts_image_path_check check (
  image_path is null or image_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$'
);
alter table public.vip_posts drop constraint vip_posts_category_check;
alter table public.vip_posts add constraint vip_posts_category_check
  check (category in ('signal', 'analysis', 'performance', 'followup', 'partnership'));
alter table public.vip_posts drop constraint vip_posts_body_check;
alter table public.vip_posts add constraint vip_posts_body_check
  check (length(btrim(body)) <= 12000 and (length(btrim(body)) > 0 or image_path is not null or image_url is not null));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('vip-post-media', 'vip-post-media', false, 4194304, array['image/jpeg', 'image/png', 'image/webp']);
-- Deliberately no storage.objects client policy for this bucket. Only the authenticated admin API
-- uploads with the service role; active VIP/admin API responses issue temporary signed read URLs.

create table public.vip_post_reactions (
  post_id uuid not null references public.vip_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('like', 'fire', 'heart')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index vip_post_reactions_user_idx on public.vip_post_reactions(user_id);
alter table public.vip_post_reactions enable row level security;
revoke all on public.vip_post_reactions from public, anon, authenticated;
grant select, insert, update, delete on public.vip_post_reactions to service_role;

-- Service-only aggregate: no user identities or raw reaction rows leave this function.
create function public.vip_post_reaction_summary(p_post_ids uuid[], p_user_id uuid)
returns table(post_id uuid, counts jsonb, mine text)
language sql stable security invoker set search_path = '' as $$
  select post.id,
    pg_catalog.jsonb_build_object(
      'like', count(reaction.user_id) filter (where reaction.reaction = 'like'),
      'fire', count(reaction.user_id) filter (where reaction.reaction = 'fire'),
      'heart', count(reaction.user_id) filter (where reaction.reaction = 'heart')
    ),
    max(reaction.reaction) filter (where reaction.user_id = p_user_id)
  from public.vip_posts as post
  left join public.vip_post_reactions as reaction on reaction.post_id = post.id
  where post.published and post.id = any(p_post_ids) and cardinality(p_post_ids) <= 100
  group by post.id;
$$;
revoke all on function public.vip_post_reaction_summary(uuid[], uuid) from public, anon, authenticated;
grant execute on function public.vip_post_reaction_summary(uuid[], uuid) to service_role;

-- IDs and the admin flag are derived from auth.getUser() and server-side permissions, never the payload.
create function public.vip_set_post_reaction(p_post_id uuid, p_user_id uuid, p_reaction text, p_is_admin boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_summary record;
begin
  if p_post_id is null or p_user_id is null or (p_reaction is not null and p_reaction not in ('like', 'fire', 'heart')) then
    raise exception 'vip_reaction_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_post_id::text || ':' || p_user_id::text, 0));
  if not coalesce(p_is_admin, false) and not exists (
    select 1 from public.vip_memberships as member
    where member.user_id = p_user_id and member.status = 'active' and member.started_at <= now()
      and ((member.type = 'affiliation' and member.expires_at is null)
        or (member.type = 'abonnement' and member.expires_at > now()))
  ) then raise exception 'vip_access_inactive'; end if;
  perform 1 from public.vip_posts where id = p_post_id and published for share;
  if not found then raise exception 'vip_post_unavailable'; end if;
  if p_reaction is null then
    delete from public.vip_post_reactions where post_id = p_post_id and user_id = p_user_id;
  else
    insert into public.vip_post_reactions(post_id, user_id, reaction)
      values (p_post_id, p_user_id, p_reaction)
      on conflict (post_id, user_id) do update
        set reaction = excluded.reaction, updated_at = now()
        where vip_post_reactions.reaction is distinct from excluded.reaction;
  end if;
  select * into v_summary from public.vip_post_reaction_summary(array[p_post_id], p_user_id);
  return pg_catalog.jsonb_build_object('counts', v_summary.counts, 'mine', v_summary.mine);
end;
$$;
revoke all on function public.vip_set_post_reaction(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.vip_set_post_reaction(uuid, uuid, text, boolean) to service_role;

-- The existing notification trigger remains INSERT-only: edits and reactions never queue an alert.
commit;
