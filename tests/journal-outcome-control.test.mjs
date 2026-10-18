import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const jsx = (type, props) => ({ type, props });
const source = fs.readFileSync(path.join(root, "components/journal/TradeOutcomeControl.tsx"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function harness(overrides = {}, rpcResult = { error: null }) {
  const states = [];
  const calls = [];
  let cursor = 0;
  let saved = 0;
  const loadedModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: loadedModule, exports: loadedModule.exports, document: { body: {} },
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react") return {
        useState(initial) {
          const index = cursor++;
          if (!(index in states)) states[index] = initial;
          return [states[index], value => { states[index] = value; }];
        },
        useEffect() {}, useRef: () => ({ current: null }), useId: () => "test-outcome",
      };
      if (name === "react-dom") return { createPortal: node => node };
      if (name === "@/components/i18n/LocaleProvider") return { useLocale: () => ({ t: text => text }) };
      if (name === "@/lib/supabase/client") return { createClient: () => ({ rpc: async (...args) => { calls.push(args); return rpcResult; } }) };
      return {};
    },
  });
  return {
    calls,
    get saved() { return saved; },
    render() {
      cursor = 0;
      return loadedModule.exports.default({ trade: { id: 17, symbol: "XAUUSD", status: "loss", result_amount: -3.25, ...overrides }, onSaved: async () => { saved++; } });
    },
  };
}

function nodes(tree, matches) {
  if (tree == null || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(node => nodes(node, matches));
  return [...(matches(tree) ? [tree] : []), ...nodes(tree.props?.children, matches)];
}

function text(tree) {
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join(" ");
  return text(tree.props?.children);
}

const event = () => ({ preventDefault() {}, stopPropagation() {} });
function open(h) {
  const trigger = nodes(h.render(), node => node.type === "button" && node.props["aria-haspopup"] === "dialog")[0];
  trigger.props.onClick(event());
  return h.render();
}
function choose(h, value) {
  const radio = nodes(h.render(), node => node.type === "input" && node.props.value === value)[0];
  radio.props.onChange();
  return h.render();
}
const submit = h => nodes(h.render(), node => node.type === "form")[0].props.onSubmit(event());

test("technical BE requires explicit SL-trigger confirmation and only writes an outcome annotation", async () => {
  const h = harness();
  const dialog = nodes(open(h), node => node.type === "dialog")[0];
  assert.equal(dialog.props["aria-labelledby"], "test-outcome-title");
  choose(h, "breakeven");
  const confirmation = nodes(h.render(), node => node.type === "input" && node.props.type === "checkbox")[0];
  assert.equal(confirmation.props.required, true);
  assert.match(text(h.render()), /SL placé au prix d’entrée a déclenché la sortie/);
  assert.match(text(h.render()), /clôture manuelle en petite perte reste une LOSS/);
  await submit(h);
  assert.equal(h.calls.length, 0, "No classification is sent before BE confirmation");
  confirmation.props.onChange({ target: { checked: true } });
  await submit(h);
  assert.equal(h.calls[0][0], "investpro_set_trade_outcome");
  assert.equal(JSON.stringify(h.calls[0][1]), JSON.stringify({ p_trade_id: 17, p_outcome: "breakeven" }));
  assert.equal(h.saved, 1);
  assert.equal(nodes(h.render(), node => node.type === "dialog").length, 0);
});

test("Auto clears the manual outcome and WIN/LOSS do not require BE confirmation", async () => {
  for (const outcome of ["auto", "win", "loss"]) {
    const h = harness({ outcome_override: "breakeven", outcome_source: "manual" });
    open(h);
    choose(h, outcome);
    assert.equal(nodes(h.render(), node => node.type === "input" && node.props.type === "checkbox").length, 0);
    await submit(h);
    assert.equal(h.calls[0][1].p_outcome, outcome === "auto" ? null : outcome);
    assert.equal(h.saved, 1);
  }
});

test("zero financial source status does not claim a verified technical BE", () => {
  assert.match(text(harness({ status: "breakeven", source_status: "breakeven", result_amount: 0 }).render()), /Résultat source/);
  assert.doesNotMatch(text(harness({ status: "breakeven", outcome_source: "source", automatic_be: true }).render()), /BE automatique confirmé/);
  assert.match(text(harness({ status: "breakeven", outcome_source: "automatic", automatic_be: true }).render()), /BE automatique confirmé/);
  assert.match(text(harness({ status: "breakeven", outcome_source: "manual", outcome_override: "breakeven" }).render()), /Classement manuel/);
});

test("failure leaves the classification dialog open for retry and never signals a save", async () => {
  const h = harness({}, { error: { message: "Denied" } });
  open(h);
  choose(h, "loss");
  await submit(h);
  assert.equal(h.saved, 0);
  assert.equal(nodes(h.render(), node => node.type === "dialog").length, 1);
  assert.match(text(nodes(h.render(), node => node.props?.role === "alert")), /Impossible d’enregistrer/);
});

test("open and cancelled trades have no classification control", () => {
  assert.equal(harness({ status: "open" }).render(), null);
  assert.equal(harness({ status: "cancelled" }).render(), null);
});
