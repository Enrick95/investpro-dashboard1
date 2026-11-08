import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
function compile(file, modules = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  const require = specifier => {
    if (specifier in modules) return modules[specifier];
    throw Error(`Unexpected import ${specifier}`);
  };
  vm.runInNewContext(output, { module: compiled, exports: compiled.exports, require });
  return compiled.exports;
}

const engine = compile("lib/telegram/engine.ts");
const notice = compile("lib/vip/publication-notice.ts");
const { mirrorTelegramPost, followupLabel, signalDraft } = compile("lib/vip/telegram-import.ts", { "@/lib/vip/publication-notice": notice });

const CHAT = "-1001234567890";
const NOW = Date.parse("2026-11-08T09:00:00Z");
const at = minutes => Math.floor(NOW / 1000) - minutes * 60;
const SIGNAL = "🎯 #SIGNAL\n🟡 Actif : GOLD\nDirection : BUY\n📍 Entrée : 4257.4 - 4252.97\nStop Loss : 4244.26\nTP1 : 4271\nTP2 : 4284\nTP3 : 4300\n\n⚠️ Petite taille, CPI à 14h30.";

/** Just enough of the Supabase client: equality and « lower than » filters, one row reads, inserts and updates. */
function fakeDb({ events = [], posts = [] } = {}) {
  const tables = { investpro_telegram_events: events, vip_posts: posts };
  const writes = [];
  const from = table => {
    const filters = [];
    let patch = null;
    const query = {
      select: () => query,
      eq: (column, value) => { filters.push(row => row[column] === value); return query; },
      lt: (column, value) => { filters.push(row => row[column] < value); return query; },
      maybeSingle: async () => ({ data: tables[table].find(row => filters.every(keep => keep(row))) ?? null, error: null }),
      insert: async row => {
        writes.push({ table, insert: row });
        if (tables[table].some(other => other.telegram_chat_id === row.telegram_chat_id && other.telegram_message_id === row.telegram_message_id)) return { error: { code: "23505" } };
        tables[table].push({ id: `post-${tables[table].length + 1}`, ...row });
        return { error: null };
      },
      update: value => { patch = value; return query; },
      then: (resolve, reject) => {
        const rows = tables[table].filter(row => filters.every(keep => keep(row)));
        for (const row of rows) Object.assign(row, patch);
        writes.push({ table, update: patch, rows: rows.length });
        return Promise.resolve({ error: null }).then(resolve, reject);
      },
    };
    return query;
  };
  return { from, tables, writes };
}

const event = (messageId, text, replyTo = null) => ({ chat_id: CHAT, message_id: messageId, reply_to: replyTo, parsed: engine.parseMessage(text) });
const post = (messageId, text, options = {}) => ({
  chatId: CHAT, messageId, revision: options.revision ?? at(1), date: options.date ?? at(1), replyTo: options.replyTo ?? null,
  text, parsed: engine.parseMessage(text), edited: options.edited ?? false,
});

test("un signal Telegram devient un signal publié du VIP, avec ses niveaux et la note du trader", async () => {
  const db = fakeDb({ events: [event(10, SIGNAL)] });
  assert.equal(await mirrorTelegramPost(db, post(10, SIGNAL), NOW), "created");
  const [row] = db.tables.vip_posts;
  assert.equal(row.category, "signal");
  assert.equal(row.title, "Nouveau signal");
  assert.equal(row.published, true);
  assert.equal(row.symbol, "GOLD");
  assert.equal(row.direction, "buy");
  assert.equal(row.telegram_chat_id, CHAT);
  assert.equal(row.telegram_message_id, 10);
  assert.equal(row.thread_post_id, null);
  assert.equal(row.levels.stopLoss, 4244.26);
  assert.equal(row.levels.takeProfit, 4271);
  assert.equal(row.levels.takeProfit2, 4284);
  assert.ok(Math.abs(row.levels.entry - 4255.185) < 1e-9);
  assert.equal(row.body, "🟡 Actif : GOLD\n📈 Direction : BUY\n📍 Entrée : 4257.4 – 4252.97\n🛑 Stop Loss : 4244.26\n🎯 TP1 : 4271\n🎯 TP2 : 4284\n🎯 TP3 : 4300\n\n⚠️ Petite taille, CPI à 14h30.");
  // The phone alert reads the same template as a signal published from the admin.
  const alert = notice.formatVipPublicationNotice(row);
  assert.equal(alert.title, "Nouveau signal · GOLD");
  assert.equal(alert.body, "🟢 BUY · Entrée : 4257.4 – 4252.97 · SL : 4244.26 · TP1 : 4271 · TP2 : 4284 · TP3 : 4300");
  assert.equal(notice.vipSignalOrder(row).side, "buy");
  assert.equal(notice.signalFreeText(row.body), "⚠️ Petite taille, CPI à 14h30.");
  assert.equal(notice.signalTakeProfit3(row.body), 4300);
});

test("une livraison répétée par Telegram ne publie et n’alerte qu’une fois", async () => {
  const db = fakeDb({ events: [event(10, SIGNAL)] });
  assert.equal(await mirrorTelegramPost(db, post(10, SIGNAL), NOW), "created");
  assert.equal(await mirrorTelegramPost(db, post(10, SIGNAL), NOW), "duplicate");
  assert.equal(db.tables.vip_posts.length, 1);
});

test("les réponses au signal, même en chaîne, arrivent dans le fil de ce trade", async () => {
  const db = fakeDb({ events: [event(10, SIGNAL), event(11, "TP1 TOUCHER ✅", 10), event(12, "On passe le SL au BE", 11), event(13, "GOLD TP2 TOUCHER +320 PIPS", 12)] });
  await mirrorTelegramPost(db, post(10, SIGNAL), NOW);
  assert.equal(await mirrorTelegramPost(db, post(11, "TP1 TOUCHER ✅", { replyTo: 10 }), NOW), "created");
  assert.equal(await mirrorTelegramPost(db, post(12, "On passe le SL au BE", { replyTo: 11 }), NOW), "created");
  assert.equal(await mirrorTelegramPost(db, post(13, "GOLD TP2 TOUCHER +320 PIPS", { replyTo: 12 }), NOW), "created");
  const [signal, first, second, third] = db.tables.vip_posts;
  for (const update of [first, second, third]) {
    assert.equal(update.category, "followup");
    assert.equal(update.thread_post_id, signal.id);
    assert.equal(update.symbol, "GOLD");
    assert.equal(update.direction, "buy");
    assert.equal(update.published, true);
  }
  assert.equal(first.title, "GOLD · TP1 touché");
  assert.equal(first.body, "TP1 TOUCHER ✅");
  assert.equal(second.title, "GOLD · Stop au point d’entrée");
  assert.equal(third.title, "GOLD · TP2 touché");
  const alert = notice.formatVipPublicationNotice(first);
  assert.equal(alert.title, "Mise à jour du suivi");
  assert.equal(alert.body, "GOLD · TP1 touché — TP1 TOUCHER ✅");
});

test("une réponse à un signal d’avant l’import garde son instrument, sans fil précis", async () => {
  const db = fakeDb({ events: [event(10, SIGNAL), event(11, "Stop loss touché", 10)] });
  assert.equal(await mirrorTelegramPost(db, post(11, "Stop loss touché", { replyTo: 10 }), NOW), "created");
  const [row] = db.tables.vip_posts;
  assert.equal(row.title, "GOLD · Stop touché");
  assert.equal(row.thread_post_id, null);
});

test("les messages sans signal, les photos sans texte et la copie du bot restent sur Telegram", async () => {
  const db = fakeDb({ events: [event(20, "Bonjour la team ☀️"), event(21, "Merci !", 20)] });
  assert.equal(await mirrorTelegramPost(db, post(20, "Bonjour la team ☀️"), NOW), "skipped");
  assert.equal(await mirrorTelegramPost(db, post(21, "Merci !", { replyTo: 20 }), NOW), "skipped");
  assert.equal(await mirrorTelegramPost(db, post(22, "TP1 TOUCHER", { replyTo: 99 }), NOW), "skipped");
  assert.equal(await mirrorTelegramPost(db, post(23, "   "), NOW), "skipped");
  const copy = `🚨 Nouveau signal · GOLD\n\n${SIGNAL}\n\nEspace VIP : ${notice.VIP_SPACE_URL}`;
  assert.equal(await mirrorTelegramPost(db, post(24, copy), NOW), "skipped");
  assert.equal(db.tables.vip_posts.length, 0);
});

test("un signal trop ancien n’est pas publié à sa première arrivée", async () => {
  const db = fakeDb();
  assert.equal(await mirrorTelegramPost(db, post(30, SIGNAL, { date: at(13 * 60), revision: at(13 * 60) }), NOW), "skipped");
  assert.equal(db.tables.vip_posts.length, 0);
});

test("une modification sur Telegram corrige la publication, sans nouvelle alerte ni retour en arrière", async () => {
  const db = fakeDb({ events: [event(10, SIGNAL)] });
  await mirrorTelegramPost(db, post(10, SIGNAL, { revision: at(10) }), NOW);
  const corrected = SIGNAL.replace("TP1 : 4271", "TP1 : 4272");
  assert.equal(await mirrorTelegramPost(db, post(10, corrected, { edited: true, revision: at(5) }), NOW), "updated");
  assert.equal(db.tables.vip_posts.length, 1);
  assert.equal(db.tables.vip_posts[0].levels.takeProfit, 4272);
  assert.ok(db.tables.vip_posts[0].body.includes("🎯 TP1 : 4272"));
  // An older edit delivered late cannot overwrite the newer one.
  await mirrorTelegramPost(db, post(10, SIGNAL.replace("TP1 : 4271", "TP1 : 4270"), { edited: true, revision: at(8) }), NOW);
  assert.equal(db.tables.vip_posts[0].levels.takeProfit, 4272);
  // A signal edited into an incomplete one keeps its last valid version.
  assert.equal(await mirrorTelegramPost(db, post(10, "Actif : GOLD", { edited: true, revision: at(2) }), NOW), "skipped");
  assert.equal(db.writes.filter(write => write.insert).length, 1);
});

test("un signal incomplet corrigé ensuite sur Telegram est publié à ce moment-là", async () => {
  const db = fakeDb();
  assert.equal(await mirrorTelegramPost(db, post(40, "Actif : GOLD\nDirection : BUY", { revision: at(6), date: at(6) }), NOW), "skipped");
  assert.equal(await mirrorTelegramPost(db, post(40, SIGNAL, { edited: true, revision: at(2), date: at(6) }), NOW), "created");
  assert.equal(db.tables.vip_posts.length, 1);
});

test("le titre d’une mise à jour dit ce qui est arrivé au trade", () => {
  const parse = engine.parseMessage;
  assert.equal(followupLabel(parse("SL"), "SL"), "Stop touché");
  assert.equal(followupLabel(parse("BE touché"), "BE touché"), "Clôturé au point d’entrée");
  assert.equal(followupLabel(parse("Ordre annulé"), "Ordre annulé"), "Ordre annulé");
  assert.equal(followupLabel(parse("TP3 touché"), "TP3 touché"), "TP3 touché");
  assert.equal(followupLabel(parse("Stop mis au BE"), "Stop mis au BE"), "Stop au point d’entrée");
  assert.equal(followupLabel(parse("TP2 touché, SL au BE"), "TP2 touché, SL au BE"), "TP2 touché · stop au point d’entrée");
  assert.equal(followupLabel(parse("TP1 pas encore touché, SL au BE ?"), "TP1 pas encore touché, SL au BE ?"), "Mise à jour");
  assert.equal(followupLabel(parse("On laisse courir 🔥"), "On laisse courir 🔥"), "Mise à jour");
});

test("les niveaux restent écrits comme le trader les a tapés", () => {
  const forex = "Actif : EURUSD\nDirection : SELL\nEntrée : 1,0850\nSL : 1.0900\nTP1 : 1.0800";
  const parsed = engine.parseMessage(forex);
  assert.equal(parsed.kind, "signal");
  const draft = signalDraft(parsed.signal, forex);
  assert.equal(draft.body, "🟡 Actif : EURUSD\n📈 Direction : SELL\n📍 Entrée : 1,0850\n🛑 Stop Loss : 1.0900\n🎯 TP1 : 1.0800");
  assert.equal(draft.direction, "sell");
  assert.equal(draft.levels.entry, 1.085);
  assert.equal("takeProfit2" in draft.levels, false);
});
