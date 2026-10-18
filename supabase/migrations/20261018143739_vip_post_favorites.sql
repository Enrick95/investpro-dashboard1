begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

-- Private, per-account saves. Existing posts, reactions and membership data stay intact.
create table public.vip_post_favorites (
  post_id uuid not null references public.vip_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index vip_post_favorites_user_page_idx
  on public.vip_post_favorites(user_id, created_at desc, post_id desc);
alter table public.vip_post_favorites enable row level security;
revoke all on public.vip_post_favorites from public, anon, authenticated;
grant select, insert, delete on public.vip_post_favorites to service_role;

-- Only the verified member API can call this invoker function. Identity and admin
-- permission are derived on the server; the browser supplies only the saved state.
create function public.vip_set_post_favorite(
  p_post_id uuid,
  p_user_id uuid,
  p_favorite boolean,
  p_is_admin boolean default false
) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  if p_post_id is null or p_user_id is null or p_favorite is null then
    raise exception 'vip_favorite_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('favorite:' || p_post_id::text || ':' || p_user_id::text, 0)
  );
  if not coalesce(p_is_admin, false) then
    perform 1 from public.vip_memberships as member
    where member.user_id = p_user_id and member.status = 'active' and member.started_at <= now()
      and ((member.type = 'affiliation' and member.expires_at is null)
        or (member.type = 'abonnement' and member.expires_at > now()))
    for share;
    if not found then raise exception 'vip_access_inactive'; end if;
  end if;
  if p_favorite then
    -- Serialize with edit/delete so an unpublished or deleted post cannot be saved.
    perform 1 from public.vip_posts where id = p_post_id and published for share;
    if not found then raise exception 'vip_post_unavailable'; end if;
    insert into public.vip_post_favorites(post_id, user_id)
      values (p_post_id, p_user_id) on conflict (post_id, user_id) do nothing;
  else
    -- A member may remove their own save after the team unpublishes that post.
    -- No content, metadata or existence information about the post is returned.
    delete from public.vip_post_favorites where post_id = p_post_id and user_id = p_user_id;
  end if;
  return p_favorite;
end;
$$;
revoke all on function public.vip_set_post_favorite(uuid, uuid, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.vip_set_post_favorite(uuid, uuid, boolean, boolean)
  to service_role;

-- Saves are personal state: deliberately no notification or outbound-message trigger.
notify pgrst, 'reload schema';
commit;
