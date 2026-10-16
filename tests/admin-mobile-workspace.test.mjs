import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
function compile(file, modules = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText,
    { module, exports: module.exports, URL, URLSearchParams, require: name => { assert(Object.hasOwn(modules, name), `Unexpected import ${name}`); return modules[name]; } });
  return module.exports;
}
const access = compile("app/admin-preview/admin-tool-access.ts");
const css = new Proxy({}, { get: (_target, name) => String(name) });
function render(query = "", locale = "fr") {
  function Link({ href, prefetch: _prefetch, ...props }) { return React.createElement("a", { href, ...props }); }
  const Component = compile("components/admin/AdminWorkspace.tsx", {
    react: require("react"), "react/jsx-runtime": require("react/jsx-runtime"), "lucide-react": require("lucide-react"),
    "next/link": { __esModule: true, default: Link },
    "next/navigation": { useRouter: () => ({ push() { throw new Error("SSR must never navigate"); } }), useSearchParams: () => new URLSearchParams(query) },
    "@/components/i18n/LanguageSwitcher": { __esModule: true, default: () => React.createElement("button", { type: "button" }, locale.toUpperCase()) },
    "@/components/i18n/LocaleProvider": { useLocale: () => ({ locale }) },
    "@/app/admin-preview/AdminToolWorkspace": { __esModule: true, default: props => React.createElement("section", { "data-tool": props.tool, "data-vip-view": props.vipView || "", "data-base-path": props.basePath }) },
    "@/app/admin-preview/admin-tool-access": access,
    "./AdminWorkspace.module.css": { __esModule: true, default: css },
  }).default;
  return renderToStaticMarkup(React.createElement(Component));
}
function nav(html, className) { const result = html.match(new RegExp(`<nav class="${className}"[\\s\\S]*?<\\/nav>`)); assert(result, `Missing ${className}`); return result[0]; }
const decode = value => value.replaceAll("&amp;", "&");
const hrefs = html => [...html.matchAll(/href="([^"]+)"/g)].map(match => decode(match[1]));
function activeHref(html) { const result = html.match(/<a\b(?=[^>]*aria-current="page")[^>]*href="([^"]+)"[^>]*>/); return result ? decode(result[1]) : null; }

test("mobile rail contains seven named shortcuts and the explicit all-sections action", () => {
  const rail = nav(render(), "mobileRail");
  assert.equal((rail.match(/<a\b/g) || []).length, 7); assert.equal((rail.match(/<button\b/g) || []).length, 1);
  for (const label of ["Accueil", "Membres", "Demandes", "Posts VIP", "Finance", "Stats", "Équipe", "Tout"]) assert(rail.includes(`<span>${label}</span>`), label);
  assert.deepEqual(hrefs(rail), ["/dashboard/admin?tool=overview-current", "/dashboard/admin?tool=vip&view=members", "/dashboard/admin?tool=vip&view=requests", "/dashboard/admin?tool=vip-publications", "/dashboard/admin?tool=finance", "/dashboard/admin?tool=analytics", "/dashboard/admin?tool=staff"]);
});
test("English labels describe all eight mobile actions without changing their destinations", () => {
  const fr = nav(render("tool=finance"), "mobileRail"), en = nav(render("tool=finance", "en"), "mobileRail");
  for (const label of ["Home", "Members", "Requests", "VIP posts", "Finance", "Stats", "Team", "All"]) assert(en.includes(`<span>${label}</span>`), label);
  assert.deepEqual(hrefs(fr), hrefs(en)); assert.match(en, /aria-label="Administration shortcuts"/);
});
test("members and requests remain distinct active VIP views", () => {
  for (const view of ["members", "requests"]) {
    const html = render(`tool=vip&view=${view}`);
    assert.equal(activeHref(nav(html, "mobileRail")), `/dashboard/admin?tool=vip&view=${view}`);
    assert.equal((nav(html, "mobileRail").match(/aria-current="page"/g) || []).length, 1);
    assert.match(html, new RegExp(`data-tool="vip" data-vip-view="${view}" data-base-path="/dashboard/admin"`));
  }
  assert.equal(activeHref(nav(render("tool=vip"), "mobileRail")), "/dashboard/admin?tool=vip&view=members");
});
test("tools without a shortcut highlight All instead of the wrong member view", () => {
  const rail = nav(render("tool=vip&view=subscriptions"), "mobileRail");
  assert.equal(activeHref(rail), null); assert.match(rail, /<button[^>]*data-active="true"/);
  assert.equal(activeHref(nav(render("tool=inbox"), "mobileRail")), null);
});
test("both mobile menu openers control the actual labelled native drawer", () => {
  const html = render();
  assert.equal((html.match(/aria-controls="admin-navigation-drawer"/g) || []).length, 2);
  assert.equal((html.match(/aria-expanded="false"/g) || []).length, 2);
  assert.match(html, /<dialog id="admin-navigation-drawer"[^>]*aria-label="Menu administration"/);
  assert.match(html, />Rubriques<\/span>/); assert.match(html, /Toutes les rubriques/); assert.match(html, /aria-label="Fermer le menu"/);
  const en = render("", "en"); assert.match(en, />Sections<\/span>/); assert.match(en, /All sections/); assert.match(en, /aria-label="Close menu"/);
});
test("drawer retains twenty reachable tools, four named groups and a support exit", () => {
  const html = render("tool=vip&view=settings"), drawer = html.slice(html.indexOf('<dialog id="admin-navigation-drawer"'));
  const list = nav(drawer, "navigation"); const paths = hrefs(list);
  assert.equal(paths.length, 20); assert.equal(new Set(paths).size, 20); assert.equal((list.match(/role="group"/g) || []).length, 4);
  for (const group of ["Pilotage", "Membres &amp; accès", "Contenu &amp; échanges", "Plateforme &amp; réglages"]) assert(list.includes(`<h2>${group}</h2>`));
  for (const path of paths) assert(access.parseCurrentAdminPath(path), path);
  assert.equal(activeHref(list), "/dashboard/admin?tool=vip&view=settings");
  assert(drawer.includes('href="/dashboard/contact"')); assert(drawer.includes("Aide &amp; support"));
});
test("invalid tool queries safely fall back to Overview while member details retain their own route", () => {
  assert.equal(activeHref(nav(render("tool=unknown&view=requests"), "mobileRail")), "/dashboard/admin?tool=overview-current");
  const id = "11111111-1111-4111-8111-111111111111";
  const detail = render(`tool=utilisateurs&member=${id}`);
  assert.match(detail, /Dossier membre/); assert.match(detail, /data-tool="utilisateurs"/); assert.equal(activeHref(nav(detail, "mobileRail")), null);
});
