-- Rattachement : capture obligatoire prouvant que le broker a bien rattaché le compte à Enrick.
alter table public.vip_member_applications
  add column if not exists transfer_proof_path text check (transfer_proof_path is null or transfer_proof_path like (id::text || '/%'));
alter table public.vip_member_applications drop constraint if exists vip_member_application_transfer_fields;
alter table public.vip_member_applications
  add constraint vip_member_application_transfer_fields check (broker_account_kind = 'new' or (broker_email is not null and transfer_proof_path is not null));
