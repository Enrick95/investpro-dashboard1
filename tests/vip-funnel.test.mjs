import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

// Pages VIP : /vip et /vip/rejoindre en ligne (v5, au design de /business), /vip-test gardée de côté (v4).
// Elles réutilisent les API existantes sans les modifier, donc leurs champs, leurs brokers et leurs liens
// d'affiliation doivent rester alignés sur elles.
const project = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(project, file), "utf8");
const VERSIONS = [
  { name: "v4", route: "/vip-test", landing: read("public/vip-v4.html"), join: read("public/vip-v4-rejoindre.html") },
  { name: "v5", route: "/vip", landing: read("public/vip-v5.html"), join: read("public/vip-v5-rejoindre.html") },
];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

test("/vip and /vip/rejoindre serve v5, while invitation codes and old access links keep their app pages", () => {
  const config = read("next.config.ts");
  assert.match(config, /\{source:"\/vip",destination:"\/vip-v5\.html",missing:\[\{type:"query",key:"code"\}\]\}/);
  assert.match(config, /\{source:"\/vip\/rejoindre",destination:"\/vip-v5-rejoindre\.html",missing:\[\{type:"query",key:"access"\}\]\}/);
  assert.ok(!/source:"\/vip\/rejoindre",destination:"\/vip",statusCode:301/.test(config), "the old redirect to /vip is gone");
  // L'ancienne adresse de test renvoie vers la page en ligne, sans redirection permanente.
  assert.match(config, /\{source:"\/vip-test-2",destination:"\/vip",permanent:false\}/);
  assert.match(config, /\{source:"\/vip-test-2\/rejoindre",destination:"\/vip\/rejoindre",permanent:false\}/);
  // La v4 reste consultable sur /vip-test.
  assert.match(config, /\{source:"\/vip-test",destination:"\/vip-v4\.html"\}/);
  assert.match(config, /\{source:"\/vip-test\/rejoindre",destination:"\/vip-v4-rejoindre\.html"\}/);
  for (const { landing, join } of VERSIONS) for (const page of [landing, join]) assert.match(page, /<meta name="robots" content="noindex">/);
  const [, v5] = VERSIONS;
  assert.ok(!/vip-test/.test(v5.landing) && !/vip-test/.test(v5.join), "the live pages never link to a test address");
});

for (const { name, route, landing, join } of VERSIONS) {
  test(`${name}: the join card sends the chosen situation to its own join flow`, () => {
    for (const value of ["nouveau", "rattachement", "essai"]) assert.match(landing, new RegExp(`name="parcours" value="${value}"`));
    assert.match(landing, new RegExp(`start\\.href='${esc(route)}/rejoindre\\?parcours='\\+encodeURIComponent\\(on\\.value\\)`));
    assert.match(join, new RegExp(`class="brand" href="${esc(route)}"`));
    assert.match(landing, /href="\/vip\/deja-membre"/);
    assert.match(landing, /href="\/dashboard\/vip"/);
    // L'essai disparaît tout seul après le 30 novembre.
    assert.match(landing, /new Date\('2026-11-30T23:59:59\+01:00'\)/);
    assert.match(landing, /<label class="opt" data-until-end>/);
  });

  test(`${name}: the page shows the members' screenshots and no VIP statistics`, () => {
    assert.ok(!/api\/vip\/performance/.test(landing));
    assert.ok(!/\d+,\d\s?R\b/.test(landing), "no R result on the page");
    assert.match(landing, /id="temoignages"/);
    assert.ok((landing.match(/src="\/enrick-assets\/[a-z0-9-]+\.jpg"/g) || []).length >= 4);
    assert.match(landing, /préparateur de commandes/);
    assert.ok(!/responsable logistique/i.test(landing));
    assert.ok(!/InvestPro Copy/i.test(landing));
  });

  test(`${name}: the dossier is sent with exactly the fields the application API reads`, () => {
    const api = read("app/api/vip/nouveau-membre/demande/route.ts");
    const read_ = new Set([...api.matchAll(/form\.get\("([A-Za-z]+)"\)/g)].map((m) => m[1]));
    const sent = new Set([...join.matchAll(/fd\.set\('([A-Za-z]+)'/g)].map((m) => m[1]));
    assert.deepEqual([...sent].sort(), [...read_].sort());
    assert.match(join, /fetch\('\/api\/vip\/nouveau-membre\/demande',\{method:'POST',body:fd,credentials:'same-origin'\}\)/);
    assert.match(join, /fd\.set\('typeCompte',link\?'rattachement':'nouveau'\)/);
    assert.match(join, /fd\.set\('viaEnrick','true'\)/);
  });

  test(`${name}: the demo trial is sent with the full form the trial API validates`, () => {
    const lib = read("lib/essai-vip.ts");
    for (const field of ["prenom", "nomFamille", "compte", "serveur", "motdepasse"]) assert.match(lib, new RegExp(`"${field}"`));
    const body = join.match(/fetch\('\/api\/essai-vip'[^]*?body:JSON\.stringify\(\{([^}]*)\}\)/)[1];
    const keys = body.split(",").map((pair) => pair.split(":")[0].trim()).sort();
    assert.deepEqual(keys, ["broker", "compte", "confirmeDemo", "email", "motdepasse", "nomFamille", "prenom", "serveur", "telegram", "telephone", "website"]);
    assert.match(lib, /ESSAI_VIP_BROKERS = \["Raise FX", "VT Markets", "PU Prime", "Axi", "Bullwaves"\]/);
    assert.match(join, /essai:'Bullwaves'/);
    assert.match(join, /essai:'Raise FX'/);
  });

  test(`${name}: brokers and affiliate links match the current join wizard`, () => {
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

  test(`${name}: status tracking is shared with the current new-member page and the member card follows it`, () => {
    const current = read("public/vip-nouveau-membre.html");
    const key = current.match(/SUIVI_KEY='([^']+)'/)[1];
    assert.ok(join.includes(`var SUIVI_KEY='${key}'`));
    assert.match(join, /fetch\('\/api\/vip\/nouveau-membre\/suivi',\{method:'POST'/);
    const fields = join.match(/var FIELDS=\[([^\]]+)\]/)[1];
    assert.ok(!/password|motdepasse|capture/i.test(fields), "no file or password kept in the draft");
    for (const label of ["En validation", "Validée", "Active", "Refusée", "Lien expiré"]) assert.ok(join.includes(`'${label}'`), label);
    assert.match(join, /\.step\.enter-fwd,\.step\.enter-back,\.mcard,\.mcard::after,\.mcard-line path\{animation:none\}/);
  });
}

test("v5 uses the /business typeface and keeps the neon border still when motion is reduced", () => {
  const [, v5] = VERSIONS;
  for (const weight of ["400", "700"]) {
    assert.ok(fs.existsSync(path.join(project, `public/business-assets/biotif-${weight}.woff2`)));
    for (const page of [v5.landing, v5.join]) assert.ok(page.includes(`url("/business-assets/biotif-${weight}.woff2")`));
  }
  for (const page of [v5.landing, v5.join]) assert.ok(!/fonts\.googleapis/.test(page));
  assert.match(v5.landing, /prefers-reduced-motion:reduce\)\{html\{scroll-behavior:auto\}\.cta::before\{animation:none\}/);
  assert.match(v5.join, /prefers-reduced-motion:reduce\)\{\.btn,\.choice,\.input\{transition:none\}\.btn-gold::before,/);
});

test("v5 shows every member capture and written testimonial that /business has", () => {
  const data = JSON.parse(read("public/business-assets/testimonials.json"));
  const [, v5] = VERSIONS;
  for (const src of data.screenshots) assert.ok(v5.landing.includes(`<a href="${src}">`), src);
  assert.equal((v5.landing.match(/<article class="mcard">/g) || []).length, data.screenshots.length);
  for (const { author } of data.quotes) assert.ok(v5.landing.includes(`<figcaption>${author}</figcaption>`), author);
  assert.equal((v5.landing.match(/<figure><blockquote>/g) || []).length, data.quotes.length);
  assert.match(v5.landing, new RegExp(`<b>${data.screenshots.length}</b> captures à découvrir`));
});
