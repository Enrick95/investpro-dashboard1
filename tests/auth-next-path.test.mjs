import assert from "node:assert/strict";
import { test } from "node:test";
import { safeNextPath } from "../lib/auth-next-path.ts";

test("authentication preserves only VIP and dashboard destinations, including invitation queries", () => {
  for (const destination of ["/vip", "/vip?code=Abc_123-xyz", "/dashboard", "/dashboard/", "/dashboard/admin/vip", "/dashboard/comptes?tab=mt5#account"]) {
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
  ]) assert.equal(safeNextPath(destination), "/dashboard", destination);
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
