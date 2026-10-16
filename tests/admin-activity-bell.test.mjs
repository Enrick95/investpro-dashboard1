import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
const module = { exports: {} };
const source = fs.readFileSync(path.resolve(import.meta.dirname, "../components/admin/AdminActivityBell.tsx"), "utf8");
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText,
  { module, exports: module.exports, URL, require: name => {
    assert(["react", "react/jsx-runtime", "lucide-react", "@/components/i18n/LocaleProvider", "./AdminActivityBell.module.css"].includes(name)); return {};
  } });
const { adminActivityDestination: destination, adminActivityNotices: notices } = module.exports;
const base = { id: "notice-1", title: "Demande VIP reçue", message: "Affiliation à vérifier.", href: "/dashboard/admin?tool=vip&view=requests", created_at: "2026-10-16T03:00:00Z", read_at: null };

test("admin bell accepts only known VIP requests or members in the same workspace", () => {
  assert.equal(destination(base.href), base.href);
  assert.equal(destination("/dashboard/admin?view=members&tool=vip"), "/dashboard/admin?tool=vip&view=members");
  for (const value of [null, "https://evil.test/dashboard/admin?tool=vip&view=requests", "//evil.test", "/dashboard/vip", "/dashboard/admin?tool=finance&view=requests", "/dashboard/admin?tool=vip&view=settings", "/dashboard/admin?tool=vip&view=requests#x", "/dashboard/admin?tool=vip&view=requests&next=evil", "/dashboard/admin?tool=vip&tool=vip&view=requests", "/dashboard/admin?tool=vip\n&view=requests"]) assert.equal(destination(value), null);
});
test("malformed, missing and unrelated notification rows never create placeholder alerts", () => {
  assert.equal(notices(undefined).length, 0); assert.equal(notices({}).length, 0);
  for (const invalid of [null, {}, { ...base, id: undefined }, { ...base, title: "" }, { ...base, message: undefined }, { ...base, created_at: "not-a-date" }, { ...base, read_at: "bad" }, { ...base, href: "/dashboard/copieur" }]) assert.equal(notices([invalid]).length, 0);
});
test("real notification identity and read state survive validation unchanged", () => {
  const result = notices([base, { ...base, id: "notice-2", href: "/dashboard/admin?tool=vip&view=members", read_at: "2026-10-16T03:01:00Z" }]);
  assert.equal(result.length, 2); assert.equal(result[0].id, "notice-1"); assert.equal(result[0].read_at, null); assert.equal(result[1].read_at, "2026-10-16T03:01:00Z");
  assert.equal(result.filter(row => !row.read_at).length, 1);
});
