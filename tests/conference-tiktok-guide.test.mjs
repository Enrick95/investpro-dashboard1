import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

// Lien en bio TikTok lekacademy.com/enrick : dans le navigateur de TikTok, une règle Vercel du projet lekacademy-enrick
// renvoie vers investprotrading.fr/conference/acces, le même guide que /business/acces (« Ouvrir dans le navigateur »).
// Ouvert dans Safari ou Chrome, ce guide mène à la page d'inscription lekacademy.com/enrick.
const root = path.resolve(import.meta.dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const business = read("public/business-access.html");
const conference = read("public/conference-access.html");

test("investprotrading.fr/conference/acces serves the conference guide", () => {
  assert.match(read("next.config.ts"), /\{source:"\/business\/acces",destination:"\/business-access\.html"\},\{source:"\/conference\/acces",destination:"\/conference-access\.html"\}/);
});

test("the conference guide is the business guide, with the conference as destination", () => {
  // Hors navigateur TikTok : direction la page d'inscription.
  assert.ok(conference.includes("if(!preview&&!inApp&&external)location.replace('https://lekacademy.com/enrick');"));
  assert.ok(conference.includes('<body class="access-page" data-copy-url="https://lekacademy.com/enrick">'));
  assert.ok(conference.includes('<a class="brand" href="https://lekacademy.com/enrick?navigation=externe"'));
  // Tout le reste est identique au guide de /business (même image, même animation, mêmes textes).
  const normalize = html => html
    .replace(/https:\/\/investprotrading\.fr\/(business|conference)\/acces/, "CANONICAL")
    .replace(/location\.replace\('[^']+'\)/, "location.replace(DESTINATION)")
    .replace(/access\.js\?v=[\w-]+/, "access.js")
    .replace(/<body class="access-page"[^>]*>/, "<body>")
    .replace(/<a class="brand" href="[^"]+"/, '<a class="brand"');
  assert.equal(normalize(conference), normalize(business));
  // Le guide de /business ne change pas.
  assert.ok(business.includes("location.replace('/business?navigation=externe')"));
  assert.ok(business.includes('<body class="access-page">'));
});

test("« Copier le lien » copies the page's own link, the business link by default", () => {
  const script = read("public/business-assets/access.js");
  assert.ok(script.includes("const url=document.body.dataset.copyUrl||'https://investprotrading.fr/business?navigation=externe';"));
});
