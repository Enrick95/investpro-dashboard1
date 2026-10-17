import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";

function fixture(windows = []) {
  const listeners = {}, notifications = [], opened = [];
  const self = { location: { origin: "https://investprotrading.fr" }, addEventListener(name, handler) { listeners[name] = handler; }, registration: { async showNotification(title, options) { notifications.push({ title, ...options }); } }, clients: { async matchAll() { return windows; }, async openWindow(url) { opened.push(url); } } };
  vm.runInNewContext(fs.readFileSync(path.resolve(import.meta.dirname, "../public/sw.js"), "utf8"), { self, URL });
  return { notifications, opened, async push(payload) { let pending; listeners.push({ data: { json: () => payload }, waitUntil(value) { pending = value; } }); await pending; }, async click(notification) { let pending; listeners.notificationclick({ notification: { data: notification.data, close() {} }, waitUntil(value) { pending = value; } }); await pending; } };
}
test("the actual service worker displays a delivered VIP signal even without an open app window", async () => {
  const sw = fixture(); await sw.push({ title: "Nouveau signal · XAUUSD BUY", body: "Entrée 3000 · SL 2990 · TP1 3020", tag: "offline-signal-fixture", url: "/dashboard/vip?view=signal" });
  assert.equal(sw.notifications.length, 1); assert.equal(sw.notifications[0].title, "Nouveau signal · XAUUSD BUY");
  assert.equal(sw.notifications[0].data.url, "https://investprotrading.fr/dashboard/vip?view=signal");
  await sw.click(sw.notifications[0]); assert.deepEqual(sw.opened, ["https://investprotrading.fr/dashboard/vip?view=signal"]);
});
test("the service worker cannot open a foreign link from a push payload", async () => {
  const sw = fixture(); await sw.push({ title: "Offline fixture", url: "https://foreign.invalid/sensitive" }); await sw.click(sw.notifications[0]);
  assert.deepEqual(sw.opened, ["https://investprotrading.fr/dashboard/copieur"]);
});
