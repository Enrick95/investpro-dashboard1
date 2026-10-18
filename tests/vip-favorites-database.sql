-- Run only after the additive favorites migration. All fixtures are rolled back;
-- no provider worker or outbound-message function is called.
begin;
set local statement_timeout = '15s';
set local lock_timeout = '3s';

do $permissions$
begin
  if not exists(select 1 from pg_catalog.pg_class where oid='public.vip_post_favorites'::regclass and relrowsecurity)
    or exists(select 1 from pg_catalog.pg_policy where polrelid='public.vip_post_favorites'::regclass)
    or has_table_privilege('anon','public.vip_post_favorites','SELECT')
    or has_table_privilege('authenticated','public.vip_post_favorites','SELECT')
    or has_table_privilege('authenticated','public.vip_post_favorites','INSERT')
    or has_table_privilege('authenticated','public.vip_post_favorites','UPDATE')
    or has_table_privilege('authenticated','public.vip_post_favorites','DELETE')
    or has_function_privilege('anon','public.vip_set_post_favorite(uuid,uuid,boolean,boolean)','EXECUTE')
    or has_function_privilege('authenticated','public.vip_set_post_favorite(uuid,uuid,boolean,boolean)','EXECUTE')
    or not has_function_privilege('service_role','public.vip_set_post_favorite(uuid,uuid,boolean,boolean)','EXECUTE')
    or exists(select 1 from pg_catalog.pg_proc where oid='public.vip_set_post_favorite(uuid,uuid,boolean,boolean)'::regprocedure and prosecdef)
    or exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.vip_post_favorites'::regclass and not tgisinternal)
  then raise exception 'VIP_FAVORITE_PRIVILEGE_BOUNDARY'; end if;
end $permissions$;

create temporary table vip_favorite_fixture(users uuid[], published_id uuid, withdrawn_id uuid, notice_count bigint, feed_count bigint);
do $temp_grant$ begin execute format('grant usage on schema %I to service_role', (select nspname from pg_catalog.pg_namespace where oid=pg_my_temp_schema())); end $temp_grant$;
grant select on pg_temp.vip_favorite_fixture to service_role;
do $fixtures$
declare u uuid[]; p uuid; h uuid;
begin
  select array_agg(id) into u from (
    select id from auth.users a where email_confirmed_at is not null and email is not null
      and not exists(select 1 from public.vip_memberships m where m.user_id=a.id)
      and not exists(select 1 from public.vip_access_requests r where r.user_id=a.id)
    order by id limit 4
  ) fixture;
  if coalesce(array_length(u,1),0)<4 then raise exception 'VIP_FAVORITE_FIXTURES_UNAVAILABLE'; end if;
  insert into public.vip_memberships(user_id,email,type,first_name,last_name,affiliation_broker,started_at,expires_at,status)
    select u[1],lower(email),'affiliation','Test','Favoris','axi',now()-interval '1 day',null,'active' from auth.users where id=u[1];
  insert into public.vip_memberships(user_id,email,type,first_name,last_name,started_at,expires_at,status)
    select u[2],lower(email),'abonnement','Test','Favoris',now()-interval '1 day',now()+interval '1 day','active' from auth.users where id=u[2];
  insert into public.vip_memberships(user_id,email,type,first_name,last_name,started_at,expires_at,status)
    select u[3],lower(email),'abonnement','Test','Expire',now()-interval '3 days',now()-interval '1 day','active' from auth.users where id=u[3];
  insert into public.vip_posts(category,title,body,created_by,published) values('analysis','Test favoris privé','Fixture transactionnelle',u[1],true) returning id into p;
  insert into public.vip_posts(category,title,body,created_by,published) values('analysis','Brouillon privé','Fixture transactionnelle',u[1],false) returning id into h;
  insert into pg_temp.vip_favorite_fixture
    select u,p,h,(select count(*) from public.vip_notification_outbox where user_id=any(u)),(select count(*) from public.investpro_notifications where user_id=any(u));
end $fixtures$;

set local role service_role;
do $behavior$
declare f pg_temp.vip_favorite_fixture%rowtype; saved_at timestamptz; n integer; result boolean;
begin
  select * into f from pg_temp.vip_favorite_fixture;
  result := public.vip_set_post_favorite(f.published_id,f.users[1],true,false);
  if result is distinct from true then raise exception 'VIP_FAVORITE_SAVE_ACK'; end if;
  select created_at into saved_at from public.vip_post_favorites where post_id=f.published_id and user_id=f.users[1];
  perform public.vip_set_post_favorite(f.published_id,f.users[1],true,false);
  select count(*) into n from public.vip_post_favorites where post_id=f.published_id and user_id=f.users[1] and created_at=saved_at;
  if n<>1 then raise exception 'VIP_FAVORITE_RETRY_NOT_IDEMPOTENT'; end if;
  perform public.vip_set_post_favorite(f.published_id,f.users[2],true,false);
  select count(*) into n from public.vip_post_favorites where post_id=f.published_id;
  if n<>2 then raise exception 'VIP_FAVORITE_MEMBER_ISOLATION'; end if;
  perform public.vip_set_post_favorite(f.published_id,f.users[1],false,false);
  perform public.vip_set_post_favorite(f.published_id,f.users[1],false,false);
  if exists(select 1 from public.vip_post_favorites where post_id=f.published_id and user_id=f.users[1])
    or not exists(select 1 from public.vip_post_favorites where post_id=f.published_id and user_id=f.users[2])
  then raise exception 'VIP_FAVORITE_REMOVE_OWNER_ONLY'; end if;
  begin
    perform public.vip_set_post_favorite(f.published_id,f.users[3],true,false);
    raise exception 'VIP_FAVORITE_EXPIRED_ACCEPTED';
  exception when raise_exception then if sqlerrm<>'vip_access_inactive' then raise; end if; end;
  begin
    perform public.vip_set_post_favorite(f.published_id,f.users[4],true,false);
    raise exception 'VIP_FAVORITE_NONMEMBER_ACCEPTED';
  exception when raise_exception then if sqlerrm<>'vip_access_inactive' then raise; end if; end;
  -- Only the verified service API may assert administrator access.
  perform public.vip_set_post_favorite(f.published_id,f.users[4],true,true);
  begin
    perform public.vip_set_post_favorite(f.withdrawn_id,f.users[4],true,true);
    raise exception 'VIP_FAVORITE_ADMIN_DRAFT_ACCEPTED';
  exception when raise_exception then if sqlerrm<>'vip_post_unavailable' then raise; end if; end;
  begin
    perform public.vip_set_post_favorite(gen_random_uuid(),f.users[1],true,false);
    raise exception 'VIP_FAVORITE_MISSING_POST_ACCEPTED';
  exception when raise_exception then if sqlerrm<>'vip_post_unavailable' then raise; end if; end;
  begin
    perform public.vip_set_post_favorite(f.published_id,f.users[1],null,false);
    raise exception 'VIP_FAVORITE_NULL_ACCEPTED';
  exception when raise_exception then if sqlerrm<>'vip_favorite_invalid' then raise; end if; end;
  -- Withdrawal removes the post from reads; the member can still remove their save.
  update public.vip_posts set published=false where id=f.published_id;
  perform public.vip_set_post_favorite(f.published_id,f.users[2],false,false);
  if exists(select 1 from public.vip_post_favorites where post_id=f.published_id and user_id=f.users[2]) then raise exception 'VIP_FAVORITE_WITHDRAWN_REMOVE'; end if;
  if (select count(*) from public.vip_notification_outbox where user_id=any(f.users))<>f.notice_count
    or (select count(*) from public.investpro_notifications where user_id=any(f.users))<>f.feed_count
  then raise exception 'VIP_FAVORITE_UNEXPECTED_NOTIFICATION'; end if;
end $behavior$;
reset role;

set local role authenticated;
do $direct_access$
begin
  begin perform 1 from public.vip_post_favorites limit 1; raise exception 'VIP_FAVORITE_DIRECT_READ_ALLOWED'; exception when insufficient_privilege then null; end;
  begin perform public.vip_set_post_favorite(null,null,true,true); raise exception 'VIP_FAVORITE_DIRECT_RPC_ALLOWED'; exception when insufficient_privilege then null; end;
end $direct_access$;
reset role;
set local role anon;
do $anonymous_access$
begin
  begin perform 1 from public.vip_post_favorites limit 1; raise exception 'VIP_FAVORITE_ANON_READ_ALLOWED'; exception when insufficient_privilege then null; end;
  begin perform public.vip_set_post_favorite(null,null,true,true); raise exception 'VIP_FAVORITE_ANON_RPC_ALLOWED'; exception when insufficient_privilege then null; end;
end $anonymous_access$;
reset role;
rollback;
select 'favorites: private grants/RLS, server-only invoker, retry, member isolation, active/expired/admin, withdrawn/missing post, no notifications; all fixtures rolled back' as verification;
