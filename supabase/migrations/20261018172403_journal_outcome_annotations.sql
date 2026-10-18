-- Prepared SQL for PostgreSQL 15+ / Supabase; not applied by this local file.
-- This adds journal presentation annotations. It never changes source trades,
-- their grants, financial values, import protection, or the importer's writes.
begin;

create table public.trading_journal_outcomes (
  trade_id bigint primary key references public.trading_journal(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  outcome text not null check (outcome in ('win', 'loss', 'breakeven')),
  updated_at timestamptz not null default now()
);

create index trading_journal_outcomes_user_id_idx
  on public.trading_journal_outcomes(user_id);

alter table public.trading_journal_outcomes enable row level security;

create policy trading_journal_outcomes_select_own
  on public.trading_journal_outcomes for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.trading_journal as j
      where j.id = trading_journal_outcomes.trade_id and j.user_id = (select auth.uid())
    )
  );

create policy trading_journal_outcomes_insert_own_closed
  on public.trading_journal_outcomes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.trading_journal as j
      where j.id = trading_journal_outcomes.trade_id
        and j.user_id = (select auth.uid())
        and j.status::text in ('win', 'loss', 'breakeven')
    )
  );

create policy trading_journal_outcomes_update_own_closed
  on public.trading_journal_outcomes for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.trading_journal as j
      where j.id = trading_journal_outcomes.trade_id and j.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.trading_journal as j
      where j.id = trading_journal_outcomes.trade_id
        and j.user_id = (select auth.uid())
        and j.status::text in ('win', 'loss', 'breakeven')
    )
  );

create policy trading_journal_outcomes_delete_own
  on public.trading_journal_outcomes for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.trading_journal as j
      where j.id = trading_journal_outcomes.trade_id and j.user_id = (select auth.uid())
    )
  );

revoke all on table public.trading_journal_outcomes from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.trading_journal_outcomes to authenticated;
-- A security-invoker view also requires its caller's underlying SELECT grants.
grant select on table public.trading_journal_outcomes to service_role;

create function public.investpro_set_trade_outcome(p_trade_id bigint, p_outcome text)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_source_status text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_trade_id is null or p_trade_id <= 0 then
    raise exception using errcode = '22023', message = 'A valid trade ID is required';
  end if;
  if p_outcome is not null and p_outcome not in ('win', 'loss', 'breakeven') then
    raise exception using errcode = '22023', message = 'Invalid trade outcome';
  end if;

  -- Retain this lock through the annotation write, so an importer cannot change
  -- ownership/status between validation and the write in the same transaction.
  select j.status::text into v_source_status
  from public.trading_journal as j
  where j.id = p_trade_id and j.user_id = v_user_id
  for share;

  if not found then
    raise exception using errcode = '42501', message = 'Trade is unavailable';
  end if;
  if v_source_status is null or v_source_status not in ('win', 'loss', 'breakeven') then
    raise exception using errcode = '22023', message = 'Only closed trades can have an outcome annotation';
  end if;

  if p_outcome is null then
    delete from public.trading_journal_outcomes
    where trade_id = p_trade_id and user_id = v_user_id;
  else
    insert into public.trading_journal_outcomes (trade_id, user_id, outcome, updated_at)
    values (p_trade_id, v_user_id, p_outcome, pg_catalog.now())
    on conflict (trade_id) do update
      set outcome = excluded.outcome, updated_at = excluded.updated_at;
  end if;
end;
$function$;

revoke all on function public.investpro_set_trade_outcome(bigint, text) from public, anon, authenticated, service_role;
grant execute on function public.investpro_set_trade_outcome(bigint, text) to authenticated;

-- Materialize the live source table's complete column list, preserving its
-- order and every financial/metadata field. Only the projected status changes.
-- Subsequent source-schema additions require regenerating this view's list.
do $view$
declare
  v_columns text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trading_journal' and column_name = 'status'
  ) then
    raise exception 'public.trading_journal.status is required';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trading_journal'
      and column_name in ('source_status', 'outcome_override', 'outcome_source', 'automatic_be')
  ) then
    raise exception 'Source trade columns conflict with the effective journal annotation fields';
  end if;

  select pg_catalog.string_agg(
    case when column_name = 'status' then
      'case when j.status::text in (''win'', ''loss'', ''breakeven'') then coalesce(o.outcome, j.status::text) else j.status::text end as status'
    else pg_catalog.format('j.%I', column_name) end,
    ', ' order by ordinal_position
  ) into v_columns
  from information_schema.columns
  where table_schema = 'public' and table_name = 'trading_journal';

  execute pg_catalog.format(
    'create view public.trading_journal_effective with (security_invoker = true) as
     select %s,
       j.status as source_status,
       case when j.status::text in (''win'', ''loss'', ''breakeven'') then o.outcome else null::text end as outcome_override,
       case when j.status::text in (''win'', ''loss'', ''breakeven'') and o.outcome is not null then ''manual''::text else ''source''::text end as outcome_source,
       false as automatic_be
     from public.trading_journal as j
     left join public.trading_journal_outcomes as o on o.trade_id = j.id and o.user_id = j.user_id',
    v_columns
  );
end;
$view$;

revoke all on table public.trading_journal_effective from public, anon, authenticated, service_role;
grant select on table public.trading_journal_effective to authenticated, service_role;

comment on table public.trading_journal_outcomes is
  'User-owned journal outcome annotations. Source trades and financial amounts remain authoritative.';
comment on view public.trading_journal_effective is
  'Caller-RLS journal projection; manual annotations affect closed-trade status only. automatic_be awaits verified source evidence.';

commit;
