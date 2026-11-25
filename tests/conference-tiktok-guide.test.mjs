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

test("the conference guide keeps the business guide's steps, with the conference as destination", () => {
  // Hors navigateur TikTok : direction la page d'inscription.
  assert.ok(conference.includes("if(!preview&&!inApp&&external)location.replace('https://lekacademy.com/enrick');"));
  assert.ok(conference.includes('data-copy-url="https://lekacademy.com/enrick"'));
  assert.ok(conference.includes('<a class="brand" href="https://lekacademy.com/enrick?navigation=externe"'));
  // Mêmes étapes, mêmes boutons et même animation que le guide de /business.
  const ids = html => [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(ids(conference), ids(business));
  for (const text of ["Touche le menu en haut à droite", "Choisis « Ouvrir dans le navigateur »", "Copier le lien", "Revoir l’animation", "Ouvrir dans le navigateur"]) {
    assert.ok(conference.includes(text), text);
  }
  // Le guide de /business ne change pas.
  assert.ok(business.includes("location.replace('/business?navigation=externe')"));
  assert.ok(business.includes('<body class="access-page">'));
  assert.ok(!business.includes("conference-guide"));
});

test("the conference guide wears the conference page's look: navy, blue #0066ff, its texts", () => {
  assert.ok(conference.includes('<html lang="fr" class="conference-guide">'));
  assert.match(conference, /<link rel="stylesheet" href="\/business-assets\/conference-guide\.css\?v=[\w-]+">/);
  assert.ok(conference.includes("<title>Accéder à la conférence d’Enrick depuis TikTok</title>"));
  assert.ok(conference.includes('Pour accéder à ma conférence, suis ces <em>deux étapes simples.</em>'));
  assert.ok(conference.includes("<span>lekacademy.com</span>"));
  assert.ok(conference.includes("Le trading commence<br>par <em>tes décisions.</em>"));
  assert.ok(!/#ff792f|#ffad78/.test(conference), "curseur bleu, plus orange");
  const css = read("public/business-assets/conference-guide.css");
  assert.ok(css.includes("background:#03070d!important"));
  assert.ok(css.includes("#0066ff35 1px"), "la grille de la page conférence");
  assert.ok(css.includes("font-family:Inter,Arial,sans-serif"));
  assert.ok(!/#ff702e|#bd7957|#cf865f/i.test(css), "aucune couleur cuivre");
});

test("« Copier le lien » copies the page's own link, the business link by default", () => {
  const script = read("public/business-assets/access.js");
  assert.ok(script.includes("const url=document.body.dataset.copyUrl||'https://investprotrading.fr/business?navigation=externe';"));
});

test("« Ouvrir dans le navigateur » shows a globe on a blue badge instead of the small arrow, in the conference guide only", () => {
  assert.ok(conference.includes('<span class="menu-icon menu-icon-globe" aria-hidden="true">'));
  assert.ok(conference.includes('<circle cx="12" cy="12" r="8.6"/>'), "le globe");
  assert.ok(!conference.includes("M7 13 14 6M7 6h7v7"), "plus de petite flèche");
  assert.ok(conference.includes("conference-guide.css?v=20261125-3"), "nouvelle version de la feuille de style");
  const css = read("public/business-assets/conference-guide.css");
  assert.match(css, /html\.conference-guide #access-guide \.menu-icon-globe\{[^}]*radial-gradient\([^}]*#2f7bff/);
  assert.ok(business.includes("M7 13 14 6M7 6h7v7"), "le guide de /business/acces reste comme avant");
});
