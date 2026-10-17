-- VIP common chat. Browser roles have no direct table or RPC access.
-- The server validates getUser + confirmed email + current VIP/admin access for every operation.
create table public.vip_chat_messages (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null,
  body text not null,
  author_name text not null check (char_length(author_name) between 1 and 60),
  admin_author boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  unique(author_id, client_id),
  constraint vip_chat_body_length check (
    (deleted_at is null and char_length(btrim(body)) between 1 and 2000 and octet_length(body) <= 8000)
    or (deleted_at is not null and body = '')
  )
);

alter table public.vip_chat_messages enable row level security;
revoke all on table public.vip_chat_messages from public, anon, authenticated;
grant select, insert, update, delete on table public.vip_chat_messages to service_role;
-- No permissive RLS policies: direct browser reads/writes stay denied even if grants drift.
create index vip_chat_messages_page_idx on public.vip_chat_messages (created_at desc, id desc) where deleted_at is null;
create index vip_chat_messages_author_time_idx on public.vip_chat_messages (author_id, created_at desc);

create function public.vip_chat_send(
  p_author_id uuid, p_client_id uuid, p_body text, p_author_name text, p_admin_author boolean
) returns setof public.vip_chat_messages
language plpgsql security invoker set search_path = '' as $$
declare
  existing public.vip_chat_messages%rowtype;
  current_time_at timestamptz;
  recent_count integer;
  latest_message_at timestamptz;
begin
  if p_author_id is null or p_client_id is null or p_body is null or char_length(btrim(p_body)) not between 1 and 2000
    or octet_length(p_body) > 8000 or p_author_name is null or char_length(btrim(p_author_name)) not between 1 and 60 or p_admin_author is null then
    raise exception 'vip_chat_invalid_input';
  end if;
  -- Serializes posts per author across workers; retries are resolved before rate accounting.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vip_chat:' || p_author_id::text, 0));
  select * into existing from public.vip_chat_messages where author_id = p_author_id and client_id = p_client_id;
  if found then
    if existing.deleted_at is not null then raise exception 'vip_chat_message_deleted'; end if;
    if existing.body <> p_body then raise exception 'vip_chat_client_conflict'; end if;
    return next existing;
    return;
  end if;
  current_time_at := pg_catalog.clock_timestamp();
  select count(*), max(created_at) into recent_count, latest_message_at
    from public.vip_chat_messages where author_id = p_author_id and created_at > current_time_at - interval '1 minute';
  if recent_count >= 10 or latest_message_at > current_time_at - interval '3 seconds' then
    raise exception 'vip_chat_rate_limited';
  end if;
  -- Deleted messages still count towards the posting limit, so deletion cannot bypass it.
  return query insert into public.vip_chat_messages(author_id, client_id, body, author_name, admin_author, created_at)
    values(p_author_id, p_client_id, p_body, p_author_name, p_admin_author, current_time_at)
    returning *;
end;
$$;

revoke all on function public.vip_chat_send(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.vip_chat_send(uuid, uuid, text, text, boolean) to service_role;
comment on table public.vip_chat_messages is 'Private VIP group text chat; server-authorized only. Deleted bodies are cleared; tombstones preserve rate limits and idempotency.';
notify pgrst, 'reload schema';
