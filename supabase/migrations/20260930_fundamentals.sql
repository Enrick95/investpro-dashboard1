-- Optional IA module only. No change to existing trading or Telegram tables.
begin;
create table if not exists public.investpro_fundamental_cache (
 pair text primary key, payload jsonb, expires_at timestamptz,
 lease_until timestamptz, lease_token uuid
);
create table if not exists public.investpro_fundamental_quota (
 key text primary key, bucket timestamptz not null, used integer not null default 0
);
alter table public.investpro_fundamental_cache enable row level security;
alter table public.investpro_fundamental_quota enable row level security;
revoke all on public.investpro_fundamental_cache,public.investpro_fundamental_quota from anon,authenticated;
grant select,insert,update,delete on public.investpro_fundamental_cache,public.investpro_fundamental_quota to service_role;
create or replace function public.investpro_acquire_fundamental(p_pair text,p_user uuid,p_token uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.investpro_fundamental_cache; h timestamptz:=date_trunc('hour',now()); d timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'; ukey text:='user:'||p_user::text; count_user integer; count_global integer;
begin
 if p_user is null or p_token is null or p_pair !~ '^[A-Z]{6}$' then raise exception 'Invalid input'; end if;
 -- Serialize reservation and quota updates across all serverless instances.
 perform pg_advisory_xact_lock(73549182);
 delete from public.investpro_fundamental_quota where bucket < d;
 select * into c from public.investpro_fundamental_cache where pair=p_pair;
 if c.payload is not null and c.expires_at>now() then return jsonb_build_object('state','cached','payload',c.payload); end if;
 if c.lease_until>now() then return jsonb_build_object('state','busy'); end if;
 select used into count_user from public.investpro_fundamental_quota where key=ukey and bucket=h;
 select used into count_global from public.investpro_fundamental_quota where key='global' and bucket=d;
 if coalesce(count_user,0)>=5 or coalesce(count_global,0)>=40 then return jsonb_build_object('state','limited'); end if;
 insert into public.investpro_fundamental_quota(key,bucket,used) values(ukey,h,1)
 on conflict(key) do update set bucket=h,used=case when investpro_fundamental_quota.bucket=h then investpro_fundamental_quota.used+1 else 1 end;
 insert into public.investpro_fundamental_quota(key,bucket,used) values('global',d,1)
 on conflict(key) do update set bucket=d,used=case when investpro_fundamental_quota.bucket=d then investpro_fundamental_quota.used+1 else 1 end;
 insert into public.investpro_fundamental_cache(pair,lease_until,lease_token) values(p_pair,now()+interval '90 seconds',p_token)
 on conflict(pair) do update set lease_until=excluded.lease_until,lease_token=excluded.lease_token;
 return jsonb_build_object('state','generate');
end $$;
revoke all on function public.investpro_acquire_fundamental(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.investpro_acquire_fundamental(text,uuid,uuid) to service_role;
commit;
