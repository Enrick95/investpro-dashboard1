-- REVIEW DRAFT ONLY. Not applied and not registered as a Supabase migration.
-- Generate the official migration with "supabase migration new vip_existing_members"
-- before moving this reviewed SQL into supabase/migrations.
-- Requires the existing private VIP and affiliation identity migrations.
begin;

create table public.vip_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null check (length(email) between 3 and 254),
  first_name text not null check (public.vip_identity_name_valid(first_name)),
  last_name text not null check (public.vip_identity_name_valid(last_name)),
  telegram_username text check (telegram_username is null or telegram_username ~ '^[a-z][a-z0-9_]{4,31}$'),
  type text not null check (type in ('affiliation', 'abonnement')),
  affiliation_broker text check (affiliation_broker is null or affiliation_broker in ('raise_fx', 'vantage', 'puprime', 'axi')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  verified_type text check (verified_type is null or verified_type in ('affiliation', 'abonnement')),
  verified_affiliation_broker text check (verified_affiliation_broker is null or verified_affiliation_broker in ('raise_fx', 'vantage', 'puprime', 'axi')),
  verified_expires_at timestamptz,
  constraint vip_request_origin check (type = 'affiliation' or affiliation_broker is null),
  constraint vip_request_review check (
    (status = 'pending' and reviewed_at is null and reviewed_by is null and verified_type is null and verified_affiliation_broker is null and verified_expires_at is null)
    or (status = 'denied' and reviewed_at is not null and reviewed_by is not null and verified_type is null and verified_affiliation_broker is null and verified_expires_at is null)
    or (status = 'approved' and reviewed_at is not null and reviewed_by is not null and verified_type is not null and
      ((verified_type = 'affiliation' and verified_affiliation_broker is not null and verified_expires_at is null)
       or (verified_type = 'abonnement' and verified_affiliation_broker is null and verified_expires_at is not null)))
  )
);

-- One pending application per verified account, even with simultaneous submissions.
create unique index vip_access_request_pending_user on public.vip_access_requests(user_id) where status = 'pending';
create index vip_access_request_owner_created on public.vip_access_requests(user_id, created_at desc);
create index vip_access_request_reviewer on public.vip_access_requests(reviewed_by);
create index vip_access_request_pending_created on public.vip_access_requests(created_at) where status = 'pending';
alter table public.vip_access_requests enable row level security;
revoke all on public.vip_access_requests from public, anon, authenticated;
grant select on public.vip_access_requests to authenticated;
grant select, insert, update, delete on public.vip_access_requests to service_role;
create policy vip_access_request_own_read on public.vip_access_requests for select to authenticated
  using ((select auth.uid()) = user_id);
-- Members have no insert/update/delete grants or policies. All submissions pass
-- verified getUser/email confirmation and a strict whitelist in the server API.
-- Administrative reads/writes use the existing users_write permission gate and
-- the server-only service role, never user_metadata or browser role fields.

create function public.vip_review_access_request(
  p_request_id uuid, p_action text, p_reviewed_by uuid,
  p_first_name text, p_last_name text, p_type text,
  p_affiliation_broker text, p_expires_at timestamptz
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_request public.vip_access_requests%rowtype;
  v_now timestamptz;
begin
  if p_request_id is null or p_reviewed_by is null or p_action is null or p_action not in ('approve', 'deny') then
    raise exception 'vip_request_approval_invalid';
  end if;
  select * into v_request from public.vip_access_requests where id = p_request_id for update;
  if not found or v_request.status <> 'pending' then raise exception 'vip_request_unavailable'; end if;
  v_now := clock_timestamp();
  if p_action = 'deny' then
    update public.vip_access_requests set status = 'denied', reviewed_at = v_now, reviewed_by = p_reviewed_by
      where id = p_request_id returning * into v_request;
    return to_jsonb(v_request);
  end if;
  if not public.vip_identity_name_valid(p_first_name) or not public.vip_identity_name_valid(p_last_name)
    or p_type is null or p_type not in ('affiliation', 'abonnement')
    or (p_type = 'affiliation' and (p_affiliation_broker is null or p_affiliation_broker not in ('raise_fx', 'vantage', 'puprime', 'axi') or p_expires_at is not null))
    or (p_type = 'abonnement' and (p_affiliation_broker is not null or p_expires_at is null or not isfinite(p_expires_at) or p_expires_at <= v_now))
  then raise exception 'vip_request_approval_invalid'; end if;

  -- Serialize approvals for the same account. The membership's unique user_id
  -- additionally makes any race with invitation redemption fail atomically.
  perform pg_advisory_xact_lock(hashtextextended(v_request.user_id::text, 0));
  if exists (select 1 from public.vip_memberships where user_id = v_request.user_id) then
    raise exception 'vip_membership_exists';
  end if;
  insert into public.vip_memberships(
    user_id, email, type, first_name, last_name, affiliation_broker,
    started_at, expires_at, status, created_at, updated_at
  ) values (
    v_request.user_id, v_request.email, p_type, p_first_name, p_last_name, p_affiliation_broker,
    v_now, p_expires_at, 'active', v_now, v_now
  );
  update public.vip_access_requests set status = 'approved', reviewed_at = v_now, reviewed_by = p_reviewed_by,
    verified_type = p_type, verified_affiliation_broker = p_affiliation_broker, verified_expires_at = p_expires_at
    where id = p_request_id returning * into v_request;
  -- This function sends no notifications, creates no invitation/token and never
  -- modifies an existing membership or a Telegram invitation setting.
  return to_jsonb(v_request);
exception when unique_violation then
  raise exception 'vip_membership_exists';
end;
$$;
revoke all on function public.vip_review_access_request(uuid, text, uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.vip_review_access_request(uuid, text, uuid, text, text, text, text, timestamptz) to service_role;

commit;
