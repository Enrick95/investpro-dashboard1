begin;
set local statement_timeout = '10s';
do $test$
declare
  u uuid[]; req uuid; invite_hash text; member_email text; n integer; base_count integer;
begin
  select array_agg(id) into u from (
    select id from auth.users au where email_confirmed_at is not null and email is not null
      and not exists(select 1 from public.vip_memberships m where m.user_id=au.id)
      and not exists(select 1 from public.vip_access_requests r where r.user_id=au.id)
    order by id limit 3
  ) fixture;
  if coalesce(array_length(u,1),0)<3 then raise exception 'VIP_TEST_FIXTURES_UNAVAILABLE'; end if;
  select count(*) into base_count from public.vip_access_confirmations;
  select email into member_email from auth.users where id=u[1];
  insert into public.vip_access_requests(user_id,email,first_name,last_name,type,affiliation_broker,request_kind)
    values(u[1],lower(member_email),'Test','Validation','affiliation','axi','existing') returning id into req;
  perform public.vip_review_access_request(req,'approve',u[1],'Test','Validation','affiliation','axi',null);
  select count(*) into n from public.vip_access_confirmations where user_id=u[1];
  if n<>1 then raise exception 'VIP_EXISTING_CONFIRMATION_COUNT'; end if;
  update public.vip_memberships set first_name='Autre',status='active' where user_id=u[1];
  select count(*) into n from public.vip_access_confirmations where user_id=u[1];
  if n<>1 then raise exception 'VIP_IDENTITY_OR_REPEAT_DUPLICATE'; end if;
  begin
    update public.vip_memberships set status='suspended' where user_id=u[1];
    update public.vip_memberships set status='active' where user_id=u[1];
    raise exception 'VIP_ROLLBACK_FIXTURE';
  exception when raise_exception then
    if sqlerrm<>'VIP_ROLLBACK_FIXTURE' then raise; end if;
  end;
  select count(*) into n from public.vip_access_confirmations where user_id=u[1];
  if n<>1 then raise exception 'VIP_EVENT_NOT_ATOMIC'; end if;
  update public.vip_memberships set status='suspended' where user_id=u[1];
  update public.vip_memberships set status='active' where user_id=u[1];
  select count(*) into n from public.vip_access_confirmations where user_id=u[1];
  if n<>2 then raise exception 'VIP_REACTIVATION_CONFIRMATION_COUNT'; end if;
  select email into member_email from auth.users where id=u[2];
  insert into public.vip_access_requests(user_id,email,first_name,last_name,type,affiliation_broker,request_kind,broker_account_kind,broker_account_id,broker_email,declared_deposit_usd,copy_requested)
    values(u[2],lower(member_email),'Test','Validation','affiliation','axi','new','new','TEST-ONLY',lower(member_email),300,false) returning id into req;
  perform public.vip_review_access_request_checked(req,'approve',u[1],'Test','Validation','affiliation','axi',null,300,true,false);
  select count(*) into n from public.vip_access_confirmations where user_id=u[2];
  if n<>1 then raise exception 'VIP_NEW_CONFIRMATION_COUNT'; end if;
  select email into member_email from auth.users where id=u[3];
  invite_hash := md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
  insert into public.vip_invitations(email,type,first_name,last_name,affiliation_broker,code_hash,created_by)
    values(lower(member_email),'affiliation','Test','Validation','axi',invite_hash,u[1]);
  perform public.vip_redeem_invitation(invite_hash,u[3],member_email,now());
  select count(*) into n from public.vip_access_confirmations where user_id=u[3];
  if n<>1 then raise exception 'VIP_CODE_CONFIRMATION_COUNT'; end if;
  select count(*) into n from public.vip_access_confirmations c
    join public.investpro_notifications f using(event_key,user_id)
    join public.vip_notification_outbox p using(event_key,user_id)
    where c.user_id=any(u) and f.href='/dashboard/vip' and p.href='/dashboard/vip' and p.kind='access_confirmation';
  if n<>4 then raise exception 'VIP_CONFIRMATION_CHANNELS_NOT_ATOMIC'; end if;
  select count(*) into n from public.vip_claim_access_confirmation_emails(10) where user_id=any(u) and email_attempts=1 and email_status='processing';
  if n<>4 then raise exception 'VIP_EMAIL_CLAIM_COUNT'; end if;
  select count(*) into n from public.vip_claim_access_confirmation_emails(10) where user_id=any(u);
  if n<>0 then raise exception 'VIP_EMAIL_DOUBLE_CLAIM'; end if;
  update public.vip_access_confirmations set email_status='sent',email_next_attempt_at=null where user_id=any(u);
  select count(*) into n from public.vip_access_confirmations;
  if n<>base_count+4 then raise exception 'VIP_UNEXPECTED_EVENT_COUNT'; end if;
end $test$;
rollback;
select 'existing/new/code/reactivation, atomic rollback, channel fanout, leases and terminal email state passed; all fixture changes rolled back' as verification;
