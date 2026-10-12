create or replace function public.investpro_hosted_pair(
  p_user uuid,
  p_platform text,
  p_login text,
  p_server text,
  p_currency text,
  p_initial numeric,
  p_type text,
  p_broker text,
  p_secret text,
  p_hash text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  a bigint;
  c uuid;
  j uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('hosted:' || p_user::text, 0));

  select h.id
    into j
    from investpro_mt_hosted h
    join investpro_mt_connections c on c.id = h.connection_id
   where h.user_id = p_user
     and c.platform = p_platform
     and c.login = p_login
     and c.server = p_server;

  if j is not null
     and exists (
       select 1
         from investpro_mt_hosted
        where id = j
          and requested_at > now() - interval '30 seconds'
     ) then
    raise exception 'too frequent';
  end if;

  if j is null and (select count(*) from investpro_mt_hosted) >= 200 then
    raise exception 'global limit';
  end if;

  if j is null and (select count(*) from investpro_mt_hosted where user_id = p_user) >= 10 then
    raise exception 'limit';
  end if;

  -- Never silently rotate an existing locally paired connection.
  if j is null
     and exists (
       select 1
         from investpro_mt_connections
        where user_id = p_user
          and platform = p_platform
          and login = p_login
          and server = p_server
     ) then
    raise exception 'existing local connection';
  end if;

  a := investpro_mt_pair_v2(p_platform, p_user, p_login, p_server, p_currency, p_initial, p_type, p_hash);
  select id into c from investpro_mt_connections where account_id = a and user_id = p_user;

  insert into investpro_mt_hosted(user_id, connection_id, broker_id, secret)
  values (p_user, c, p_broker, p_secret)
  on conflict (connection_id) do update
    set secret = excluded.secret,
        broker_id = excluded.broker_id,
        active = true,
        generation = investpro_mt_hosted.generation + 1,
        status = 'queued',
        requested_at = now(),
        updated_at = now()
  returning id into j;

  return j;
end
$function$;
