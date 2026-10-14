-- Identity is descriptive only: no change to membership type, expiry, status or RLS.
begin;

create function public.vip_identity_name_valid(p_name text)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select coalesce(
    char_length(p_name) between 1 and 80
    and p_name = normalize(p_name, NFC)
    and p_name = btrim(p_name, U&'\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\202F\205F\3000')
    -- Control/format characters and line separators; NUL and surrogates cannot be stored as UTF-8 text.
    and p_name !~ U&'[\0001-\001F\007F-\009F\00AD\0600-\0605\061C\06DD\070F\0890-\0891\08E2\180E\200B-\200F\2028-\202E\2060-\2064\2066-\206F\FEFF\FFF9-\FFFB\+0110BD\+0110CD\+013430-\+01343F\+01BCA0-\+01BCA3\+01D173-\+01D17A\+0E0001\+0E0020-\+0E007F]',
    false
  );
$$;
revoke all on function public.vip_identity_name_valid(text) from public, anon, authenticated;
grant execute on function public.vip_identity_name_valid(text) to service_role;

alter table public.vip_invitations
  add column first_name text,
  add column last_name text,
  add column affiliation_broker text,
  add constraint vip_invitation_identity_pair check (
    (first_name is null and last_name is null)
    or (public.vip_identity_name_valid(first_name) and public.vip_identity_name_valid(last_name))
  ),
  add constraint vip_invitation_broker_known check (
    affiliation_broker is null or affiliation_broker in ('raise_fx', 'vantage', 'puprime', 'axi')
  ),
  add constraint vip_invitation_broker_origin check (type = 'affiliation' or affiliation_broker is null);

alter table public.vip_memberships
  add column first_name text,
  add column last_name text,
  add column affiliation_broker text,
  add constraint vip_membership_identity_pair check (
    (first_name is null and last_name is null)
    or (public.vip_identity_name_valid(first_name) and public.vip_identity_name_valid(last_name))
  ),
  add constraint vip_membership_broker_known check (
    affiliation_broker is null or affiliation_broker in ('raise_fx', 'vantage', 'puprime', 'axi')
  ),
  add constraint vip_membership_broker_origin check (type = 'affiliation' or affiliation_broker is null);

-- Keep the verified-auth identity arguments and service-only signature unchanged.
-- Legacy invitations with no names or broker are still valid and remain unspecified.
create or replace function public.vip_redeem_invitation(p_code_hash text, p_user_id uuid, p_email text, p_email_confirmed_at timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_invitation public.vip_invitations%rowtype;
  v_member public.vip_memberships%rowtype;
  v_email text;
  v_now timestamptz;
begin
  if p_user_id is null or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'vip_invitation_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  v_email := lower(btrim(p_email));
  if v_email is null or v_email = '' or p_email_confirmed_at is null then
    raise exception 'vip_email_unconfirmed';
  end if;
  select * into v_invitation from public.vip_invitations
    where code_hash = p_code_hash for update;
  v_now := clock_timestamp();
  if not found or v_invitation.email <> v_email or v_invitation.expires_at <= v_now
    or v_invitation.revoked_at is not null or v_invitation.redeemed_at is not null then
    raise exception 'vip_invitation_unavailable';
  end if;
  if exists (select 1 from public.vip_memberships where user_id = p_user_id) then
    raise exception 'vip_membership_exists';
  end if;
  insert into public.vip_memberships(
    user_id, email, type, first_name, last_name, affiliation_broker,
    started_at, expires_at, status, created_at, updated_at
  ) values (
    p_user_id, v_email, v_invitation.type, v_invitation.first_name, v_invitation.last_name, v_invitation.affiliation_broker,
    v_now,
    case when v_invitation.type = 'abonnement' then ((v_now at time zone 'UTC') + interval '1 month') at time zone 'UTC' else null end,
    'active', v_now, v_now
  ) returning * into v_member;
  update public.vip_invitations set redeemed_at = v_now, redeemed_by = p_user_id where id = v_invitation.id;
  return to_jsonb(v_member);
end;
$$;
revoke all on function public.vip_redeem_invitation(text, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.vip_redeem_invitation(text, uuid, text, timestamptz) to service_role;

create function public.vip_update_identity(p_user_id uuid, p_first_name text, p_last_name text, p_affiliation_broker text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_member public.vip_memberships%rowtype;
  v_broker text;
begin
  if p_user_id is null then raise exception 'vip_membership_missing'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  select * into v_member from public.vip_memberships where user_id = p_user_id for update;
  if not found then raise exception 'vip_membership_missing'; end if;
  if not public.vip_identity_name_valid(p_first_name) or not public.vip_identity_name_valid(p_last_name) then
    raise exception 'vip_identity_invalid';
  end if;
  if v_member.type = 'affiliation' then
    if p_affiliation_broker is null or p_affiliation_broker not in ('raise_fx', 'vantage', 'puprime', 'axi') then
      raise exception 'vip_affiliation_broker_required';
    end if;
    v_broker := p_affiliation_broker;
  else
    v_broker := null;
  end if;
  update public.vip_memberships set
    first_name = p_first_name, last_name = p_last_name, affiliation_broker = v_broker,
    updated_at = clock_timestamp()
    where user_id = p_user_id returning * into v_member;
  return to_jsonb(v_member);
end;
$$;
revoke all on function public.vip_update_identity(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.vip_update_identity(uuid, text, text, text) to service_role;

commit;
