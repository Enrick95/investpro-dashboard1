import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
const source=fs.readFileSync(new URL("../lib/copier/day-result-loader.ts",import.meta.url),"utf8");
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness(pages) {
 const calls=[];const cjs={exports:{}};
 const db={from(table){const call={table,filters:[]};calls.push(call);const q={};
  for(const method of ["select","eq","in","not","gte","lt","order","range"]){q[method]=(...args)=>{call.filters.push([method,...args]);return q;};}
  q.abortSignal=signal=>{call.signal=signal;return Promise.resolve(pages[calls.length-1]??{data:[],error:null});};return q;}};
 vm.runInNewContext(code,{module:cjs,exports:cjs.exports,AbortSignal,Date,require:()=>({copierParisDayWindow:()=>({day:"2026-10-23",start:"2026-10-22T22:00:00.000Z",end:"2026-10-23T22:00:00.000Z"})})});
 return{load:cjs.exports.loadCopierDaySnapshot,db,calls};
}
test("daily read is member-scoped, broker-only, closed-only and limited to Paris day boundaries",async()=>{
 const h=harness([{data:[],error:null}]);const snapshot=await h.load(h.db,"member-1",123);
 assert.equal(snapshot.day,"2026-10-23");assert.equal(snapshot.rows.length,0);
 const c=h.calls[0];assert.equal(c.table,"trading_journal_effective");
 const filters=JSON.parse(JSON.stringify(c.filters));
 assert(filters.some(x=>x[0]==="eq"&&x[1]==="user_id"&&x[2]==="member-1"));
 assert.deepEqual(filters.find(x=>x[0]==="in"),["in","status",["win","loss","breakeven"]]);
 assert(filters.some(x=>x[0]==="not"&&x[1]==="sync_connection_id"));
 assert(filters.some(x=>x[0]==="not"&&x[1]==="sync_external_id"));
 assert(filters.some(x=>x[0]==="gte"&&x[2]==="2026-10-22T22:00:00.000Z"));
 assert(filters.some(x=>x[0]==="lt"&&x[2]==="2026-10-23T22:00:00.000Z"));
 assert(c.signal instanceof AbortSignal);
});
test("pagination reads every page in deterministic ID order",async()=>{
 const first=Array.from({length:1000},(_,id)=>({id}));const h=harness([{data:first,error:null},{data:[{id:1000}],error:null}]);
 const snapshot=await h.load(h.db,"member-1");assert.equal(snapshot.rows.length,1001);assert.equal(h.calls.length,2);
 assert.deepEqual(JSON.parse(JSON.stringify(h.calls[1].filters.find(x=>x[0]==="range"))),["range",1000,1999]);
});
test("a failed second page rejects the whole daily read rather than returning a partial result",async()=>{
 const h=harness([{data:Array.from({length:1000},(_,id)=>({id})),error:null},{data:null,error:{message:"offline"}}]);
 await assert.rejects(h.load(h.db,"member-1"),/unavailable/);
});
test("missing authentication or malformed daily data cannot become a zero result",async()=>{
 const h=harness([{data:null,error:null}]);await assert.rejects(h.load(h.db,""),/Authenticated/);assert.equal(h.calls.length,0);
 await assert.rejects(h.load(h.db,"member-1"),/unavailable/);
});
test("the complete-read cap rejects truncation instead of displaying a smaller total",async()=>{
 const page={data:Array.from({length:1000},(_,id)=>({id})),error:null};const h=harness(Array(20).fill(page));
 await assert.rejects(h.load(h.db,"member-1"),/complete-read limit/);assert.equal(h.calls.length,20);
});
