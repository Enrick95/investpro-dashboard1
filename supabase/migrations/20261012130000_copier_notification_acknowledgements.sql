begin;

alter table public.copier_notification_deliveries
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_by uuid references auth.users(id) on delete set null;

update public.copier_notification_deliveries
set acknowledged_at = coalesce(acknowledged_at, updated_at)
where status = 'skipped' and acknowledged_at is null;

create index if not exists copier_notification_deliveries_acknowledged_idx
  on public.copier_notification_deliveries(acknowledged_at, status, updated_at desc);

commit;
