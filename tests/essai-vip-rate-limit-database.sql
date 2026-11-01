-- Run as the migration owner after the rate-limit migration; every fixture and
-- temporary function is rolled back. No customer tables or outbound calls.
begin;
set local statement_timeout = '15s';
set local lock_timeout = '3s';

do $permissions$
declare v_role text; v_privilege text;
begin
  if not exists (select 1 from pg_catalog.pg_class
      where oid = 'public.essai_vip_rate_limits'::regclass and relrowsecurity)
    or exists (select 1 from pg_catalog.pg_policy
      where polrelid = 'public.essai_vip_rate_limits'::regclass)
    or exists (select 1 from pg_catalog.pg_proc
      where oid = 'public.consume_essai_vip_rate_limit(text)'::regprocedure
        and (prosecdef or proconfig is distinct from array['search_path=""']::text[]))
  then raise exception 'ESSAI_RATE_LIMIT_SECURITY_CONFIGURATION'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege(v_role, 'public.essai_vip_rate_limits', v_privilege)
      then raise exception 'ESSAI_RATE_LIMIT_TABLE_PRIVILEGE_%_%', v_role, v_privilege; end if;
    end loop;
    if has_function_privilege(v_role, 'public.consume_essai_vip_rate_limit(text)', 'EXECUTE')
    then raise exception 'ESSAI_RATE_LIMIT_RPC_PRIVILEGE_%', v_role; end if;
  end loop;
  foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if not has_table_privilege('service_role', 'public.essai_vip_rate_limits', v_privilege)
    then raise exception 'ESSAI_RATE_LIMIT_SERVICE_TABLE_PRIVILEGE_%', v_privilege; end if;
  end loop;
  if not has_function_privilege('service_role', 'public.consume_essai_vip_rate_limit(text)', 'EXECUTE')
  then raise exception 'ESSAI_RATE_LIMIT_SERVICE_PRIVILEGES'; end if;
end $permissions$;

-- Generate a unique test namespace without inspecting any existing buckets.
create temporary table essai_rate_limit_fixture (prefix text not null);
insert into pg_temp.essai_rate_limit_fixture values (pg_catalog.md5(pg_catalog.gen_random_uuid()::text));
do $temp_grant$
begin
  execute format('grant usage on schema %I to service_role, anon, authenticated',
    (select nspname from pg_catalog.pg_namespace where oid = pg_my_temp_schema()));
end $temp_grant$;
grant select on pg_temp.essai_rate_limit_fixture to service_role, anon, authenticated;

-- Both browser roles must actually fail, independently of catalog assertions.
set local role anon;
do $anon$
begin
  begin
    perform public.consume_essai_vip_rate_limit(repeat('a', 64));
    raise exception 'ESSAI_RATE_LIMIT_ANON_RPC_ACCEPTED';
  exception when insufficient_privilege then null; end;
  begin
    perform bucket from public.essai_vip_rate_limits limit 1;
    raise exception 'ESSAI_RATE_LIMIT_ANON_READ_ACCEPTED';
  exception when insufficient_privilege then null; end;
end $anon$;
reset role;
set local role authenticated;
do $authenticated$
begin
  begin
    perform public.consume_essai_vip_rate_limit(repeat('b', 64));
    raise exception 'ESSAI_RATE_LIMIT_AUTHENTICATED_RPC_ACCEPTED';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.essai_vip_rate_limits(bucket, request_times, last_consumed_at)
      values (repeat('b', 64), array[clock_timestamp()], clock_timestamp());
    raise exception 'ESSAI_RATE_LIMIT_AUTHENTICATED_WRITE_ACCEPTED';
  exception when insufficient_privilege then null; end;
end $authenticated$;
reset role;

set local role service_role;
do $behavior$
declare
  v_prefix text;
  v_bucket text;
  v_result jsonb;
  v_before timestamptz[];
  v_now timestamptz := clock_timestamp();
  v_n integer;
begin
  select prefix into v_prefix from pg_temp.essai_rate_limit_fixture;
  v_bucket := v_prefix || md5('first');
  for v_n in 1..5 loop
    v_result := public.consume_essai_vip_rate_limit(v_bucket);
    if v_result is distinct from '{"allowed":true,"retry_after_seconds":0}'::jsonb
    then raise exception 'ESSAI_RATE_LIMIT_ACCEPT_%', v_n; end if;
  end loop;
  select request_times into v_before from public.essai_vip_rate_limits where bucket = v_bucket;
  for v_n in 6..8 loop
    v_result := public.consume_essai_vip_rate_limit(v_bucket);
    if v_result->>'allowed' is distinct from 'false'
      or v_result->>'retry_after_seconds' is null
      or (v_result->>'retry_after_seconds')::integer not between 3590 and 3600
    then raise exception 'ESSAI_RATE_LIMIT_REJECT_%', v_n; end if;
  end loop;
  if (select request_times from public.essai_vip_rate_limits where bucket = v_bucket) is distinct from v_before
  then raise exception 'ESSAI_RATE_LIMIT_DENIAL_EXTENDS_WINDOW'; end if;

  -- A different bucket has an independent allowance.
  if (public.consume_essai_vip_rate_limit(v_prefix || md5('other'))->>'allowed')::boolean is distinct from true
  then raise exception 'ESSAI_RATE_LIMIT_BUCKET_ISOLATION'; end if;

  -- One expired request must drop out without resetting the four newer ones.
  v_bucket := v_prefix || md5('rolling');
  insert into public.essai_vip_rate_limits(bucket, request_times, last_consumed_at)
    values (v_bucket, array[v_now - interval '61 minutes', v_now - interval '50 minutes',
      v_now - interval '40 minutes', v_now - interval '30 minutes', v_now - interval '20 minutes'],
      v_now - interval '20 minutes');
  if (public.consume_essai_vip_rate_limit(v_bucket)->>'allowed')::boolean is distinct from true
    or (public.consume_essai_vip_rate_limit(v_bucket)->>'allowed')::boolean is distinct from false
    or (select cardinality(request_times) from public.essai_vip_rate_limits where bucket = v_bucket) <> 5
  then raise exception 'ESSAI_RATE_LIMIT_ROLLING_WINDOW'; end if;
  v_result := public.consume_essai_vip_rate_limit(v_bucket);
  if (v_result->>'retry_after_seconds')::integer not between 590 and 600
  then raise exception 'ESSAI_RATE_LIMIT_RETRY_OLDEST'; end if;

  -- An event exactly one hour old at the start of the call is expired.
  v_bucket := v_prefix || md5('boundary');
  v_now := clock_timestamp();
  insert into public.essai_vip_rate_limits(bucket, request_times, last_consumed_at)
    values (v_bucket, array[v_now - interval '1 hour', v_now - interval '50 minutes',
      v_now - interval '40 minutes', v_now - interval '30 minutes', v_now - interval '20 minutes'],
      v_now - interval '20 minutes');
  if (public.consume_essai_vip_rate_limit(v_bucket)->>'allowed')::boolean is distinct from true
  then raise exception 'ESSAI_RATE_LIMIT_WINDOW_BOUNDARY'; end if;

  foreach v_bucket in array array[null::text, '', '192.0.2.1', repeat('A', 64), repeat('a', 63)] loop
    begin
      perform public.consume_essai_vip_rate_limit(v_bucket);
      raise exception 'ESSAI_RATE_LIMIT_INVALID_BUCKET_ACCEPTED';
    exception when invalid_parameter_value then null; end;
  end loop;

  -- The table also enforces its five-timestamp storage bound.
  begin
    insert into public.essai_vip_rate_limits(bucket, request_times, last_consumed_at)
      values (v_prefix || md5('too-many'), array_fill(v_now, array[6]), v_now);
    raise exception 'ESSAI_RATE_LIMIT_STORAGE_BOUND_EXCEEDED';
  exception when check_violation then null; end;
end $behavior$;
reset role;

-- Cleanup is limited to 100 per call. Isolate this test with rollback: existing
-- limiter rows are untouched afterward, even if an old bucket is selected too.
set local role service_role;
do $cleanup$
declare v_prefix text; v_now timestamptz := clock_timestamp(); v_before bigint; v_after bigint;
begin
  select prefix into v_prefix from pg_temp.essai_rate_limit_fixture;
  insert into public.essai_vip_rate_limits(bucket, request_times, last_consumed_at)
    select v_prefix || md5('expired:' || i), array[v_now - interval '100 years'], v_now - interval '100 years'
    from generate_series(1, 125) i;
  select count(*) into v_before from public.essai_vip_rate_limits
    where bucket like v_prefix || '%' and last_consumed_at < v_now - interval '1 hour';
  perform public.consume_essai_vip_rate_limit(v_prefix || md5('cleanup'));
  select count(*) into v_after from public.essai_vip_rate_limits
    where bucket like v_prefix || '%' and last_consumed_at < v_now - interval '1 hour';
  if v_before - v_after <> 100 then raise exception 'ESSAI_RATE_LIMIT_CLEANUP_BATCH'; end if;
  if not exists (select 1 from public.essai_vip_rate_limits
    where bucket = v_prefix || md5('first') and cardinality(request_times) = 5)
  then raise exception 'ESSAI_RATE_LIMIT_CLEANUP_REMOVED_ACTIVE_BUCKET'; end if;
end $cleanup$;
reset role;
rollback;
