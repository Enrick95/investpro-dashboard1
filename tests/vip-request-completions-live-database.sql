-- Exercise the installed public schema and RPCs, then roll back every fixture.
-- Never call a notification worker, provider or auth mutation. Uncommitted
-- fixture events are invisible to external workers and cannot be delivered.
-- This test fails closed if a real completion event is already claimable.
begin;
set local statement_timeout = '15s';
set local lock_timeout = '3s';

-- Claims scan the queue globally: freeze it briefly and refuse to touch any
-- pre-existing due work. No existing event or personal row is updated/deleted.
lock table public.vip_request_completion_events in share row exclusive mode;
do $queue_guard$
begin
  if exists(select 1 from public.vip_request_completion_events where created_at>now()-interval '23 hours' and (
    (email_attempts<4 and ((email_status in ('pending','failed') and email_next_attempt_at<=now()) or (email_status='processing' and updated_at<now()-interval '10 minutes')))
    or (push_attempts<4 and ((push_status in ('pending','failed') and push_next_attempt_at<=now()) or (push_status='processing' and updated_at<now()-interval '10 minutes')))
  )) then raise exception 'VIP_COMPLETION_TEST_REAL_WORK_PENDING'; end if;
end $queue_guard$;

do $permissions$
declare signature text;
begin
  if not exists(select 1 from pg_catalog.pg_class where oid='public.vip_request_completion_events'::regclass and relrowsecurity)
    or exists(select 1 from pg_catalog.pg_policy where polrelid='public.vip_request_completion_events'::regclass)
    or has_table_privilege('anon','public.vip_request_completion_events','SELECT')
    or has_table_privilege('authenticated','public.vip_request_completion_events','SELECT')
    or has_table_privilege('authenticated','public.vip_request_completion_events','INSERT')
    or has_table_privilege('authenticated','public.vip_request_completion_events','UPDATE')
    or has_table_privilege('authenticated','public.vip_request_completion_events','DELETE')
    or not has_table_privilege('service_role','public.vip_request_completion_events','UPDATE')
    or has_table_privilege('authenticated','public.vip_access_requests','UPDATE')
  then raise exception 'VIP_COMPLETION_PRIVILEGE_BOUNDARY'; end if;
  foreach signature in array array[
    'public.vip_request_completion_action(uuid,integer,uuid,text[],text)',
    'public.vip_submit_request_completion(uuid,uuid,integer,jsonb,text)',
    'public.vip_review_access_request_revision(uuid,integer,text,uuid,text,text,text,text,date,numeric,boolean,boolean)',
    'public.vip_claim_request_completion_notifications(text,integer)'
  ] loop
    if has_function_privilege('anon',signature,'EXECUTE')
      or has_function_privilege('authenticated',signature,'EXECUTE')
      or not has_function_privilege('service_role',signature,'EXECUTE')
      or exists(select 1 from pg_catalog.pg_proc where oid=signature::regprocedure and prosecdef)
    then raise exception 'VIP_COMPLETION_RPC_PRIVILEGE_BOUNDARY'; end if;
  end loop;
end $permissions$;

create temporary table vip_completion_fixture(users uuid[],new_request uuid,existing_request uuid,first_event uuid);
do $temp_grants$
begin execute format('grant usage on schema %I to service_role,authenticated', (select nspname from pg_catalog.pg_namespace where oid=pg_my_temp_schema())); end $temp_grants$;
grant select,update on pg_temp.vip_completion_fixture to service_role;
grant select on pg_temp.vip_completion_fixture to authenticated;

do $fixtures$
declare u uuid[]; new_id uuid; existing_id uuid;
begin
  select array_agg(id) into u from (
    select id from auth.users a where email_confirmed_at is not null and email is not null
      and coalesce(is_anonymous,false)=false
      and not exists(select 1 from public.vip_memberships m where m.user_id=a.id)
      and not exists(select 1 from public.vip_access_requests r where r.user_id=a.id)
    order by id limit 2 for update skip locked
  ) fixture;
  if coalesce(array_length(u,1),0)<>2 then raise exception 'VIP_COMPLETION_TEST_FIXTURES_UNAVAILABLE'; end if;
  insert into public.vip_access_requests(user_id,email,first_name,last_name,type,affiliation_broker,request_kind,broker_account_kind,broker_account_id,declared_deposit_usd)
    select u[1],lower(email),'Test','Complements','affiliation','axi','new','new','TEST-AXI-1',500 from auth.users where id=u[1]
    returning id into new_id;
  insert into public.vip_access_requests(user_id,email,first_name,last_name,type,paid_on,request_kind)
    select u[2],lower(email),'Test','Existant','abonnement',(now() at time zone 'Europe/Paris')::date,'existing' from auth.users where id=u[2]
    returning id into existing_id;
  insert into pg_temp.vip_completion_fixture values(u,new_id,existing_id,null);
end $fixtures$;

set local role service_role;
do $new_checklist$
declare f pg_temp.vip_completion_fixture%rowtype; r jsonb; event public.vip_request_completion_events%rowtype; n integer;
begin
  select * into f from pg_temp.vip_completion_fixture;
  r:=public.vip_request_completion_action(f.new_request,0,f.users[2],array['brokerAccountId','reply'],'Confirmez la référence de votre compte.');
  if r->>'revision'<>'1' or r->>'status'<>'pending' or r->'completion_fields'<>'["brokerAccountId","reply"]'::jsonb
    or r->>'verified_payment'<>'false' or r->>'verified_broker_linked'<>'false'
    or r->'verified_deposit_usd'<>'null'::jsonb
  then raise exception 'VIP_COMPLETION_CHECKLIST_SAVE'; end if;
  if exists(select 1 from public.vip_memberships where user_id=any(f.users)) then raise exception 'VIP_COMPLETION_CHECKLIST_SELFGRANT'; end if;
  select * into event from public.vip_request_completion_events where request_id=f.new_request;
  if event.id is null or event.user_id<>f.users[1] or event.kind<>'needs_info' or event.revision<>1
    or event.href<>'/vip/rejoindre' or event.event_key<>'vip:completion:needs_info:'||f.new_request::text||':1:'||f.users[1]::text
    or position('Numéro du compte broker' in event.message)=0 or position('Confirmez la référence' in event.message)=0
    or not exists(select 1 from public.investpro_notifications where user_id=f.users[1] and event_key=event.event_key)
  then raise exception 'VIP_COMPLETION_CHECKLIST_EVENT'; end if;
  update pg_temp.vip_completion_fixture set first_event=event.id;
  begin
    perform public.vip_request_completion_action(f.new_request,0,f.users[2],array['reply'],'Demande périmée.');
    raise exception 'VIP_COMPLETION_STALE_ADMIN_ACCEPTED';
  exception when raise_exception then if sqlerrm<>'vip_request_revision_conflict' then raise; end if; end;
  begin
    perform public.vip_review_access_request_revision(f.new_request,1,'approve',f.users[2],'Test','Complements','affiliation','axi',null,500,true,false);
    raise exception 'VIP_COMPLETION_OUTSTANDING_APPROVED';
  exception when raise_exception then if sqlerrm<>'vip_completion_outstanding' then raise; end if; end;
  begin
    perform public.vip_submit_request_completion(f.new_request,f.users[2],1,'{"broker_account_id":"FOREIGN"}','Réponse');
    raise exception 'VIP_COMPLETION_FOREIGN_OWNER_ACCEPTED';
  exception when raise_exception then if sqlerrm<>'vip_request_unavailable' then raise; end if; end;
  begin
    perform public.vip_submit_request_completion(f.new_request,f.users[1],1,'{"status":"approved"}','Réponse');
    raise exception 'VIP_COMPLETION_AUTHORITY_PATCH_ACCEPTED';
  exception when raise_exception then if sqlerrm<>'vip_completion_invalid' then raise; end if; end;
  begin
    perform public.vip_submit_request_completion(f.new_request,f.users[1],1,'{"broker_account_id":"TEST-AXI-2"}','');
    raise exception 'VIP_COMPLETION_EMPTY_REQUIRED_REPLY';
  exception when raise_exception then if sqlerrm<>'vip_completion_invalid' then raise; end if; end;

  -- Exercise the installed claim RPC and real column grants, not cloned SQL.
  select * into event from public.vip_claim_request_completion_notifications('email',1);
  if event.id is null or event.id<>(select first_event from pg_temp.vip_completion_fixture) or event.email_status<>'processing' or event.email_attempts<>1
  then raise exception 'VIP_COMPLETION_EMAIL_LEASE'; end if;
  select count(*) into n from public.vip_claim_request_completion_notifications('email',1);
  if n<>0 then raise exception 'VIP_COMPLETION_EMAIL_DOUBLE_CLAIM'; end if;
  select * into event from public.vip_claim_request_completion_notifications('push',1);
  if event.id is null or event.id<>(select first_event from pg_temp.vip_completion_fixture) or event.push_status<>'processing' or event.push_attempts<>1
  then raise exception 'VIP_COMPLETION_PUSH_INDEPENDENT_LEASE'; end if;
  select count(*) into n from public.vip_claim_request_completion_notifications('push',1);
  if n<>0 then raise exception 'VIP_COMPLETION_PUSH_DOUBLE_CLAIM'; end if;
  update public.vip_request_completion_events set email_status='failed',email_next_attempt_at=now() where id=(select first_event from pg_temp.vip_completion_fixture);
  select * into event from public.vip_claim_request_completion_notifications('email',1);
  if event.id is null or event.email_attempts<>2 then raise exception 'VIP_COMPLETION_EMAIL_RETRY'; end if;
  update public.vip_request_completion_events set updated_at=now()-interval '11 minutes' where id=(select first_event from pg_temp.vip_completion_fixture);
  select * into event from public.vip_claim_request_completion_notifications('email',1);
  if event.id is null or event.email_attempts<>3 then raise exception 'VIP_COMPLETION_EMAIL_EXPIRED_LEASE'; end if;
  update public.vip_request_completion_events set email_status='failed',email_attempts=4,email_next_attempt_at=now() where id=(select first_event from pg_temp.vip_completion_fixture);
  select count(*) into n from public.vip_claim_request_completion_notifications('email',1);
  if n<>0 then raise exception 'VIP_COMPLETION_EMAIL_RETRY_CAP'; end if;
end $new_checklist$;

reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select users[1] from pg_temp.vip_completion_fixture),'role','authenticated')::text,true);
set local role authenticated;
do $member_boundary$
declare f pg_temp.vip_completion_fixture%rowtype; n integer;
begin
  select * into f from pg_temp.vip_completion_fixture;
  select count(*) into n from public.vip_access_requests where id=f.new_request;
  if n<>1 then raise exception 'VIP_COMPLETION_OWN_REQUEST_HIDDEN'; end if;
  select count(*) into n from public.vip_access_requests where id=f.existing_request;
  if n<>0 then raise exception 'VIP_COMPLETION_FOREIGN_REQUEST_VISIBLE'; end if;
  begin
    perform 1 from public.vip_request_completion_events where request_id=f.new_request;
    raise exception 'VIP_COMPLETION_PRIVATE_EVENTS_VISIBLE';
  exception when insufficient_privilege then null; end;
  begin
    update public.vip_access_requests set status='approved' where id=f.new_request;
    raise exception 'VIP_COMPLETION_DIRECT_MEMBER_UPDATE';
  exception when insufficient_privilege then null; end;
  begin
    perform public.vip_submit_request_completion(f.new_request,f.users[1],1,'{"broker_account_id":"DIRECT"}','Direct');
    raise exception 'VIP_COMPLETION_DIRECT_RPC_EXECUTE';
  exception when insufficient_privilege then null; end;
end $member_boundary$;

reset role;
set local role service_role;
do $resubmit_and_review$
declare f pg_temp.vip_completion_fixture%rowtype; r jsonb;
begin
  select * into f from pg_temp.vip_completion_fixture;
  r:=public.vip_submit_request_completion(f.new_request,f.users[1],1,'{"broker_account_id":"TEST-AXI-2"}','Voici ma référence corrigée.');
  if r->>'revision'<>'2' or r->>'status'<>'pending' or r->'completion_fields'<>'[]'::jsonb
    or r->>'broker_account_id'<>'TEST-AXI-2' or r->>'completion_reply'<>'Voici ma référence corrigée.'
    or r->>'verified_broker_linked'<>'false' or r->>'verified_payment'<>'false' or r->'verified_deposit_usd'<>'null'::jsonb
    or exists(select 1 from public.vip_memberships where user_id=f.users[1])
    or not exists(select 1 from public.vip_request_completion_events where request_id=f.new_request and kind='submitted' and revision=2 and href='/vip/rejoindre')
  then raise exception 'VIP_COMPLETION_RESUBMIT_BEHAVIOR'; end if;
  begin
    perform public.vip_review_access_request_revision(f.new_request,1,'approve',f.users[2],'Test','Complements','affiliation','axi',null,500,true,false);
    raise exception 'VIP_COMPLETION_STALE_APPROVAL_ACCEPTED';
  exception when raise_exception then if sqlerrm<>'vip_request_revision_conflict' then raise; end if; end;
  begin
    perform public.vip_submit_request_completion(f.new_request,f.users[1],2,'{"broker_account_id":"TEST-AXI-3"}','Réessai');
    raise exception 'VIP_COMPLETION_UNREQUESTED_RESUBMIT';
  exception when raise_exception then if sqlerrm<>'vip_request_unavailable' then raise; end if; end;
  begin
    perform public.vip_review_access_request_revision(f.new_request,2,'approve',f.users[2],'Test','Complements','affiliation','axi',null,500,false,false);
    raise exception 'VIP_COMPLETION_APPROVAL_SKIPPED_FRESH_BROKER_CHECK';
  exception when raise_exception then if sqlerrm<>'vip_request_approval_invalid' then raise; end if; end;
  r:=public.vip_review_access_request_revision(f.new_request,2,'approve',f.users[2],'Test','Complements','affiliation','axi',null,500,true,false);
  if r->>'status'<>'approved' or not exists(select 1 from public.vip_memberships where user_id=f.users[1] and status='active' and type='affiliation')
  then raise exception 'VIP_COMPLETION_VERIFIED_APPROVAL'; end if;
  begin
    perform public.vip_request_completion_action(f.new_request,2,f.users[2],array['reply'],'Trop tard.');
    raise exception 'VIP_COMPLETION_TERMINAL_CHECKLIST_ACCEPTED';
  exception when raise_exception then if sqlerrm<>'vip_request_unavailable' then raise; end if; end;

  -- Existing-member subscriptions use the same installed functions and FK model.
  begin
    perform public.vip_request_completion_action(f.existing_request,0,f.users[1],array['brokerAccountId'],'Champ incorrect.');
    raise exception 'VIP_COMPLETION_WRONG_ORIGIN_FIELD';
  exception when raise_exception then if sqlerrm<>'vip_completion_invalid' then raise; end if; end;
  r:=public.vip_request_completion_action(f.existing_request,0,f.users[1],array['paidOn'],'Confirmez la date de règlement.');
  if r->>'revision'<>'1' or not exists(select 1 from public.vip_request_completion_events where request_id=f.existing_request and kind='needs_info' and href='/vip/deja-membre')
  then raise exception 'VIP_COMPLETION_EXISTING_CHECKLIST'; end if;
  r:=public.vip_submit_request_completion(f.existing_request,f.users[2],1,jsonb_build_object('paid_on',(now() at time zone 'Europe/Paris')::date),'');
  if r->>'revision'<>'2' or r->>'status'<>'pending' or exists(select 1 from public.vip_memberships where user_id=f.users[2])
  then raise exception 'VIP_COMPLETION_EXISTING_RESUBMIT'; end if;
  r:=public.vip_request_completion_action(f.existing_request,2,f.users[1],array['reply'],'Autre précision.');
  r:=public.vip_review_access_request_revision(f.existing_request,3,'deny',f.users[1],null,null,null,null,null,null,false,false);
  if r->>'status'<>'denied' or r->'completion_fields'<>'[]'::jsonb or exists(select 1 from public.vip_memberships where user_id=f.users[2])
  then raise exception 'VIP_COMPLETION_DENY_OUTSTANDING'; end if;
end $resubmit_and_review$;

reset role;
select 'VIP completion installed schema/RPC/permissions checks passed; all fixtures rolled back' as result;
rollback;
