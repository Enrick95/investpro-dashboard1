import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveLocale, translateMessage } from "../lib/i18n/locale.ts";

test("a deliberate language choice wins over browser preferences", () => {
  assert.equal(resolveLocale("fr", "en-US,en;q=0.9"), "fr");
  assert.equal(resolveLocale("en", ["fr-FR", "en-GB"]), "en");
});

test("new visitors use their first supported browser language, with a French fallback", () => {
  assert.equal(resolveLocale(null, ["en-US", "fr-FR"]), "en");
  assert.equal(resolveLocale(null, ["de-DE", "en-GB", "fr-FR"]), "en");
  assert.equal(resolveLocale(null, ["fr-CA", "en-US"]), "fr");
  assert.equal(resolveLocale(null, ["de-DE", "es-ES"]), "fr");
  assert.equal(resolveLocale(null, undefined), "fr");
});

test("Accept-Language quality and exclusions determine server rendering", () => {
  assert.equal(resolveLocale(null, "fr;q=0.5,en-US;q=0.9"), "en");
  assert.equal(resolveLocale(null, "en;q=0,fr;q=0.1"), "fr");
  assert.equal(resolveLocale(null, "de,en;q=0.8,fr;q=0.8"), "en");
  assert.equal(resolveLocale(null, "en;q=NaN,fr"), "fr");
  assert.equal(resolveLocale(null, "en;q=2,fr"), "fr");
});

test("invalid preferences cannot become locale attributes or route fragments", () => {
  for (const value of ["EN", "en-US", "../en", "<script>", "", {}, 42]) {
    assert.equal(resolveLocale(value, ["fr-FR"]), "fr");
  }
  assert.equal(resolveLocale("invalid", "en-US"), "en");
});

test("only known application labels are translated and original text is retained in French", () => {
  const messages = { "Mon espace": "My space", "Connexion": "Connection", "auth:Connexion": "Sign in" };
  assert.equal(translateMessage("fr", "Mon espace", messages), "Mon espace");
  assert.equal(translateMessage("en", "Mon espace", messages), "My space");
  assert.equal(translateMessage("en", "  Mon\n espace ", messages), "  My space ");
  for (const content of ["EURUSD", "Axi", "Mon analyse personnelle", "__proto__", "constructor"]) {
    assert.equal(translateMessage("en", content, messages), content);
  }
  assert.equal(translateMessage("en", "Connexion", messages, "auth"), "Sign in");
  assert.equal(translateMessage("en", "Connexion", messages), "Connection");
  assert.equal(translateMessage("fr", "Connexion", messages, "auth"), "Connexion");
});
