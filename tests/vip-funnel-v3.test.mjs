import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

// Nouveau parcours VIP en test (/vip-test et /vip-test/rejoindre) : il réutilise les API existantes
// sans les modifier, donc ses champs, ses brokers et ses liens d'affiliation doivent rester alignés sur elles.
const project = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(project, file), "utf8");
const landing = read("public/vip-v3.html");
const join = read("public/vip-v3-rejoindre.html");

test("the test URLs serve the new pages and the live /vip stays on the current page", () => {
  const config = read("next.config.ts");
  assert.match(config, /\{source:"\/vip-test",destination:"\/vip-v3\.html"\}/);
  assert.match(config, /\{source:"\/vip-test\/rejoindre",destination:"\/vip-v3-rejoindre\.html"\}/);
  assert.match(config, /\{source:"\/vip",destination:"\/vip-v2\.html",missing:\[\{type:"query",key:"code"\}\]\}/);
  for (const page of [landing, join]) assert.match(page, /<meta name="robots" content="noindex">/);
});

test("the dossier is sent with exactly the fields the application API reads", () => {
  const api = read("app/api/vip/nouveau-membre/demande/route.ts");
  const read_ = new Set([...api.matchAll(/form\.get\("([A-Za-z]+)"\)/g)].map((m) => m[1]));
  const sent = new Set([...join.matchAll(/fd\.set\('([A-Za-z]+)'/g)].map((m) => m[1]));
  assert.deepEqual([...sent].sort(), [...read_].sort());
  assert.match(join, /fetch\('\/api\/vip\/nouveau-membre\/demande',\{method:'POST',body:fd,credentials:'same-origin'\}\)/);
  assert.match(join, /fd\.set\('typeCompte',link\?'rattachement':'nouveau'\)/);
  assert.match(join, /fd\.set\('viaEnrick','true'\)/);
});

test("the demo trial is sent with the full form the trial API validates", () => {
  const lib = read("lib/essai-vip.ts");
  for (const field of ["prenom", "nomFamille", "compte", "serveur", "motdepasse"]) assert.match(lib, new RegExp(`"${field}"`));
  const body = join.match(/fetch\('\/api\/essai-vip'[^]*?body:JSON\.stringify\(\{([^}]*)\}\)/)[1];
  const keys = body.split(",").map((pair) => pair.split(":")[0].trim()).sort();
  assert.deepEqual(keys, ["broker", "compte", "confirmeDemo", "email", "motdepasse", "nomFamille", "prenom", "serveur", "telegram", "telephone", "website"]);
  assert.match(lib, /ESSAI_VIP_BROKERS = \["Raise FX", "VT Markets", "PU Prime", "Axi", "Bullwaves"\]/);
  assert.match(join, /essai:'Bullwaves'/);
  assert.match(join, /essai:'Raise FX'/);
});

test("brokers and affiliate links match the current join wizard", () => {
  const identity = read("lib/vip/identity.ts");
  const keys = [...identity.matchAll(/\{ value: "([a-z_]+)", label: "([^"]+)" \}/g)].map((m) => [m[1], m[2]]);
  assert.equal(keys.length, 5);
  for (const [key, label] of keys) assert.match(join, new RegExp(`${key}:\\{label:'${label}',signup:'`));
  const wizard = read("app/vip/rejoindre/JoinVip.tsx");
  const signups = [...wizard.matchAll(/signupUrl: "([^"]+)"/g)].map((m) => m[1]);
  assert.equal(signups.length, 5);
  for (const url of signups) assert.ok(join.includes(`signup:'${url}'`), url);
  assert.ok(join.includes("Bonjour, je souhaiterais être rattaché au compte de Enrick, ID : 153152."));
  assert.ok(join.includes("code 90088") && join.includes("4740681") && join.includes("ENRICK100"));
});

test("status tracking is shared with the current new-member page", () => {
  const current = read("public/vip-nouveau-membre.html");
  const key = current.match(/SUIVI_KEY='([^']+)'/)[1];
  assert.ok(join.includes(`var SUIVI_KEY='${key}'`));
  assert.match(join, /fetch\('\/api\/vip\/nouveau-membre\/suivi',\{method:'POST'/);
  // Ni fichier ni mot de passe dans le brouillon gardé sur le téléphone.
  const fields = join.match(/var FIELDS=\[([^\]]+)\]/)[1];
  assert.ok(!/password|motdepasse|capture/i.test(fields));
});

test("the landing tells the true story and promises nothing that is not live", () => {
  assert.ok(!/responsable logistique/i.test(landing));
  assert.ok(!/InvestPro Copy/i.test(landing));
  assert.match(landing, /préparateur de commandes/);
  assert.match(landing, /fetch\('\/api\/vip\/performance'/);
  assert.ok(!/Ce mois/.test(landing), "results open on the whole history, not the current month");
});
