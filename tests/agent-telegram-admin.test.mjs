import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

// Onglet « Agent Telegram » de l’admin : la plateforme de relance branchée sur l’agent du Mac (127.0.0.1).
// Les conversations et la session Telegram restent sur le Mac ; un message ne part que sur un clic « Envoyer ».
const root = path.resolve(import.meta.dirname, "..");
const page = fs.readFileSync(path.join(root, "app/dashboard/admin/telegram/AgentTelegram.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "app/dashboard/admin/telegram/TelegramAdmin.module.css"), "utf8");

test("the admin tab talks only to the agent running on the Mac", () => {
  assert.match(page, /const AGENT = "http:\/\/127\.0\.0\.1:8765";/);
  assert.ok(!/\/api\/telegram|supabase/i.test(page), "no conversation goes through the site's server");
  assert.match(page, /Documents › ChatGPT › TELEGRAM/);
  assert.match(page, /« Lancer-agent-relances »/);
});

test("a follow-up is sent only by clicking, with the text Enrick has read", () => {
  assert.match(page, /agent<\{ sent_today: number \}>\(`\/api\/contacts\/\$\{selected\.peer_id\}\/send`, \{ text \}\)/);
  assert.match(page, /disabled=\{!selected\.can_send \|\| !!busy\}/);
  assert.match(page, /if \(!selected\.can_send\) \{ setNotice\(selected\.exclusion/);
  // Aucune boucle d’envoi automatique : send() n’est appelé que par le bouton et le raccourci clavier.
  assert.equal((page.match(/void send\(\)/g) || []).length, 2);
  assert.ok(!/setInterval\([^)]*send/.test(page));
});

test("the tab filters contacts by readiness and by age, up to more than a year", () => {
  for (const label of ["À relancer", "VIP à vérifier", "Écartés", "Moins de 3 mois", "3 à 6 mois", "6 à 12 mois", "Plus d’un an"]) assert.ok(page.includes(label), label);
  assert.match(page, /InvestPro Trading VIP/);
  assert.match(page, /AGENT_VERSION = "2"/);
  for (const name of ["filterRow", "groupHead", "catTag", "ageTag", "quote", "okBox"]) assert.match(css, new RegExp(`\\.${name}\\{`));
  // Les contacts sont regroupés : les plus chauds, puis les tièdes, puis les froids.
  assert.match(page, /chaud: "Les plus chauds", abonne: "Anciens abonnés", tiede: "Tièdes", froid: "Froids"/);
  assert.match(page, /chaud: 0, abonne: 1, tiede: 2, froid: 3/);
  assert.match(css, /\.root \[data-cat=abonne\]\{--c:#f29ac8\}/);
});

test("investprotrading.fr/whatsapp opens Enrick's WhatsApp with a message saying the person comes from Telegram", () => {
  const config = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");
  assert.match(config, /\{source:"\/whatsapp",destination:WHATSAPP_RELANCE,permanent:false\}/);
  assert.match(config, /const WHATSAPP_RELANCE="https:\/\/wa\.me\/6285128115218\?text="\+encodeURIComponent\(WHATSAPP_RELANCE_TEXT\);/);
  const text = config.match(/const WHATSAPP_RELANCE_TEXT="([^"]+)";/)[1];
  assert.match(text, /Telegram InvestPro Support/);
  assert.ok(!/[()*:{}]/.test(text), "no character that the redirect pattern would misread");
  // Le numéro est celui déjà affiché sur la page business.
  assert.ok(fs.readFileSync(path.join(root, "public/business-assets/lead-flow.js"), "utf8").includes('whatsappNumber: "6285128115218"'));
});

test("investprotrading.fr/whatsapp-vip, for Telegram channel posts, says the person comes from the channel and wants the VIP", () => {
  const config = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");
  assert.match(config, /\{source:"\/whatsapp-vip",destination:WHATSAPP_VIP,permanent:false\}/);
  assert.match(config, /const WHATSAPP_VIP="https:\/\/wa\.me\/6285128115218\?text="\+encodeURIComponent\(WHATSAPP_VIP_TEXT\);/);
  const text = config.match(/const WHATSAPP_VIP_TEXT="([^"]+)";/)[1];
  assert.match(text, /canal Telegram/);
  assert.match(text, /rejoindre le VIP/);
  assert.ok(!/[()*:{}]/.test(text), "no character that the redirect pattern would misread");
});
