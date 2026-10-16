import assert from "node:assert/strict";
import { test } from "node:test";
import { safeNextPath } from "../lib/auth-next-path.ts";

test("authentication preserves allowed VIP, dashboard and admin-preview destinations", () => {
  for (const destination of ["/vip", "/vip?code=Abc_123-xyz", "/vip/deja-membre", "/vip/deja-membre?source=telegram#form", "/dashboard", "/dashboard/", "/dashboard/admin/vip", "/dashboard/comptes?tab=mt5#account", "/admin-preview", "/admin-preview?tool=finance", "/admin-preview?tool=utilisateurs&member=11111111-1111-1111-1111-111111111111"]) {
    assert.equal(safeNextPath(destination), destination);
  }
});

test("external URLs, protocol-relative paths, controls and backslash redirects cannot escape the site", () => {
  for (const destination of [
    "https://evil.example/dashboard", "http://evil.example/vip", "//evil.example/vip",
    "/\\evil.example", "\\\\evil.example", "javascript:alert(1)",
    "/vip\n", "/vip\r?code=x", "/dashboard\t/admin", " /vip", "/vip ",
    "/vip?code=x\\y", "/dashboard/\u0000vip", "/dashboard/\u007fadmin",
  ]) assert.equal(safeNextPath(destination), "/dashboard", JSON.stringify(destination));
});

test("encoded separators, dot traversal and route-prefix lookalikes are rejected", () => {
  for (const destination of [
    "%2Fvip", "/%2f%2fevil.example", "/dashboard/%2F%2Fevil.example",
    "/dashboard/%5cevil.example", "/dashboard/%252f%252fevil.example",
    "/dashboard/%2e%2e/vip", "/dashboard/../vip", "/dashboard/./admin",
    "/dashboard//admin", "/dashboardevil", "/vip/other", "/api/admin/vip", "/login",
    "/vip/deja-membres", "/vip/deja-membre/other", "/vip/deja-membre/../admin",
    "/vip/%64eja-membre", "/vip/deja-membre%2fadmin", "/vip/deja-membre//evil.example",
    "/admin-preview-evil", "/admin-preview/other", "/admin-preview/../vip", "/admin-preview%2fother", "/%61dmin-preview",
  ]) assert.equal(safeNextPath(destination), "/dashboard", destination);
});

test("admin preview login keeps the selected tool and member on the same origin", () => {
  const origin = "https://preview.investpro.invalid";
  const destination = "/admin-preview?tool=utilisateurs&member=11111111-1111-1111-1111-111111111111";
  const login = new URL("/login", origin);
  login.searchParams.set("next", destination);
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", safeNextPath(login.searchParams.get("next")));
  const resolved = new URL(safeNextPath(callback.searchParams.get("next")), origin);
  assert.equal(resolved.origin, origin);
  assert.equal(resolved.pathname + resolved.search, destination);
});

test("registration keeps its onboarding default, and unsafe fallback values are also rejected", () => {
  for (const value of [null, undefined, "", 42, {}, "/outside"]) {
    assert.equal(safeNextPath(value, "/dashboard/onboarding"), "/dashboard/onboarding");
  }
  assert.equal(safeNextPath(null, "https://evil.example"), "/dashboard");
  assert.equal(safeNextPath("/vip?code=trusted", "https://evil.example"), "/vip?code=trusted");
});

test("OAuth encoding round trips nested invitation query strings without turning them into origins", () => {
  const destination = "/vip?code=abc-123_xyz&source=invitation";
  const callback = new URL("/auth/callback", "https://investprotrading.fr");
  callback.searchParams.set("next", safeNextPath(destination));
  assert.equal(new URL(callback.toString()).searchParams.get("next"), destination);
  assert.equal(new URL(safeNextPath(callback.searchParams.get("next")), callback.origin).origin, callback.origin);
});

test("signup and login callbacks preserve the exact former-member intake destination", () => {
  for (const path of ["/signup", "/login"]) {
    const entry = new URL(path, "https://investprotrading.fr");
    entry.searchParams.set("next", "/vip/deja-membre");
    const callback = new URL("/auth/callback", entry.origin);
    callback.searchParams.set("next", safeNextPath(entry.searchParams.get("next"), "/dashboard/onboarding"));
    assert.equal(safeNextPath(callback.searchParams.get("next")), "/vip/deja-membre");
  }
});

test("new VIP signup and email confirmation preserve broker and account choices safely", () => {
  const destination = "/vip/rejoindre?access=affiliation&broker=axi&account=existing";
  for (const path of ["/signup", "/login"]) {
    const entry = new URL(path, "https://investprotrading.fr");
    entry.searchParams.set("next", destination);
    const callback = new URL("/auth/callback", entry.origin);
    callback.searchParams.set("next", safeNextPath(entry.searchParams.get("next")));
    assert.equal(safeNextPath(callback.searchParams.get("next")), destination);
    assert.equal(new URL(safeNextPath(callback.searchParams.get("next")), entry.origin).origin, entry.origin);
  }
  for (const invalid of ["/vip/rejoindre/other", "/vip/rejoindre/../admin", "/vip/rejoindre%2fadmin", "/vip/rejoindreevil"]) assert.equal(safeNextPath(invalid), "/dashboard");
});
