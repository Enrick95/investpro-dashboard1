import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

// No Supabase connection, credentials, or network: execute the prepared SQL in
// PostgreSQL WASM, including real roles, RLS, constraints, triggers and the RPC.
const sql = readFileSync(new URL("../supabase/migrations/20261018172403_journal_outcome_annotations.sql", import.meta.url), "utf8");
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";

const fixtureSql = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create table public.trading_journal (
    id bigint primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    account_id bigint,
    account_balance numeric,
    trade_date timestamptz not null,
    symbol text not null,
    direction text,
    entry_price numeric,
    stop_loss numeric,
    take_profit numeric,
    risk_percent numeric,
    result_amount numeric,
    result_r numeric,
    status text not null check (status in ('open', 'win', 'loss', 'breakeven', 'cancelled')),
    setup text,
    session text,
    timeframe text,
    emotion text,
    mistake text,
    notes text,
    screenshot_url text,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    source_platform text not null,
    commission numeric,
    swap numeric,
    volume numeric,
    external_id text,
    custom_source_payload jsonb
  );
  alter table public.trading_journal enable row level security;
  create policy source_select on public.trading_journal for select to authenticated
    using (user_id = (select auth.uid()));
  create policy source_insert on public.trading_journal for insert to authenticated
    with check (user_id = (select auth.uid()));
  create policy source_update on public.trading_journal for update to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  create policy source_delete on public.trading_journal for delete to authenticated
    using (user_id = (select auth.uid()));
  grant select, insert, update, delete on public.trading_journal to authenticated;
  grant select on public.trading_journal to anon, service_role;
  -- Simulate the existing imported-trade guard. The migration must leave this
  -- intact, and setting an annotation must succeed without bypassing it.
  create function public.test_import_guard() returns trigger language plpgsql
    security invoker set search_path = '' as $$
    begin
      if current_user = 'authenticated' and old.source_platform <> 'manual' then
        raise exception using errcode = '42501', message = 'Imported trades are read only';
      end if;
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end;
    $$;
  create trigger test_import_guard before update or delete on public.trading_journal
    for each row execute function public.test_import_guard();
`;

function sqlCode(code) {
  return (error) => error.code === code;
}

test("journal outcome SQL enforces ownership and preserves source data in PostgreSQL", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fixtureSql);
  const sourceSecurity = async () => (await db.query(`
    select c.relacl::text as grants,
      (select jsonb_agg(pg_get_triggerdef(oid) order by tgname)
       from pg_trigger where tgrelid = c.oid and not tgisinternal) as triggers,
      (select jsonb_agg(jsonb_build_object('name', polname, 'using', pg_get_expr(polqual, polrelid),
        'check', pg_get_expr(polwithcheck, polrelid)) order by polname)
       from pg_policy where polrelid = c.oid) as policies
    from pg_class c where c.oid = 'public.trading_journal'::regclass
  `)).rows;
  const securityBefore = await sourceSecurity();
  await db.exec(sql);

  async function as(userId, callback, role = "authenticated") {
    assert(["authenticated", "anon", "service_role"].includes(role));
    await db.exec(`begin; set local role ${role};`);
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
      const value = await callback(db);
      await db.exec("commit");
      return value;
    } catch (error) {
      await db.exec("rollback");
      throw error;
    }
  }
  const rpc = (id, outcome, userId = owner) => as(userId,
    () => db.query("select public.investpro_set_trade_outcome($1::bigint, $2::text)", [id, outcome]));
  const source = async (id) => (await db.query(
    "select to_jsonb(j) as row from public.trading_journal j where id = $1", [id])).rows[0]?.row;
  const effective = async (id, userId = owner) => (await as(userId,
    () => db.query("select to_jsonb(j) as row from public.trading_journal_effective j where id = $1", [id]))).rows[0]?.row;
  const annotation = async (id) => (await db.query(
    "select * from public.trading_journal_outcomes where trade_id = $1", [id])).rows[0];

  t.beforeEach(async () => {
    await db.exec("truncate public.trading_journal_outcomes, public.trading_journal, auth.users cascade");
    await db.query("insert into auth.users values ($1), ($2)", [owner, other]);
    for (const [id, userId, status, platform] of [
      [1, owner, "loss", "MT5"], [2, other, "win", "MT5"],
      [3, owner, "open", "MT5"], [4, owner, "cancelled", "MT5"],
      [5, owner, "breakeven", "MT5"], [6, owner, "win", "manual"],
    ]) {
      await db.query(`insert into public.trading_journal values (
        $1::bigint, $2, 81, 10000.41, '2026-10-16T09:42:31Z', 'EURUSD', 'buy',
        1.09876, 1.09700, 1.10200, 0.5, -2.25, -0.045, $3,
        'breakout', 'london', 'M5', 'calm', 'none', 'original broker note',
        'https://example.invalid/proof.png', '2026-10-16T09:42:31Z',
        '2026-10-16T09:43:00Z', $4, -1.5, -0.75, 0.1, 'ticket-' || ($1::bigint)::text,
        '{"sourceOnly":"retain every field","deals":[12,13]}'::jsonb
      )`, [id, userId, status, platform]);
    }
  });

  await t.test("the view retains base column order and source security objects", async () => {
    const columns = async (table) => (await db.query(`select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1 order by ordinal_position`, [table])).rows.map((r) => r.column_name);
    const base = await columns("trading_journal");
    assert.deepEqual(await columns("trading_journal_effective"), [
      ...base, "source_status", "outcome_override", "outcome_source", "automatic_be",
    ]);
    assert.deepEqual(await sourceSecurity(), securityBefore);
    const row = await effective(1);
    assert.equal(row.status, "loss");
    assert.equal(row.source_status, "loss");
    assert.equal(row.outcome_source, "source");
    assert.equal(row.outcome_override, null);
    assert.equal(row.automatic_be, false);
  });

  await t.test("an imported trade can become BE while all source fields and its guard stay intact", async () => {
    const before = await source(1);
    await assert.rejects(as(owner, () => db.query("update public.trading_journal set status = 'breakeven' where id = 1")), sqlCode("42501"));
    await assert.rejects(as(owner, () => db.query("delete from public.trading_journal where id = 1")), sqlCode("42501"));
    await rpc(1, "breakeven");
    assert.deepEqual(await source(1), before);
    const row = await effective(1);
    assert.equal(row.status, "breakeven");
    assert.equal(row.source_status, "loss");
    assert.equal(row.outcome_override, "breakeven");
    assert.equal(row.outcome_source, "manual");
    assert.equal(row.automatic_be, false);
    const projected = Object.fromEntries(Object.keys(before).map((key) => [key, row[key]]));
    assert.deepEqual({ ...projected, status: before.status }, before);
    const saved = await annotation(1);
    assert.equal(saved.user_id, owner);
    assert.equal(saved.outcome, "breakeven");
    assert(saved.updated_at instanceof Date);
    assert.deepEqual(await sourceSecurity(), securityBefore);
  });

  await t.test("repeated changes upsert one annotation and reset restores the source result", async () => {
    await rpc(1, "breakeven");
    await rpc(1, "win");
    assert.equal((await effective(1)).status, "win");
    assert.equal((await db.query("select count(*)::int as n from public.trading_journal_outcomes")).rows[0].n, 1);
    await rpc(1, null);
    assert.equal(await annotation(1), undefined);
    const restored = await effective(1);
    assert.equal(restored.status, "loss");
    assert.equal(restored.outcome_override, null);
    assert.equal(restored.outcome_source, "source");
    await rpc(1, null); // Reset is idempotent.
  });

  await t.test("an importer financial/source-status update retains the independent annotation", async () => {
    await rpc(1, "breakeven");
    const saved = await annotation(1);
    await db.exec(`update public.trading_journal set result_amount = -8.75, commission = -4.25,
      swap = -1.25, result_r = -0.175, status = 'win', updated_at = '2026-10-18T12:00:00Z',
      custom_source_payload = '{"resynced":true}' where id = 1`);
    assert.deepEqual(await annotation(1), saved);
    const row = await effective(1);
    assert.equal(row.status, "breakeven");
    assert.equal(row.source_status, "win");
    assert.equal(row.result_amount, -8.75);
    assert.equal(row.commission, -4.25);
    assert.equal(row.swap, -1.25);
    assert.equal(row.result_r, -0.175);
    assert.deepEqual(row.custom_source_payload, { resynced: true });
  });

  await t.test("a reopened/cancelled source suppresses stored annotations until it is closed again", async () => {
    await rpc(1, "breakeven");
    for (const status of ["open", "cancelled"]) {
      await db.query("update public.trading_journal set status = $1 where id = 1", [status]);
      const row = await effective(1);
      assert.equal(row.status, status);
      assert.equal(row.source_status, status);
      assert.equal(row.outcome_override, null);
      assert.equal(row.outcome_source, "source");
      assert.equal((await annotation(1)).outcome, "breakeven");
      await assert.rejects(rpc(1, "win"), sqlCode("22023"));
      await assert.rejects(rpc(1, null), sqlCode("22023"));
      await assert.rejects(as(owner, () => db.query("update public.trading_journal_outcomes set outcome = 'win' where trade_id = 1")), sqlCode("42501"));
    }
    await db.exec("update public.trading_journal set status = 'loss' where id = 1");
    assert.equal((await effective(1)).status, "breakeven");
  });

  await t.test("a different user cannot read, change, reset, or forge another user's annotation", async () => {
    await rpc(2, "loss", other);
    const saved = await annotation(2);
    assert.equal(await effective(2), undefined);
    assert.deepEqual((await as(owner, () => db.query("select * from public.trading_journal_outcomes where trade_id = 2"))).rows, []);
    for (const outcome of ["breakeven", null]) await assert.rejects(rpc(2, outcome), sqlCode("42501"));
    assert.deepEqual((await as(owner, () => db.query("update public.trading_journal_outcomes set outcome = 'win' where trade_id = 2 returning trade_id"))).rows, []);
    assert.deepEqual((await as(owner, () => db.query("delete from public.trading_journal_outcomes where trade_id = 2 returning trade_id"))).rows, []);
    await assert.rejects(as(owner, () => db.query("insert into public.trading_journal_outcomes (trade_id, user_id, outcome) values (2, $1, 'breakeven')", [owner])), sqlCode("42501"));
    await assert.rejects(as(owner, () => db.query("insert into public.trading_journal_outcomes (trade_id, user_id, outcome) values (1, $1, 'breakeven')", [other])), sqlCode("42501"));
    await rpc(1, "breakeven");
    await assert.rejects(as(owner, () => db.query("update public.trading_journal_outcomes set user_id = $1 where trade_id = 1", [other])), sqlCode("42501"));
    await assert.rejects(as(owner, () => db.query("update public.trading_journal_outcomes set trade_id = 2 where trade_id = 1")), sqlCode("42501"));
    assert.deepEqual(await annotation(2), saved);
    assert.equal((await annotation(1)).user_id, owner);
  });

  await t.test("direct annotation CRUD is permitted only for owned, closed trades", async () => {
    const inserted = await as(owner, () => db.query("insert into public.trading_journal_outcomes (trade_id, user_id, outcome) values (1, $1, 'breakeven') returning outcome", [owner]));
    assert.deepEqual(inserted.rows, [{ outcome: "breakeven" }]);
    const updated = await as(owner, () => db.query("update public.trading_journal_outcomes set outcome = 'win' where trade_id = 1 returning outcome"));
    assert.deepEqual(updated.rows, [{ outcome: "win" }]);
    const deleted = await as(owner, () => db.query("delete from public.trading_journal_outcomes where trade_id = 1 returning trade_id"));
    assert.equal(deleted.rows.length, 1);
    assert.equal(await annotation(1), undefined);
    for (const id of [3, 4]) {
      await assert.rejects(rpc(id, "breakeven"), sqlCode("22023"));
      await assert.rejects(as(owner, () => db.query("insert into public.trading_journal_outcomes (trade_id, user_id, outcome) values ($1, $2, 'breakeven')", [id, owner])), sqlCode("42501"));
    }
  });

  await t.test("RPC arguments and annotation outcome constraints reject invalid writes", async () => {
    for (const value of ["BE", "", "open", "cancelled", " win "]) {
      await assert.rejects(rpc(1, value), sqlCode("22023"));
    }
    for (const id of [null, 0, -1]) await assert.rejects(rpc(id, "breakeven"), sqlCode("22023"));
    await assert.rejects(rpc(9999, "breakeven"), sqlCode("42501"));
    await assert.rejects(as(owner, () => db.query("insert into public.trading_journal_outcomes (trade_id, user_id, outcome) values (1, $1, 'BE')", [owner])), sqlCode("23514"));
    await assert.rejects(as(owner, () => db.query("insert into public.trading_journal_outcomes (trade_id, user_id, outcome) values (1, $1, null)", [owner])), sqlCode("23502"));
    assert.equal(await annotation(1), undefined);
  });

  await t.test("anon cannot execute the RPC or access the view/table; a missing JWT is denied", async () => {
    await rpc(1, "breakeven");
    for (const statement of [
      "select public.investpro_set_trade_outcome(1, 'win')",
      "select * from public.trading_journal_effective",
      "select * from public.trading_journal_outcomes",
      `insert into public.trading_journal_outcomes values (1, '${owner}', 'win', now())`,
      "update public.trading_journal_outcomes set outcome = 'win'",
      "delete from public.trading_journal_outcomes",
    ]) await assert.rejects(as(null, () => db.query(statement), "anon"), sqlCode("42501"));
    await assert.rejects(rpc(1, "win", null), sqlCode("42501"));
    assert.deepEqual((await as(null, () => db.query("select * from public.trading_journal_effective"))).rows, []);
    assert.deepEqual((await as(null, () => db.query("select * from public.trading_journal_outcomes"))).rows, []);
    await assert.rejects(as(null, () => db.query("insert into public.trading_journal_outcomes (trade_id, user_id, outcome) values (6, $1, 'win')", [owner])), sqlCode("42501"));
    assert.equal((await annotation(1)).outcome, "breakeven");
  });

  await t.test("only authenticated has RPC execute and the invoker view is readable by service_role", async () => {
    const privileges = (await db.query(`select
      has_function_privilege('anon', 'public.investpro_set_trade_outcome(bigint,text)', 'execute') as anon,
      has_function_privilege('authenticated', 'public.investpro_set_trade_outcome(bigint,text)', 'execute') as authenticated,
      has_function_privilege('service_role', 'public.investpro_set_trade_outcome(bigint,text)', 'execute') as service_role,
      (select prosecdef from pg_proc where oid = 'public.investpro_set_trade_outcome(bigint,text)'::regprocedure) as definer,
      (select proconfig from pg_proc where oid = 'public.investpro_set_trade_outcome(bigint,text)'::regprocedure) as config,
      (select reloptions from pg_class where oid = 'public.trading_journal_effective'::regclass) as view_options`)).rows[0];
    assert.deepEqual(privileges, { anon: false, authenticated: true, service_role: false,
      definer: false, config: ['search_path=""'], view_options: ["security_invoker=true"] });
    await rpc(1, "breakeven");
    const result = await as(null, () => db.query("select id from public.trading_journal_effective order by id"), "service_role");
    assert.equal(result.rows.length, 6);
  });

  await t.test("trade and user deletion cascade annotations with no orphan records", async () => {
    await rpc(6, "breakeven");
    assert((await annotation(6)));
    const deleted = await as(owner, () => db.query("delete from public.trading_journal where id = 6 returning id"));
    assert.equal(deleted.rows.length, 1);
    assert.equal(await annotation(6), undefined);
    await rpc(1, "breakeven");
    await rpc(2, "loss", other);
    await db.query("delete from auth.users where id = $1", [owner]);
    assert.equal(await annotation(1), undefined);
    assert.equal((await annotation(2)).user_id, other);
    assert.equal((await db.query("select count(*)::int as n from public.trading_journal_outcomes o left join public.trading_journal j on j.id=o.trade_id where j.id is null")).rows[0].n, 0);
  });
});
