begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

create sequence if not exists public.vip_member_number_seq;
alter table public.vip_memberships
  add column if not exists member_number bigint;
select setval('public.vip_member_number_seq', greatest(coalesce((select max(member_number) from public.vip_memberships), 0) + 1, 1), false);
update public.vip_memberships set member_number = nextval('public.vip_member_number_seq') where member_number is null;
alter table public.vip_memberships alter column member_number set default nextval('public.vip_member_number_seq');
alter table public.vip_memberships alter column member_number set not null;
create unique index if not exists vip_memberships_member_number_unique on public.vip_memberships(member_number);

alter table public.vip_access_requests
  add column if not exists member_intake boolean not null default false,
  add column if not exists phone_whatsapp text,
  add column if not exists mt_platform text,
  add column if not exists mt_server text,
  add column if not exists deposit_range text,
  add column if not exists proof_path text,
  add column if not exists via_enrick_link boolean not null default false,
  add column if not exists trading_account_id bigint references public.trading_accounts(id) on delete set null,
  add column if not exists channel_invite_url text,
  add column if not exists channel_joined_at timestamptz,
  add column if not exists channel_user_id bigint,
  add column if not exists channel_username text,
  add column if not exists member_number bigint,
  add column if not exists rejection_reason text,
  add constraint vip_request_member_intake_fields check (
    not member_intake or (
      request_kind = 'new' and type = 'affiliation'
      and phone_whatsapp is not null and phone_whatsapp ~ '^\+[1-9][0-9]{7,14}$'
      and mt_platform is not null and mt_platform in ('MT4', 'MT5')
      and mt_server is not null and length(mt_server) between 2 and 100
      and deposit_range is not null and deposit_range in ('300-499', '500-999', '1000-plus')
      and proof_path is not null and proof_path like (user_id::text || '/%')
      and via_enrick_link is true
      and trading_account_id is not null
    )
  ),
  add constraint vip_request_invite_only_after_approval check (
    (status <> 'approved' and channel_invite_url is null and member_number is null)
    or (status = 'approved' and (channel_invite_url is null or channel_invite_url ~ '^https://t\.me/'))
  );

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('vip-membership-proofs', 'vip-membership-proofs', false, 8388608, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 8388608, allowed_mime_types = excluded.allowed_mime_types;
-- Storage is accessible only from server code using the service role; no user/public policies.

comment on column public.vip_access_requests.proof_path is 'Object path in the private vip-membership-proofs bucket. Never expose as a public URL.';
comment on column public.vip_access_requests.member_intake is 'New member VIP application from /vip/nouveau-membre; separate from classic VIP intake and Essai VIP.';
comment on column public.vip_access_requests.trading_account_id is 'Manual account record created with the application; automatic MetaTrader sync is separately consented.';

commit;
