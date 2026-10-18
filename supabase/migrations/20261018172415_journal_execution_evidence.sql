-- Metadata-only extension. Apply after journal_outcome_annotations.sql.
-- The importer precondition prevents replacing a concurrently changed definition.
begin;

do $precondition$
begin
  if pg_catalog.to_regprocedure('public.investpro_mt_receive(uuid,text,jsonb)') is null
     or pg_catalog.md5(pg_catalog.pg_get_functiondef('public.investpro_mt_receive(uuid,text,jsonb)'::regprocedure))
       <> 'f0229fa11bc704ee9114a926bd59c657' then
    raise exception 'investpro_mt_receive changed; review its current definition before applying exit evidence';
  end if;
end;
$precondition$;

-- Returns the classification only after validating the complete proof contract.
-- It never uses net PnL or an incoming automatic/classification flag.
create function public.investpro_mt_execution_is_be(
  p_metadata jsonb, p_external_id text, p_entry_price numeric, p_platform text
) returns boolean
language plpgsql immutable security invoker set search_path = ''
as $proof$
declare
  v_record jsonb;
  v_ticket text;
  v_seen numeric[] := array[]::numeric[];
  v_time numeric;
  v_step numeric;
  v_price numeric;
  v_volume numeric;
  v_entry_volume numeric := 0;
  v_exit_volume numeric := 0;
  v_weighted_sum numeric := 0;
  v_weighted_entry numeric;
  v_last_entry numeric := 0;
  v_first_exit numeric := 9007199254740991;
  v_all_sl boolean := true;
  v_sl numeric;
begin
  if p_metadata is null or pg_catalog.jsonb_typeof(p_metadata) is distinct from 'object' then
    raise exception using errcode='22023', message='Invalid execution metadata object';
  end if;
  if p_metadata - array['version','platform','source','position_id','price_step','entries','exits'] <> '{}'::jsonb then
    raise exception using errcode='22023', message='Unknown execution metadata field';
  end if;
  if p_metadata->'version' is distinct from '1'::jsonb
     or p_metadata->>'platform' is distinct from 'MT5'
     or p_platform is distinct from 'MT5'
     or p_metadata->>'source' is distinct from 'mt5_history_deal_sl'
     or pg_catalog.jsonb_typeof(p_metadata->'position_id') is distinct from 'string'
     or p_metadata->>'position_id' !~ '^[0-9]{1,30}$'
     or p_metadata->>'position_id' ~ '^0+$'
     or p_external_id is distinct from ('mt5:' || (p_metadata->>'position_id')) then
    raise exception using errcode='22023', message='Execution metadata identity mismatch';
  end if;
  if pg_catalog.jsonb_typeof(p_metadata->'price_step') is distinct from 'number' then
    raise exception using errcode='22023', message='Invalid execution price step';
  end if;
  v_step := (p_metadata->>'price_step')::numeric;
  if not (v_step > 0 and v_step < 1e12)
     or p_entry_price is null or not (p_entry_price > 0 and p_entry_price < 1e12) then
    raise exception using errcode='22023', message='Invalid execution prices';
  end if;
  if pg_catalog.jsonb_typeof(p_metadata->'entries') is distinct from 'array'
     or pg_catalog.jsonb_typeof(p_metadata->'exits') is distinct from 'array' then
    raise exception using errcode='22023', message='Invalid execution deal arrays';
  end if;
  if pg_catalog.jsonb_array_length(p_metadata->'entries') not between 1 and 16
     or pg_catalog.jsonb_array_length(p_metadata->'exits') not between 1 and 16 then
    raise exception using errcode='22023', message='Execution proof requires 1 to 16 entries and exits';
  end if;

  for v_record in select value from pg_catalog.jsonb_array_elements(
    (p_metadata->'entries') || (p_metadata->'exits')
  ) loop
    if pg_catalog.jsonb_typeof(v_record) is distinct from 'object'
       or pg_catalog.jsonb_typeof(v_record->'ticket') is distinct from 'string'
       or v_record->>'ticket' !~ '^[0-9]{1,30}$'
       or v_record->>'ticket' ~ '^0+$'
       or pg_catalog.jsonb_typeof(v_record->'time_msc') is distinct from 'number'
       or pg_catalog.jsonb_typeof(v_record->'price') is distinct from 'number'
       or pg_catalog.jsonb_typeof(v_record->'volume') is distinct from 'number' then
      raise exception using errcode='22023', message='Invalid execution deal';
    end if;
    v_ticket := v_record->>'ticket';
    if v_ticket::numeric = any(v_seen) then
      raise exception using errcode='22023', message='Duplicate execution ticket';
    end if;
    v_seen := pg_catalog.array_append(v_seen, v_ticket::numeric);
    v_time := (v_record->>'time_msc')::numeric;
    v_price := (v_record->>'price')::numeric;
    v_volume := (v_record->>'volume')::numeric;
    if not (v_time >= 0 and v_time <= 9007199254740991 and pg_catalog.trunc(v_time)=v_time
       and v_price > 0 and v_price < 1e12 and v_volume > 0 and v_volume < 1e12) then
      raise exception using errcode='22023', message='Execution deal values out of range';
    end if;
  end loop;

  for v_record in select value from pg_catalog.jsonb_array_elements(p_metadata->'entries') loop
    if v_record - array['ticket','time_msc','price','volume'] <> '{}'::jsonb then
      raise exception using errcode='22023', message='Unknown execution entry field';
    end if;
    v_volume := (v_record->>'volume')::numeric;
    v_entry_volume := v_entry_volume + v_volume;
    v_weighted_sum := v_weighted_sum + (v_record->>'price')::numeric * v_volume;
    v_last_entry := greatest(v_last_entry, (v_record->>'time_msc')::numeric);
  end loop;
  v_weighted_entry := v_weighted_sum / v_entry_volume;
  if pg_catalog.abs(v_weighted_entry - p_entry_price) > v_step * 0.000001 then
    raise exception using errcode='22023', message='Execution entry price mismatch';
  end if;

  for v_record in select value from pg_catalog.jsonb_array_elements(p_metadata->'exits') loop
    if v_record - array['ticket','time_msc','price','volume','reason','stop_loss'] <> '{}'::jsonb
       or pg_catalog.jsonb_typeof(v_record->'reason') is distinct from 'string'
       or v_record->>'reason' not in ('sl','tp','manual','other')
       or not (v_record ? 'stop_loss')
       or (pg_catalog.jsonb_typeof(v_record->'stop_loss') is distinct from 'number'
           and pg_catalog.jsonb_typeof(v_record->'stop_loss') is distinct from 'null') then
      raise exception using errcode='22023', message='Invalid execution close reason or SL';
    end if;
    v_sl := case when v_record->'stop_loss'='null'::jsonb then null
                 else (v_record->>'stop_loss')::numeric end;
    if v_sl is not null and not (v_sl >= 0 and v_sl < 1e12) then
      raise exception using errcode='22023', message='Invalid execution SL price';
    end if;
    v_exit_volume := v_exit_volume + (v_record->>'volume')::numeric;
    v_first_exit := least(v_first_exit, (v_record->>'time_msc')::numeric);
    if v_record->>'reason' <> 'sl' or v_sl is null or v_sl <= 0
       or pg_catalog.abs(v_sl-v_weighted_entry) > v_step * 0.500001 then
      v_all_sl := false;
    end if;
  end loop;
  if v_last_entry > v_first_exit or pg_catalog.abs(v_entry_volume-v_exit_volume) > 0.0000001 then
    return false;
  end if;
  return v_all_sl;
end;
$proof$;

revoke all on function public.investpro_mt_execution_is_be(jsonb,text,numeric,text) from public, anon, authenticated, service_role;
grant execute on function public.investpro_mt_execution_is_be(jsonb,text,numeric,text) to authenticated, service_role;

create table public.trading_journal_exit_evidence (
  trade_id bigint primary key references public.trading_journal(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sync_connection_id uuid not null references public.investpro_mt_connections(id) on delete cascade,
  sync_external_id text not null,
  entry_price numeric not null,
  execution_metadata jsonb not null,
  observed_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint trading_journal_exit_evidence_contract check (
    public.investpro_mt_execution_is_be(execution_metadata,sync_external_id,entry_price,'MT5') is not null
  )
);
create index trading_journal_exit_evidence_user_idx on public.trading_journal_exit_evidence(user_id);
create index trading_journal_exit_evidence_connection_idx on public.trading_journal_exit_evidence(sync_connection_id);
alter table public.trading_journal_exit_evidence enable row level security;
create policy trading_journal_exit_evidence_select_own
  on public.trading_journal_exit_evidence for select to authenticated
  using (
    user_id=(select auth.uid())
    and exists (
      select 1 from public.trading_journal j
      where j.id=trading_journal_exit_evidence.trade_id
        and j.user_id=(select auth.uid())
        and j.sync_connection_id=trading_journal_exit_evidence.sync_connection_id
        and j.sync_external_id=trading_journal_exit_evidence.sync_external_id
    )
  );
revoke all on table public.trading_journal_exit_evidence from public,anon,authenticated,service_role;
grant select on table public.trading_journal_exit_evidence to authenticated;
grant select,insert,update on table public.trading_journal_exit_evidence to service_role;

-- Validate relationships even on direct trusted-server writes. Nothing here
-- changes the source row or relaxes the original imported-trade guard.
create function public.investpro_mt_check_exit_evidence() returns trigger
language plpgsql security invoker set search_path=''
as $identity$
declare
  v_j public.trading_journal%rowtype;
  v_c public.investpro_mt_connections%rowtype;
begin
  select * into v_c from public.investpro_mt_connections where id=new.sync_connection_id for share;
  select * into v_j from public.trading_journal where id=new.trade_id for share;
  if not found or v_c.id is null or v_c.platform is distinct from 'MT5'
     or v_j.user_id is distinct from new.user_id or v_c.user_id is distinct from new.user_id
     or v_j.sync_connection_id is distinct from new.sync_connection_id
     or v_j.sync_external_id is distinct from new.sync_external_id
     or v_j.account_id is distinct from v_c.account_id
     or v_j.status not in ('win','loss','breakeven')
     or v_j.entry_price is distinct from new.entry_price then
    raise exception using errcode='22023', message='Exit evidence does not belong to the imported closed trade';
  end if;
  return new;
end;
$identity$;
revoke all on function public.investpro_mt_check_exit_evidence() from public,anon,authenticated,service_role;
create trigger investpro_mt_exit_evidence_identity before insert or update on public.trading_journal_exit_evidence
  for each row execute function public.investpro_mt_check_exit_evidence();

CREATE OR REPLACE FUNCTION public.investpro_mt_receive(p_connection uuid, p_hash text, p_snapshot jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.investpro_mt_connections%rowtype; t jsonb; amount numeric; stamp timestamptz; evidence_trade_id bigint; evidence_entry_price numeric;
begin
 select * into c from public.investpro_mt_connections where id=p_connection for update;
 if not found or c.revoked or c.token_hash<>p_hash then raise exception 'invalid connection'; end if;
 if c.platform<>coalesce(p_snapshot->>'platform','MT5') then raise exception 'platform mismatch'; end if;
 if c.login<>p_snapshot->>'login' or c.server<>p_snapshot->>'server' or c.currency<>p_snapshot->>'currency' then raise exception 'account mismatch'; end if;
 if not exists(select 1 from public.trading_accounts where id=c.account_id and user_id=c.user_id) then raise exception 'ownership mismatch'; end if;
 stamp:=(p_snapshot->>'observed_at')::timestamptz;
 if c.observed_at is not null and stamp<c.observed_at then raise exception 'stale snapshot'; end if;
 for t in select value from jsonb_array_elements(p_snapshot->'trades') loop
  if (t->>'external_id') !~ ('^'||lower(c.platform)||':[0-9]+$') then raise exception 'ticket platform mismatch'; end if;
  amount:=(t->>'result_amount')::numeric;
  insert into public.trading_journal(user_id,account_id,account_balance,trade_date,symbol,direction,entry_price,stop_loss,take_profit,risk_percent,result_amount,result_r,status,setup,notes,sync_connection_id,sync_external_id,updated_at)
  values(c.user_id,c.account_id,null,case when c.platform='MT4' then (t->>'trade_date')::date::timestamp at time zone 'UTC' else (t->>'trade_date')::timestamptz end,t->>'symbol',t->>'direction',(t->>'entry_price')::numeric,null,null,null,amount,null,case when amount>0 then 'win' when amount<0 then 'loss' else 'breakeven' end,c.platform||' synchronisé',case when c.platform='MT4' then 'Ticket clôturé MT4, partiels comptés séparément. Date de clôture du calendrier broker (heure non importée). PnL avec commission et swap du ticket. Risque initial et R indisponibles.' else 'Position clôturée MT5. PnL net des frais rattachés à la position. Risque initial et R non disponibles.' end,c.id,t->>'external_id',now())
  on conflict(sync_connection_id,sync_external_id) do update set trade_date=excluded.trade_date,symbol=excluded.symbol,direction=excluded.direction,entry_price=excluded.entry_price,result_amount=excluded.result_amount,status=excluded.status,updated_at=now();
  -- Optional v1 evidence is metadata only. Missing fields preserve legacy imports.
  if t ? 'execution_metadata' then
   select j.id, j.entry_price into evidence_trade_id, evidence_entry_price
   from public.trading_journal j
   where j.sync_connection_id=c.id and j.sync_external_id=t->>'external_id'
     and j.user_id=c.user_id;
   if not found then raise exception 'evidence trade identity mismatch'; end if;
   perform public.investpro_mt_execution_is_be(t->'execution_metadata',t->>'external_id',evidence_entry_price,c.platform);
   insert into public.trading_journal_exit_evidence
     (trade_id,user_id,sync_connection_id,sync_external_id,entry_price,execution_metadata,observed_at,updated_at)
   values(evidence_trade_id,c.user_id,c.id,t->>'external_id',evidence_entry_price,t->'execution_metadata',stamp,now())
   on conflict(trade_id) do update set user_id=excluded.user_id,
     sync_connection_id=excluded.sync_connection_id,sync_external_id=excluded.sync_external_id,
     entry_price=excluded.entry_price,execution_metadata=excluded.execution_metadata,
     observed_at=excluded.observed_at,updated_at=excluded.updated_at;
  end if;
 end loop;
 update public.trading_accounts set current_balance=(p_snapshot->>'balance')::numeric,updated_at=now() where id=c.account_id and user_id=c.user_id;
 update public.investpro_mt_connections set last_sync=now(),observed_at=stamp,warnings=p_snapshot->'warnings' where id=c.id;
end $function$;


-- CREATE OR REPLACE retained this function's original ownership and execute ACL.
-- Base import/financial/account balance statements above are unchanged.

do $view$
declare v_columns text;
begin
  select pg_catalog.string_agg(
    case when column_name='status' then
      'case when j.status::text in (''win'',''loss'',''breakeven'') then coalesce(o.outcome,case when proof.automatic_be then ''breakeven''::text else j.status::text end) else j.status::text end as status'
    else pg_catalog.format('j.%I',column_name) end,
    ', ' order by ordinal_position
  ) into v_columns from information_schema.columns
  where table_schema='public' and table_name='trading_journal';
  execute pg_catalog.format(
    'create or replace view public.trading_journal_effective with (security_invoker=true) as
     select %s, j.status as source_status,
       case when j.status::text in (''win'',''loss'',''breakeven'') then o.outcome else null::text end as outcome_override,
       case when j.status::text in (''win'',''loss'',''breakeven'') and o.outcome is not null then ''manual''::text
            when proof.automatic_be then ''automatic''::text else ''source''::text end as outcome_source,
       proof.automatic_be
     from public.trading_journal j
     left join public.trading_journal_outcomes o on o.trade_id=j.id and o.user_id=j.user_id
     left join public.trading_journal_exit_evidence e on e.trade_id=j.id and e.user_id=j.user_id
       and e.sync_connection_id=j.sync_connection_id and e.sync_external_id=j.sync_external_id
     cross join lateral (
       select case when e.trade_id is not null and j.status::text in (''win'',''loss'',''breakeven'')
         and j.entry_price is not null
         and abs(j.entry_price-e.entry_price) <= (e.execution_metadata->>''price_step'')::numeric*0.000001
         then public.investpro_mt_execution_is_be(e.execution_metadata,e.sync_external_id,e.entry_price,''MT5'')
         else false end as automatic_be
     ) proof',
    v_columns
  );
end;
$view$;
comment on table public.trading_journal_exit_evidence is
  'Validated MT5 deal/DEAL_SL evidence; reserved server writes, owner read, no source financial mutation.';
comment on view public.trading_journal_effective is
  'Caller-RLS journal projection: manual outcome first, verified MT5 entry-SL exit next, original source otherwise.';

commit;

