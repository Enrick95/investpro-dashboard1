import ts from 'typescript';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const js=ts.transpile(fs.readFileSync('lib/telegram/engine.ts','utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
const {parseMessage,buildStats}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const signal='🎯 #SIGNAL\n🟡 Actif : GOLD\nDirection : BUY\n📍 Entrée : 4257.4 - 4252.97\nStop Loss : 4244.26\nTP1 : 4271\nTP2 : 4284\nTP3 : 4300';
const p=parseMessage(signal);assert.equal(p.kind,'signal');assert.equal(p.signal.entry,4255.1849999999995);
const ev=(id,text,reply=null)=>({message_id:id,date:1790546400+id,reply_to:reply,parsed:parseMessage(text)});
const base=ev(1,signal);let out=buildStats([base,ev(2,'TP1 TOUCHER',1),ev(3,'GOLD TP2 TOUCHER +320 PIPS',1)]);assert.equal(out.trades.length,1);assert.equal(out.trades[0].target,2);assert.ok(Math.abs(out.trades[0].r-2.6375286)<1e-5);
assert.equal(buildStats([base,ev(2,'TP3 touché',1),ev(3,'TP1 TOUCHER',1)]).trades[0].target,3);
assert.equal(buildStats([base,ev(2,'SL',1)]).trades[0].r,-1);
assert.equal(buildStats([base,ev(2,'Stop loss touché',1)]).trades[0].status,'loss');
assert.equal(buildStats([base,ev(2,'TP1 TOUCHER',1),ev(3,'TP2 TOUCHER',2)]).trades[0].target,2);
assert.equal(buildStats([base,ev(2,'TP1 TOUCHER',1),ev(3,'Stop loss touché',1)]).trades[0].status,'review');
assert.equal(buildStats([base,ev(2,'TP9 TOUCHER',1)]).trades[0].status,'review');
assert.equal(buildStats([base,ev(2,'TP1 TOUCHER')]).trades[0].status,'pending');
assert.equal(parseMessage('TP1 pas touché').kind,'review');assert.equal(parseMessage('Si TP1 touché').kind,'review');assert.equal(parseMessage('TP1 touché ?').kind,'review');
assert.equal(parseMessage('Bonjour tout le monde').kind,'ignore');assert.equal(parseMessage('ANNULÉ').kind,'ignore');
const sell=signal.replace('BUY','SELL').replace('4257.4 - 4252.97','4275 - 4276').replace('4244.26','4310').replace('4271','4270').replace('4284','4260').replace('4300','4250');assert.equal(parseMessage(sell).kind,'signal');
assert.equal(parseMessage(signal.replace('TP2 : 4284','TP2 : 4250')).kind,'review');assert.equal(parseMessage(signal.replace('TP2 : 4284','TP1 : 4284')).kind,'review');
assert.equal(parseMessage(signal.replace('TP2 : 4284','')).kind,'review');
const corrected=buildStats([base,ev(2,'ANNULÉ',1),ev(3,'Stop loss touché',1)]);assert.equal(corrected.trades[0].r,-1);
assert.equal(buildStats([ev(2,'TP2 TOUCHER',1),base]).trades[0].target,2);
assert.equal(buildStats([base,ev(2,'TP2 TOUCHER',1),ev(3,'TP2 TOUCHER',1)]).trades[0].r,out.trades[0].r);
assert.equal(buildStats([{...base,date:Date.parse('2026-09-30T22:30:00Z')/1000}]).trades[0].date,'2026-10-01');
console.log('Telegram : 23 assertions réussies (signaux, TP/SL, corrections, doublons, ordre et fuseau).');
let writes=[],scheduled=[],mirrored=[],delivered=0,mirrorOutcome='created';
let mirror=async(db,post)=>{assert.equal(db,fakeDb);mirrored.push(post);return mirrorOutcome;};
const fakeDb={rpc:async(name,args)=>{writes.push({name,args});return {error:null};}};
const modules={
 '@/lib/telegram/server':{database:()=>fakeDb,channel:()=>'-1001234567890',telegram:async()=>({})},
 '@/lib/telegram/engine':{parseMessage},
 '@/lib/stripe/vip-payments':{recordStripeChannelJoin:async()=>false},
 '@/lib/vip/membership-server':{vipDatabase:()=>fakeDb},
 '@/lib/telegram/vip-daily':{relaunchMember:async()=>'none'},
 'next/server':{after:task=>{scheduled.push(task);}},
 '@/lib/vip/telegram-import':{mirrorTelegramPost:(db,post)=>mirror(db,post)},
 '@/lib/vip/notifications':{deliverVipNotifications:async db=>{assert.equal(db,fakeDb);delivered++;return {sent:1};}},
};
globalThis.__telegramTest=modules;
let route=ts.transpile(fs.readFileSync('app/api/telegram/webhook/route.ts','utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
// Every project import is replaced by its stand-in; Node's own modules load as usual.
route=route.replace(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/g,(line,names,spec)=>{
 if(spec.startsWith('node:'))return line;
 if(!(spec in modules))throw Error('Import sans remplaçant : '+spec);
 return `const {${names.replace(/\s+as\s+/g,':')}}=globalThis.__telegramTest[${JSON.stringify(spec)}];`;
});
const {POST}=await import('data:text/javascript;base64,'+Buffer.from(route).toString('base64'));
process.env.TELEGRAM_WEBHOOK_SECRET='a'.repeat(64);
const request=(payload,secret='a'.repeat(64))=>new Request('https://example.test/api/telegram/webhook',{method:'POST',headers:{'x-telegram-bot-api-secret-token':secret},body:JSON.stringify(payload)});
const payload={update_id:1,channel_post:{message_id:1,date:1790546400,chat:{id:-1001234567890,type:'channel'},text:signal}};
assert.equal((await POST(request(payload,'wrong'))).status,401);assert.equal(writes.length,0);
assert.equal((await POST(request({...payload,channel_post:{...payload.channel_post,chat:{id:-1009999999999,type:'channel'}}}))).status,200);assert.equal(writes.length,0);
assert.equal((await POST(request(payload))).status,200);assert.equal(writes.length,1);assert.equal(writes[0].args.p_parsed.kind,'signal');
// The signal also goes to the VIP space once Telegram has its answer, then members are alerted.
assert.equal(scheduled.length,1);assert.equal(mirrored.length,0);
await scheduled[0]();
assert.equal(mirrored.length,1);assert.equal(delivered,1);
assert.equal(mirrored[0].chatId,'-1001234567890');assert.equal(mirrored[0].messageId,1);assert.equal(mirrored[0].revision,1790546400);assert.equal(mirrored[0].date,1790546400);
assert.equal(mirrored[0].replyTo,null);assert.equal(mirrored[0].text,signal);assert.equal(mirrored[0].parsed.kind,'signal');assert.equal(mirrored[0].edited,false);
mirrorOutcome='updated';
assert.equal((await POST(request({...payload,update_id:2,channel_post:undefined,edited_channel_post:{...payload.channel_post,edit_date:1790546500,text:signal.replace('4271','4272')}}))).status,200);assert.equal(writes[1].args.p_revision,1790546500);
await scheduled[1]();
assert.equal(mirrored[1].edited,true);assert.equal(mirrored[1].revision,1790546500);assert.equal(delivered,1);
const reply={update_id:3,channel_post:{message_id:2,date:1790546600,chat:{id:-1001234567890,type:'channel'},text:'TP1 TOUCHER',reply_to_message:{message_id:1,chat:{id:-1001234567890,type:'channel'}}}};
mirrorOutcome='created';
assert.equal((await POST(request(reply))).status,200);await scheduled[2]();
assert.equal(mirrored[2].replyTo,1);assert.equal(mirrored[2].parsed.kind,'tp');assert.equal(delivered,2);
assert.equal((await POST(request({update_id:4,channel_post:{...payload.channel_post,message_id:3,forward_origin:{type:'channel'}}}))).status,200);assert.equal(scheduled.length,3);
mirror=async()=>{throw Error('database unavailable');};
assert.equal((await POST(request({...payload,update_id:5}))).status,200);
const errors=[],log=console.error;console.error=message=>errors.push(message);
try{await scheduled[3]();}finally{console.error=log;}
assert.deepEqual(errors,['VIP_TELEGRAM_IMPORT_FAILED']);assert.equal(delivered,2);
fakeDb.rpc=async()=>({error:{message:'database unavailable'}});assert.equal((await POST(request(payload))).status,503);assert.equal(scheduled.length,4);
console.log('Webhook : rejet des secrets invalides, filtrage canal, réception, édition, reprise après erreur et envoi vers l’espace VIP vérifiés.');
