import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

// investprotrading.fr/business (lien en bio TikTok « Invest Pro Trading Business ») : à l'arrivée, une invitation
// à la prochaine conférence s'ouvre, sans date, avec le lien d'inscription LEK Academy.
const root = path.resolve(import.meta.dirname, "..");
const html = fs.readFileSync(path.join(root, "public/business.html"), "utf8");
const script = fs.readFileSync(path.join(root, "public/business-assets/conference.js"), "utf8");
const css = fs.readFileSync(path.join(root, "public/business-assets/conference.css"), "utf8");

test("the business page loads the conference invitation and its styles", () => {
  assert.match(html, /<link rel="stylesheet" href="\/business-assets\/conference\.css\?v=[\w-]+">/);
  assert.match(html, /<script defer src="\/business-assets\/conference\.js\?v=[\w-]+"><\/script>/);
  assert.match(html, /<dialog id="business-conference" class="biz-conference"[^>]* data-enabled="true">/);
  for (const name of ["biz-conference", "biz-conference-next", "biz-conference-register", "biz-conference-later"]) {
    assert.match(css, new RegExp(`\\.${name}\\{`), name);
  }
});

test("the invitation is for the next conference, with no date, and registers on lekacademy.com/enrick", () => {
  const dialog = html.slice(html.indexOf('<dialog id="business-conference"'), html.lastIndexOf("</dialog>"));
  assert.ok(dialog.includes("PROCHAINE CONFÉRENCE"));
  assert.ok(dialog.includes("Les inscriptions sont ouvertes"));
  assert.match(dialog, /<a class="biz-conference-register" href="https:\/\/lekacademy\.com\/enrick">/);
  // Aucune date ni heure affichée.
  assert.ok(!/novembre|décembre|\b\d{1,2}h\b|data-start|data-expires/.test(dialog), "pas de date dans l'invitation");
  // Le lien permanent de l'en-tête et le bouton du bas restent en place.
  assert.equal((html.match(/href="https:\/\/lekacademy\.com\/enrick"/g) || []).length, 3);
});

test("the invitation opens on arrival once per visit and never over another window", () => {
  assert.match(script, /dialog\.dataset\.enabled !== 'true'/);
  assert.match(script, /sessionStorage\.setItem\(seenKey, '1'\)/);
  assert.match(script, /setTimeout\(openOnArrival, \d+\)/);
  assert.match(script, /dialog\[open\], \[role="dialog"\]\[aria-modal="true"\]/);
  // Navigateur sans <dialog> : rien ne s'ouvre et personne n'est redirigé.
  assert.match(script, /typeof dialog\.showModal !== 'function'\) return;/);
  assert.ok(!/location\.(assign|replace|href\s*=)/.test(script));
});
