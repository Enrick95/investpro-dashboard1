-- Isolated temporary-table test. No real memberships, auth users, notifications or provider calls are created.
begin;
set local statement_timeout='12s';
create temporary table vip_test_users(id uuid primary key);
insert into vip_test_users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333');
create temporary table vip_access_requests (like public.vip_access_requests including defaults including constraints);
create unique index vip_completion_test_request_id on pg_temp.vip_access_requests(id);
create temporary table vip_memberships (like public.vip_memberships including defaults including constraints);
create unique index vip_completion_test_membership_user on pg_temp.vip_memberships(user_id);
create temporary table investpro_notifications(user_id uuid,event_key text unique,title text,message text,href text);
grant select,insert,update,delete on pg_temp.vip_access_requests,pg_temp.vip_memberships,pg_temp.investpro_notifications to service_role;
create function pg_temp.vip_review_access_request_checked(
  p_request_id uuid, p_action text, p_reviewed_by uuid,
  p_first_name text, p_last_name text, p_type text,
  p_affiliation_broker text, p_paid_on date,
  p_verified_deposit_usd numeric, p_broker_linked_verified boolean,
  p_payment_verified boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_request pg_temp.vip_access_requests%rowtype;
  v_now timestamptz;
  v_expires_at timestamptz;
begin
  if p_request_id is null or p_reviewed_by is null or p_action is null or p_action not in ('approve', 'deny') then
    raise exception 'vip_request_approval_invalid';
  end if;
  select * into v_request from pg_temp.vip_access_requests where id = p_request_id for update;
  if not found or v_request.status <> 'pending' then raise exception 'vip_request_unavailable'; end if;
  v_now := clock_timestamp();
  if p_action = 'deny' then
    update pg_temp.vip_access_requests set status = 'denied', reviewed_at = v_now, reviewed_by = p_reviewed_by
      where id = p_request_id returning * into v_request;
    return to_jsonb(v_request);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_request.user_id::text, 0));
  v_now := clock_timestamp();
  if not public.vip_identity_name_valid(p_first_name) or not public.vip_identity_name_valid(p_last_name)
    or p_type is null or p_type not in ('affiliation', 'abonnement')
    or (p_type = 'affiliation' and (p_affiliation_broker is null or p_affiliation_broker not in ('raise_fx', 'vantage', 'puprime', 'axi') or p_paid_on is not null))
    or (p_type = 'abonnement' and (p_affiliation_broker is not null or p_paid_on is null or not isfinite(p_paid_on) or p_paid_on > (v_now at time zone 'Europe/Paris')::date))
  then raise exception 'vip_request_approval_invalid'; end if;
  if v_request.request_kind = 'new' then
    if p_type <> v_request.type
      or (p_type = 'affiliation' and (
        p_broker_linked_verified is distinct from true or p_verified_deposit_usd is null
        or p_verified_deposit_usd not between 300 and 100000000
        or p_verified_deposit_usd <> round(p_verified_deposit_usd, 2)
        or p_payment_verified is distinct from false
      ))
      or (p_type = 'abonnement' and (
        p_payment_verified is distinct from true or p_broker_linked_verified is distinct from false
        or p_verified_deposit_usd is not null
      ))
    then raise exception 'vip_request_approval_invalid'; end if;
  end if;
  if p_type = 'abonnement' then
    v_expires_at := public.vip_paid_on_expiry(p_paid_on);
    if v_expires_at is null or not isfinite(v_expires_at) or v_expires_at <= v_now then
      raise exception 'vip_request_approval_invalid';
    end if;
  end if;
  if exists (select 1 from pg_temp.vip_memberships where user_id = v_request.user_id) then
    raise exception 'vip_membership_exists';
  end if;
  insert into pg_temp.vip_memberships(
    user_id, email, type, first_name, last_name, affiliation_broker,
    started_at, expires_at, status, created_at, updated_at
  ) values (
    v_request.user_id, v_request.email, p_type, p_first_name, p_last_name, p_affiliation_broker,
    v_now, v_expires_at, 'active', v_now, v_now
  );
  update pg_temp.vip_access_requests set status = 'approved', reviewed_at = v_now, reviewed_by = p_reviewed_by,
    verified_type = p_type, verified_affiliation_broker = p_affiliation_broker, verified_paid_on = p_paid_on, verified_expires_at = v_expires_at,
    verified_deposit_usd = case when v_request.request_kind = 'new' and p_type = 'affiliation' then p_verified_deposit_usd else null end,
    verified_broker_linked = v_request.request_kind = 'new' and p_type = 'affiliation',
    verified_payment = v_request.request_kind = 'new' and p_type = 'abonnement'
    where id = p_request_id returning * into v_request;
  -- Copy is only a request, even when verified funding meets 500 USD.
  -- No Copy service, trade, payment, Telegram invite or push is started here.
  return to_jsonb(v_request);
exception when unique_violation then
  raise exception 'vip_membership_exists';
end;
$$;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

alter table pg_temp.vip_access_requests
  add column revision integer not null default 0 check (revision >= 0),
  add column completion_fields text[] not null default '{}',
  add column completion_note text check (length(completion_note) between 1 and 500),
  add column completion_requested_at timestamptz,
  add column completion_requested_by uuid references pg_temp.vip_test_users(id),
  add column completion_submitted_at timestamptz,
  add column completion_reply text check (length(completion_reply) <= 500),
  add constraint vip_completion_fields_known check (completion_fields <@ array['firstName','lastName','telegramUsername','affiliationBroker','paidOn','brokerAccountKind','brokerAccountId','brokerEmail','declaredDepositUsd','copyRequested','reply']::text[]),
  add constraint vip_completion_request_metadata check (
    cardinality(completion_fields) = 0 or (status = 'pending' and completion_note is not null and completion_requested_at is not null and completion_requested_by is not null)
  );

create table pg_temp.vip_request_completion_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references pg_temp.vip_test_users(id) on delete cascade,
  request_id uuid not null references pg_temp.vip_access_requests(id) on delete cascade,
  revision integer not null check (revision > 0),
  kind text not null check (kind in ('needs_info','submitted')),
  event_key text not null unique,
  title text not null check (length(title) between 1 and 160),
  message text not null check (length(message) between 1 and 1500),
  href text not null check (href in ('/vip/deja-membre','/vip/rejoindre')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email_status text not null default 'pending' check (email_status in ('pending','processing','sent','failed','skipped')),
  email_attempts integer not null default 0 check (email_attempts between 0 and 4),
  email_last_error text,
  email_next_attempt_at timestamptz default now(),
  push_status text not null default 'pending' check (push_status in ('pending','processing','sent','failed','skipped')),
  push_attempts integer not null default 0 check (push_attempts between 0 and 4),
  push_last_error text,
  push_next_attempt_at timestamptz default now(),
  constraint vip_completion_event_identity check (event_key = 'vip:completion:' || kind || ':' || request_id::text || ':' || revision::text || ':' || user_id::text),
  unique (request_id,revision,kind)
);
create index vip_completion_email_pending on pg_temp.vip_request_completion_events(email_next_attempt_at,created_at,id) where email_status in ('pending','failed','processing');
create index vip_completion_push_pending on pg_temp.vip_request_completion_events(push_next_attempt_at,created_at,id) where push_status in ('pending','failed','processing');
alter table pg_temp.vip_request_completion_events enable row level security;
revoke all on pg_temp.vip_request_completion_events from public,anon,authenticated;
grant select,insert,update,delete on pg_temp.vip_request_completion_events to service_role;

create function pg_temp.vip_completion_allowed_fields(p_kind text,p_type text)
returns text[] language sql immutable security invoker set search_path = '' as $$
 select array['firstName','lastName','telegramUsername','reply']::text[] ||
 case when p_type='abonnement' then array['paidOn']::text[] else
 array['affiliationBroker']::text[] || case when p_kind='new' then array['brokerAccountKind','brokerAccountId','brokerEmail','declaredDepositUsd','copyRequested']::text[] else '{}'::text[] end end;
$$;
revoke all on function pg_temp.vip_completion_allowed_fields(text,text) from public,anon,authenticated;
grant execute on function pg_temp.vip_completion_allowed_fields(text,text) to service_role;

create function pg_temp.vip_request_completion_action(p_request_id uuid,p_expected_revision integer,p_actor_id uuid,p_fields text[],p_note text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_request pg_temp.vip_access_requests%rowtype; v_labels text; v_title text := 'Votre dossier VIP est à compléter'; v_message text; v_href text; v_key text;
begin
  if p_actor_id is null then raise exception 'vip_request_approval_invalid'; end if;
  select * into v_request from pg_temp.vip_access_requests where id=p_request_id for update;
  if not found or v_request.status<>'pending' then raise exception 'vip_request_unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_request.user_id::text,0));
  if exists(select 1 from pg_temp.vip_memberships where user_id=v_request.user_id) then raise exception 'vip_request_unavailable'; end if;
  if p_expected_revision is null or v_request.revision<>p_expected_revision then raise exception 'vip_request_revision_conflict'; end if;
  if p_fields is null or cardinality(p_fields)<1 or cardinality(p_fields)>11 or array_position(p_fields,null) is not null
    or not p_fields <@ pg_temp.vip_completion_allowed_fields(v_request.request_kind,v_request.type)
    or cardinality(p_fields)<>(select count(distinct value) from unnest(p_fields) value)
    or p_note is null or length(btrim(p_note)) not between 1 and 500 then raise exception 'vip_completion_invalid'; end if;
  update pg_temp.vip_access_requests set revision=revision+1,completion_fields=p_fields,completion_note=btrim(p_note),
    completion_requested_at=clock_timestamp(),completion_requested_by=p_actor_id,completion_submitted_at=null,completion_reply=null,
    verified_deposit_usd=null,verified_broker_linked=false,verified_payment=false
    where id=p_request_id returning * into v_request;
  select string_agg(case value
    when 'firstName' then 'Prénom' when 'lastName' then 'Nom' when 'telegramUsername' then 'Pseudo Telegram'
    when 'affiliationBroker' then 'Broker de votre affiliation' when 'paidOn' then 'Date du dernier paiement'
    when 'brokerAccountKind' then 'Situation du compte broker' when 'brokerAccountId' then 'Numéro du compte broker'
    when 'brokerEmail' then 'E-mail chez le broker' when 'declaredDepositUsd' then 'Dépôt réel en dollars, hors bonus'
    when 'copyRequested' then 'Souhait d’accès à InvestPro Copy' when 'reply' then 'Précision pour l’équipe' end, E'\n• ' order by ordinal)
    into v_labels from unnest(p_fields) with ordinality fields(value,ordinal);
  v_message := 'Pour poursuivre votre adhésion, complétez les informations suivantes :' || E'\n• ' || v_labels || E'\n\n' || btrim(p_note);
  v_href := case when v_request.request_kind='new' then '/vip/rejoindre' else '/vip/deja-membre' end;
  v_key := 'vip:completion:needs_info:' || p_request_id::text || ':' || v_request.revision::text || ':' || v_request.user_id::text;
  insert into pg_temp.vip_request_completion_events(user_id,request_id,revision,kind,event_key,title,message,href)
    values(v_request.user_id,p_request_id,v_request.revision,'needs_info',v_key,v_title,v_message,v_href);
  insert into pg_temp.investpro_notifications(user_id,event_key,title,message,href) values(v_request.user_id,v_key,v_title,v_message,v_href);
  return to_jsonb(v_request);
end;
$$;
revoke all on function pg_temp.vip_request_completion_action(uuid,integer,uuid,text[],text) from public,anon,authenticated;
grant execute on function pg_temp.vip_request_completion_action(uuid,integer,uuid,text[],text) to service_role;

create function pg_temp.vip_submit_request_completion(p_request_id uuid,p_user_id uuid,p_expected_revision integer,p_values jsonb,p_reply text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_request pg_temp.vip_access_requests%rowtype; v_field text; v_columns text[]; v_title text := 'Vos compléments VIP ont été reçus'; v_message text := 'Vos informations ont bien été transmises à l’équipe. Votre dossier reste en attente de vérification avant l’ouverture de l’accès VIP.'; v_href text; v_key text;
begin
  select * into v_request from pg_temp.vip_access_requests where id=p_request_id and user_id=p_user_id for update;
  if not found or v_request.status<>'pending' or cardinality(v_request.completion_fields)=0 then raise exception 'vip_request_unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  if exists(select 1 from pg_temp.vip_memberships where user_id=p_user_id) then raise exception 'vip_request_unavailable'; end if;
  if p_expected_revision is null or v_request.revision<>p_expected_revision then raise exception 'vip_request_revision_conflict'; end if;
  if jsonb_typeof(p_values) is distinct from 'object' or p_reply is null or length(p_reply)>500
    or ('reply'=any(v_request.completion_fields) and length(btrim(p_reply))=0) then raise exception 'vip_completion_invalid'; end if;
  select coalesce(array_agg(case value
    when 'firstName' then 'first_name' when 'lastName' then 'last_name' when 'telegramUsername' then 'telegram_username'
    when 'affiliationBroker' then 'affiliation_broker' when 'paidOn' then 'paid_on'
    when 'brokerAccountKind' then 'broker_account_kind' when 'brokerAccountId' then 'broker_account_id'
    when 'brokerEmail' then 'broker_email' when 'declaredDepositUsd' then 'declared_deposit_usd' when 'copyRequested' then 'copy_requested' end),'{}'::text[])
    into v_columns from unnest(v_request.completion_fields) value where value<>'reply';
  if (select count(*) from jsonb_object_keys(p_values))<>cardinality(v_columns) then raise exception 'vip_completion_invalid'; end if;
  for v_field in select jsonb_object_keys(p_values) loop
    if not v_field=any(v_columns) then raise exception 'vip_completion_invalid'; end if;
  end loop;
  -- jsonb_populate_record is safe only after the exact editable-column allowlist above.
  -- The authenticated owner cannot alter user_id, type, request_kind, status or verification.
  v_request := jsonb_populate_record(v_request,p_values);
  update pg_temp.vip_access_requests set first_name=v_request.first_name,last_name=v_request.last_name,telegram_username=v_request.telegram_username,
    affiliation_broker=v_request.affiliation_broker,paid_on=v_request.paid_on,broker_account_kind=v_request.broker_account_kind,
    broker_account_id=v_request.broker_account_id,broker_email=v_request.broker_email,declared_deposit_usd=v_request.declared_deposit_usd,copy_requested=v_request.copy_requested,
    revision=revision+1,completion_fields='{}',completion_submitted_at=clock_timestamp(),completion_reply=btrim(p_reply),
    verified_deposit_usd=null,verified_broker_linked=false,verified_payment=false
    where id=p_request_id returning * into v_request;
  v_href := case when v_request.request_kind='new' then '/vip/rejoindre' else '/vip/deja-membre' end;
  v_key := 'vip:completion:submitted:' || p_request_id::text || ':' || v_request.revision::text || ':' || v_request.user_id::text;
  insert into pg_temp.vip_request_completion_events(user_id,request_id,revision,kind,event_key,title,message,href)
    values(v_request.user_id,p_request_id,v_request.revision,'submitted',v_key,v_title,v_message,v_href);
  insert into pg_temp.investpro_notifications(user_id,event_key,title,message,href) values(v_request.user_id,v_key,v_title,v_message,v_href);
  return to_jsonb(v_request);
end;
$$;
revoke all on function pg_temp.vip_submit_request_completion(uuid,uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function pg_temp.vip_submit_request_completion(uuid,uuid,integer,jsonb,text) to service_role;

create function pg_temp.vip_review_access_request_revision(
  p_request_id uuid,p_expected_revision integer,p_action text,p_reviewed_by uuid,
  p_first_name text,p_last_name text,p_type text,p_affiliation_broker text,p_paid_on date,
  p_verified_deposit_usd numeric,p_broker_linked_verified boolean,p_payment_verified boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_request pg_temp.vip_access_requests%rowtype;
begin
  select * into v_request from pg_temp.vip_access_requests where id=p_request_id for update;
  if not found or v_request.status<>'pending' then raise exception 'vip_request_unavailable'; end if;
  if p_expected_revision is null or v_request.revision<>p_expected_revision then raise exception 'vip_request_revision_conflict'; end if;
  if p_action='approve' and cardinality(v_request.completion_fields)>0 then raise exception 'vip_completion_outstanding'; end if;
  -- Denial closes an outstanding checklist atomically; approval can never skip one.
  if p_action='deny' then update pg_temp.vip_access_requests set completion_fields='{}' where id=p_request_id; end if;
  return pg_temp.vip_review_access_request_checked(p_request_id,p_action,p_reviewed_by,p_first_name,p_last_name,p_type,p_affiliation_broker,p_paid_on,p_verified_deposit_usd,p_broker_linked_verified,p_payment_verified);
end;
$$;
revoke all on function pg_temp.vip_review_access_request_revision(uuid,integer,text,uuid,text,text,text,text,date,numeric,boolean,boolean) from public,anon,authenticated;
grant execute on function pg_temp.vip_review_access_request_revision(uuid,integer,text,uuid,text,text,text,text,date,numeric,boolean,boolean) to service_role;

create function pg_temp.vip_claim_request_completion_notifications(p_channel text,p_limit integer default 10)
returns setof pg_temp.vip_request_completion_events language plpgsql security invoker set search_path = '' as $$
begin
 if p_channel='email' then
  return query with candidates as (
    select id from pg_temp.vip_request_completion_events where email_attempts<4 and created_at>now()-interval '23 hours' and
      ((email_status in ('pending','failed') and email_next_attempt_at<=now()) or (email_status='processing' and updated_at<now()-interval '10 minutes'))
    order by created_at,id for update skip locked limit greatest(1,least(coalesce(p_limit,10),10))
  ) update pg_temp.vip_request_completion_events event set email_status='processing',email_attempts=email_attempts+1,updated_at=now()
    from candidates where event.id=candidates.id returning event.*;
 elsif p_channel='push' then
  return query with candidates as (
    select id from pg_temp.vip_request_completion_events where push_attempts<4 and created_at>now()-interval '23 hours' and
      ((push_status in ('pending','failed') and push_next_attempt_at<=now()) or (push_status='processing' and updated_at<now()-interval '10 minutes'))
    order by created_at,id for update skip locked limit greatest(1,least(coalesce(p_limit,10),10))
  ) update pg_temp.vip_request_completion_events event set push_status='processing',push_attempts=push_attempts+1,updated_at=now()
    from candidates where event.id=candidates.id returning event.*;
 else raise exception 'vip_completion_channel_invalid'; end if;
end;
$$;
revoke all on function pg_temp.vip_claim_request_completion_notifications(text,integer) from public,anon,authenticated;
grant execute on function pg_temp.vip_claim_request_completion_notifications(text,integer) to service_role;


insert into pg_temp.vip_access_requests(id,user_id,email,first_name,last_name,type,affiliation_broker,request_kind,broker_account_kind,broker_account_id,declared_deposit_usd)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','fixture@example.test','Fixture','Member','affiliation','axi','new','new','AXI-1',500);
do $$ declare r jsonb; n integer; begin
 r:=pg_temp.vip_request_completion_action('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',0,'33333333-3333-4333-8333-333333333333',array['brokerAccountId','reply'],'Vérifiez votre numéro de compte.');
 if r->>'revision'<>'1' or r->>'status'<>'pending' or r->'completion_fields'<> '["brokerAccountId","reply"]'::jsonb then raise exception 'checklist_not_saved'; end if;
 if exists(select 1 from pg_temp.vip_memberships) then raise exception 'checklist_granted_access'; end if;
 if (select count(*) from pg_temp.vip_request_completion_events)<>1 or (select count(*) from pg_temp.investpro_notifications)<>1 then raise exception 'checklist_event_missing'; end if;
 begin perform pg_temp.vip_request_completion_action('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',0,'33333333-3333-4333-8333-333333333333',array['reply'],'Stale'); raise exception 'accepted_stale_admin_request'; exception when others then if sqlerrm<>'vip_request_revision_conflict' then raise; end if; end;
 begin perform pg_temp.vip_review_access_request_revision('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,'approve','33333333-3333-4333-8333-333333333333','Fixture','Member','affiliation','axi',null,500,true,false); raise exception 'approved_outstanding'; exception when others then if sqlerrm<>'vip_completion_outstanding' then raise; end if; end;
 begin perform pg_temp.vip_submit_request_completion('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222',1,'{"broker_account_id":"EVIL"}','reply'); raise exception 'foreign_owner_accepted'; exception when others then if sqlerrm<>'vip_request_unavailable' then raise; end if; end;
 begin perform pg_temp.vip_submit_request_completion('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',1,'{"status":"approved"}','reply'); raise exception 'selfgrant_accepted'; exception when others then if sqlerrm<>'vip_completion_invalid' then raise; end if; end;
 begin perform pg_temp.vip_submit_request_completion('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',1,'{"broker_account_id":"AXI-2"}',''); raise exception 'empty_required_reply_accepted'; exception when others then if sqlerrm<>'vip_completion_invalid' then raise; end if; end;
 r:=pg_temp.vip_submit_request_completion('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',1,'{"broker_account_id":"AXI-2"}','Voici la référence confirmée.');
 if r->>'revision'<>'2' or r->>'status'<>'pending' or r->'completion_fields'<>'[]'::jsonb or r->>'broker_account_id'<>'AXI-2' then raise exception 'resubmit_not_saved'; end if;
 if exists(select 1 from pg_temp.vip_memberships) then raise exception 'resubmit_granted_access'; end if;
 if (select count(*) from pg_temp.vip_request_completion_events)<>2 or (select count(*) from pg_temp.investpro_notifications)<>2 then raise exception 'resubmit_event_missing'; end if;
 begin perform pg_temp.vip_review_access_request_revision('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,'approve','33333333-3333-4333-8333-333333333333','Fixture','Member','affiliation','axi',null,500,true,false); raise exception 'stale_approval_accepted'; exception when others then if sqlerrm<>'vip_request_revision_conflict' then raise; end if; end;
 begin perform pg_temp.vip_submit_request_completion('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',2,'{"broker_account_id":"AXI-3"}','repeat'); raise exception 'resubmitted_without_checklist'; exception when others then if sqlerrm<>'vip_request_unavailable' then raise; end if; end;
 begin perform pg_temp.vip_review_access_request_revision('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2,'approve','33333333-3333-4333-8333-333333333333','Fixture','Member','affiliation','axi',null,500,false,false); raise exception 'approval_skipped_broker_reverification'; exception when others then if sqlerrm<>'vip_request_approval_invalid' then raise; end if; end;
 r:=pg_temp.vip_review_access_request_revision('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2,'approve','33333333-3333-4333-8333-333333333333','Fixture','Member','affiliation','axi',null,500,true,false);
 if r->>'status'<>'approved' or not exists(select 1 from pg_temp.vip_memberships where user_id='11111111-1111-4111-8111-111111111111' and status='active') then raise exception 'verified_approval_failed'; end if;
 begin perform pg_temp.vip_request_completion_action('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2,'33333333-3333-4333-8333-333333333333',array['reply'],'terminal'); raise exception 'terminal_checklist_accepted'; exception when others then if sqlerrm<>'vip_request_unavailable' then raise; end if; end;
 select count(*) into n from pg_temp.vip_claim_request_completion_notifications('email',10); if n<>2 then raise exception 'email_claim_missing'; end if;
 select count(*) into n from pg_temp.vip_claim_request_completion_notifications('email',10); if n<>0 then raise exception 'duplicate_email_lease'; end if;
 select count(*) into n from pg_temp.vip_claim_request_completion_notifications('push',10); if n<>2 then raise exception 'independent_push_lease_missing'; end if;
 select count(*) into n from pg_temp.vip_claim_request_completion_notifications('push',10); if n<>0 then raise exception 'duplicate_push_lease'; end if;
 if has_table_privilege('authenticated','pg_temp.vip_request_completion_events','select') or has_table_privilege('anon','pg_temp.vip_request_completion_events','insert') then raise exception 'private_event_leaked'; end if;
 if has_function_privilege('authenticated','pg_temp.vip_submit_request_completion(uuid,uuid,integer,jsonb,text)','execute') then raise exception 'rpc_exposed'; end if;
end $$;
-- A former member's subscription follows the same protected completion flow.
insert into pg_temp.vip_access_requests(id,user_id,email,first_name,last_name,type,paid_on,request_kind)
values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','former@example.test','Former','Member','abonnement',(now() at time zone 'Europe/Paris')::date,'existing');
do $$ declare r jsonb; begin
 begin perform pg_temp.vip_request_completion_action('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',0,'33333333-3333-4333-8333-333333333333',array['brokerAccountId'],'Wrong field'); raise exception 'wrong_origin_field_accepted'; exception when others then if sqlerrm<>'vip_completion_invalid' then raise; end if; end;
 r:=pg_temp.vip_request_completion_action('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',0,'33333333-3333-4333-8333-333333333333',array['paidOn'],'Confirmez la date.');
 if r->>'revision'<>'1' then raise exception 'former_completion_failed'; end if;
 r:=pg_temp.vip_submit_request_completion('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222',1,jsonb_build_object('paid_on',(now() at time zone 'Europe/Paris')::date),'');
 if r->>'revision'<>'2' then raise exception 'former_resubmit_failed'; end if;
 r:=pg_temp.vip_request_completion_action('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',2,'33333333-3333-4333-8333-333333333333',array['reply'],'Autre précision.');
 r:=pg_temp.vip_review_access_request_revision('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',3,'deny','33333333-3333-4333-8333-333333333333',null,null,null,null,null,null,false,false);
 if r->>'status'<>'denied' or r->'completion_fields'<>'[]'::jsonb then raise exception 'deny_outstanding_failed'; end if;
end $$;
select 'VIP completion SQL checks passed' as result;
rollback;
