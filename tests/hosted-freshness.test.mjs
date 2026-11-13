import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// The hosting PC reads its MT5 accounts in turn: about five minutes between two readings of the same account for
// twenty accounts. A three-minute limit showed healthy accounts as « Synchronisation interrompue » and asked their
// members to reconnect. Every view of a hosted connection uses the same 15-minute limit.
const root = path.resolve(import.meta.dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("a hosted connection counts as interrupted only after 15 minutes without a reading", () => {
  assert.match(read("lib/metasync/hosted-freshness.ts"), /HOSTED_SYNC_STALE_MS = 15 \* 60 \* 1000/);
  for (const file of ["components/metasync/HostedSyncPanel.tsx", "app/dashboard/admin/vip/VipAccessRequestsAdmin.tsx"]) {
    const source = read(file);
    assert.match(source, /from "@\/lib\/metasync\/hosted-freshness"/, file);
    assert.doesNotMatch(source, /last_sync\)\s*[<>]=?\s*180000/, file);
  }
  const page = read("public/vip-deja-membre-v2.html");
  assert.match(page, /Date\.now\(\)-Date\.parse\(m\.last_sync\)<=900000/);
  assert.doesNotMatch(page, /last_sync\)<=180000/);
});

test("the reconnect banner asks for the MetaTrader password, not specifically the investor one", () => {
  const panel = read("components/metasync/HostedSyncPanel.tsx");
  assert.ok(panel.includes("avec votre mot de passe MetaTrader actuel"));
  assert.ok(!panel.includes("mot de passe investisseur MetaTrader actuel"));
  assert.ok(!panel.includes("current MetaTrader investor password"));
});
