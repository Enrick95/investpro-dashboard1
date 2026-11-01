begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

-- Only an opaque server-generated HMAC and at most five timestamps are retained.
create table public.essai_vip_rate_limits (
  bucket text primary key check (bucket ~ '^[0-9a-f]{64}$'),
  request_times timestamptz[] not null,
  last_consumed_at timestamptz not null,
  constraint essai_vip_rate_limits_bounded check (
    cardinality(request_times) between 1 and 5
    and array_ndims(request_times) = 1
    and array_lower(request_times, 1) = 1
    and array_position(request_times, null) is null
    and last_consumed_at = request_times[cardinality(request_times)]
  )
);
create index essai_vip_rate_limits_expiry
  on public.essai_vip_rate_limits(last_consumed_at, bucket);
alter table public.essai_vip_rate_limits enable row level security;
revoke all on public.essai_vip_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.essai_vip_rate_limits to service_role;

create function public.consume_essai_vip_rate_limit(p_bucket text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_now timestamptz;
  v_times timestamptz[];
  v_allowed boolean;
  v_retry integer := 0;
begin
  if p_bucket is null or p_bucket !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_rate_limit_bucket';
  end if;

  -- Covers the initially absent row as well as later concurrent requests.
  -- Transaction scope also works with pooled PostgREST connections.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('essai-vip:' || p_bucket, 0)
  );
  select request_times into v_times
    from public.essai_vip_rate_limits where bucket = p_bucket for update;
  -- Capture time after any lock wait, so the rolling window stays accurate.
  v_now := pg_catalog.clock_timestamp();
  select coalesce(pg_catalog.array_agg(t order by t), '{}'::timestamptz[])
    into v_times from pg_catalog.unnest(v_times) as times(t)
    where t > v_now - interval '1 hour';

  v_allowed := pg_catalog.cardinality(v_times) < 5;
  if v_allowed then
    v_times := pg_catalog.array_append(v_times, v_now);
    insert into public.essai_vip_rate_limits(bucket, request_times, last_consumed_at)
      values (p_bucket, v_times, v_now)
      on conflict (bucket) do update
        set request_times = excluded.request_times,
            last_consumed_at = excluded.last_consumed_at;
  else
    v_retry := greatest(1, pg_catalog.ceil(
      extract(epoch from (v_times[1] + interval '1 hour' - v_now))
    )::integer);
  end if;

  -- Prune a bounded batch per call. Lock candidates after processing this bucket
  -- and skip other active rows; cleanup never waits on another bucket's row.
  with expired as (
    select bucket from public.essai_vip_rate_limits
      where last_consumed_at <= v_now - interval '1 hour' and bucket <> p_bucket
      order by last_consumed_at, bucket
      limit 100 for update skip locked
  )
  delete from public.essai_vip_rate_limits limits using expired
    where limits.bucket = expired.bucket;

  return pg_catalog.jsonb_build_object(
    'allowed', v_allowed, 'retry_after_seconds', v_retry
  );
end;
$$;
revoke all on function public.consume_essai_vip_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_essai_vip_rate_limit(text) to service_role;

comment on table public.essai_vip_rate_limits is
  'Server-only HMAC buckets for POST /api/essai-vip; no IP addresses or form data.';
comment on function public.consume_essai_vip_rate_limit(text) is
  'Service-only atomic trailing-hour limiter: five consumptions per opaque HMAC bucket.';
commit;
