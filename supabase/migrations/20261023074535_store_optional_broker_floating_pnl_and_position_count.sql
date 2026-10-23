-- Optional live receiver metrics. Prepared from the production definitions read
-- on 2026-10-23; not applied by the authoring agent.
-- No existing financial, trade import, funding, lease or generation logic changes.
begin;

-- Refuse to overwrite a production routine that changed after this review.
do $baseline$
begin
 if md5(pg_get_functiondef('public.investpro_hosted_receive_v2(uuid,uuid,integer,text,jsonb)'::regprocedure))
    <> 'c1ba55859b1e598d6d1fa35adce0127f' then
  raise exception 'hosted v2 baseline changed; review before applying account metrics';
 end if;
 if md5(pg_get_functiondef('public.investpro_hosted_receive(uuid,uuid,integer,text,jsonb)'::regprocedure))
    <> 'a6ac3d1e8366737902c88fae965a7485' then
  raise exception 'hosted receive baseline changed; review before applying account metrics';
 end if;
 if md5(pg_get_functiondef('public.investpro_mt_receive(uuid,text,jsonb)'::regprocedure))
    <> '9fc1f8747cf60e04f0dfd97178667c81' then
  raise exception 'metasync receive baseline changed; review before applying account metrics';
 end if;
end $baseline$;

alter table public.investpro_mt_hosted
 add column floating_pnl numeric,
 add column open_positions integer,
 add column metrics_observed_at timestamptz,
 add constraint investpro_mt_hosted_floating_pnl_range check (floating_pnl is null or abs(floating_pnl)<1e12),
 add constraint investpro_mt_hosted_open_positions_range check (open_positions is null or open_positions between 0 and 100000),
 add constraint investpro_mt_hosted_metrics_timestamp_consistency check (
  (floating_pnl is null and open_positions is null) = (metrics_observed_at is null)
 );

comment on column public.investpro_mt_hosted.floating_pnl is
 'Broker-reported account floating P&L in the account currency. NULL means unavailable; never inferred from equity minus balance.';
comment on column public.investpro_mt_hosted.open_positions is
 'Broker-confirmed count of market positions. Pending orders are excluded. NULL means unavailable.';
comment on column public.investpro_mt_hosted.metrics_observed_at is
 'Snapshot observed_at for optional metrics, equal to the balance/equity observation. NULL if optional metrics were not supplied.';

CREATE OR REPLACE FUNCTION public.investpro_hosted_receive_v2(p_worker uuid, p_id uuid, p_generation integer, p_status text, p_snapshot jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare h investpro_mt_hosted%rowtype; f jsonb; reference numeric; incoming numeric; outgoing numeric; method text;
begin
 -- This call validates lease, active generation, ownership, platform and snapshot identity,
 -- then imports trades atomically. Its row locks remain held in this transaction.
 perform investpro_hosted_receive(p_worker,p_id,p_generation,p_status,p_snapshot);
 if p_snapshot is null then return; end if;
 select * into h from investpro_mt_hosted where id=p_id;
 update investpro_mt_hosted set equity=(p_snapshot->>'equity')::numeric where id=p_id;
 -- Optional account metrics are the broker's exact values, not equity minus balance.
 -- Older worker snapshots clear previous optional values instead of making them
 -- look freshly confirmed by the new balance/equity snapshot.
 if coalesce(jsonb_typeof(p_snapshot->'floating_pnl'),'null')<>'null' then
  if jsonb_typeof(p_snapshot->'floating_pnl')<>'number' then raise exception 'invalid floating pnl'; end if;
  if not (abs((p_snapshot->>'floating_pnl')::numeric)<1e12) then raise exception 'invalid floating pnl'; end if;
 end if;
 if coalesce(jsonb_typeof(p_snapshot->'open_positions'),'null')<>'null' then
  if jsonb_typeof(p_snapshot->'open_positions')<>'number' then raise exception 'invalid open positions'; end if;
  if not ((p_snapshot->>'open_positions')::numeric between 0 and 100000)
     or trunc((p_snapshot->>'open_positions')::numeric)<>(p_snapshot->>'open_positions')::numeric
  then raise exception 'invalid open positions'; end if;
 end if;
 if p_snapshot->>'floating_pnl' is not null or p_snapshot->>'open_positions' is not null then
  if coalesce(jsonb_typeof(p_snapshot->'observed_at'),'null')<>'string'
     or not isfinite((p_snapshot->>'observed_at')::timestamptz)
  then raise exception 'invalid metrics timestamp'; end if;
 end if;
 update investpro_mt_hosted set
  floating_pnl=(p_snapshot->>'floating_pnl')::numeric,
  open_positions=((p_snapshot->>'open_positions')::numeric)::integer,
  metrics_observed_at=case
   when p_snapshot->>'floating_pnl' is not null or p_snapshot->>'open_positions' is not null
   then (p_snapshot->>'observed_at')::timestamptz else null end
 where id=p_id;
 if p_snapshot ? 'funding' then
  f:=p_snapshot->'funding';
  reference:=(f->>'reference_balance')::numeric;
  incoming:=(f->>'inflows')::numeric;
  outgoing:=(f->>'outflows')::numeric;
  method:=f->>'reference_method';
  if reference is null or incoming is null or outgoing is null or method is null
     or not (reference>=0 and reference<1e12 and incoming>=0 and incoming<1e12 and outgoing>=0 and outgoing<1e12)
     or method not in ('first_deposit','first_sync_balance')
     or (method='first_deposit' and (reference<=0 or reference>incoming))
     or (method='first_sync_balance' and abs(reference-greatest(0,(p_snapshot->>'balance')::numeric))>0.000001)
  then raise exception 'invalid funding'; end if;
  update investpro_mt_hosted set funding_summary=jsonb_build_object('inflows',incoming,'outflows',outgoing) where id=p_id;
  -- Fixed denominator: never replace it with today's balance on each refresh/reconnect.
  if h.capital_auto and h.capital_reference is null and reference>0 then
   update investpro_mt_hosted set capital_reference=reference,capital_method=method where id=p_id;
   update trading_accounts set initial_balance=reference where user_id=h.user_id and id=(select account_id from investpro_mt_connections where id=h.connection_id);
  end if;
 end if;
end $function$;

-- CREATE OR REPLACE retains the original function owner and execution grants.
-- The underlying worker/generation/identity/revocation and trade routines above
-- were not replaced. Keep the privileged entry point service_role-only.
do $acl$
begin
 if has_function_privilege('anon','public.investpro_hosted_receive_v2(uuid,uuid,integer,text,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.investpro_hosted_receive_v2(uuid,uuid,integer,text,jsonb)','EXECUTE')
    or not has_function_privilege('service_role','public.investpro_hosted_receive_v2(uuid,uuid,integer,text,jsonb)','EXECUTE')
 then raise exception 'unexpected hosted metrics execution grants'; end if;
end $acl$;

notify pgrst, 'reload schema';
commit;

