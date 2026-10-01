// Deterministic signal calculations. No trading execution or market-price inference.
export type Signal = {asset:string;side:'BUY'|'SELL';entry:number;sl:number;targets:number[]};
export type Parsed = {kind:'signal';signal:Signal}|{kind:'tp';target:number}|{kind:'sl'}|{kind:'be'}|{kind:'cancel'}|{kind:'ignore'}|{kind:'review';reason:string};
export type Event = {message_id:number;date:number;reply_to:number|null;parsed:Parsed;received_at?:string};
export type Trade = Signal & {id:number;date:string;status:'pending'|'win'|'loss'|'be'|'cancelled'|'review';target:number;r:number|null};
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
export function parseMessage(text:string):Parsed {
 const s=norm(text), num='(\\d+(?:[.,]\\d+)?)', n=(x:string)=>Number(x.replace(',','.'));
 if(/\b(ACTIF|ENTREE)\s*:/.test(s)){
  const asset=s.match(/ACTIF\s*:\s*([A-Z0-9/.]+)/)?.[1];
  const side=s.match(/DIRECTION\s*:\s*(BUY|SELL)\b/)?.[1] as Signal['side']|undefined;
  const zone=s.match(new RegExp('ENTREE\\s*:\\s*'+num+'(?:\\s*[-–—]\\s*'+num+')?'));
  const stop=s.match(new RegExp('(?:STOP\\s*LOSS|SL)\\s*:\\s*'+num));
  const targets:number[]=[];let invalid=false;
  for(const m of s.matchAll(new RegExp('TP\\s*(\\d+)\\s*:\\s*'+num,'g'))){const i=Number(m[1])-1;if(i<0||i>19||targets[i]!==undefined){invalid=true;break;}targets[i]=n(m[2]);}
  if(!asset||!side||!zone||!stop||!targets.length||invalid)return {kind:'review',reason:'Signal incomplet ou TP dupliqué.'};
  const lo=Math.min(n(zone[1]),n(zone[2]??zone[1])),hi=Math.max(n(zone[1]),n(zone[2]??zone[1])),entry=(lo+hi)/2,sl=n(stop[1]),sign=side==='BUY'?1:-1;
  if(![lo,hi,entry,sl].every(x=>Number.isFinite(x)&&x>0)||(side==='BUY'?sl>=lo:sl<=hi)||Array.from({length:targets.length},(_,i)=>targets[i]).some((p,i)=>!Number.isFinite(p)||p<=0||(p-(side==='BUY'?hi:lo))*sign<=0||(i>0&&(p-targets[i-1])*sign<=0)))return {kind:'review',reason:'Zone, stop ou ordre des TP incohérents.'};
  return {kind:'signal',signal:{asset,side,entry,sl,targets}};
 }
 // Require an explicit order cancellation; bare ANNULÉ still ignores a mistaken message.
 const cancelText=s.replace(/[’‘]/g,"'").replace(/[^A-Z0-9'\s-]/g,' ').trim().replace(/\s+/g,' ');
 const order="(?:(?:L[' ]|LE |UN |MON |NOTRE )?)(?:ORDRE|ORDER)(?:[ -]+LIMIT(?:E)?)?";
 const cancelled="ANNUL(?:E|ER|EZ|EE)";
 if(!s.includes('?')&&new RegExp('^(?:'+order+' '+cancelled+'|(?:ON |JE )?'+cancelled+' '+order+')(?: SVP)?$').test(cancelText))return {kind:'cancel'};
 // A stop moved to entry is not a closed break-even trade.
 const beWord='(?:BE|BREAK[\\s-]*EVEN)';
 if(new RegExp('^\\s*(?:STOP|SL)\\s+(?:(?:MIS|PLACE|DEPLACE)\\s+)?(?:A|AU)\\s+'+beWord+'[.!\\s]*$').test(s))return {kind:'ignore'};
 const be=new RegExp('^\\s*(?:[A-Z0-9/.]+\\s+)?(?:'+beWord+'(?:\\s+TOUCH(?:ER|E|EE|ES|EES))?|(?:TRADE\\s+)?(?:CLOTURE|SORTIE?|FERME)\\s+(?:A|AU|EN)\\s+'+beWord+')[.!\\s]*$').test(s);
 if(be&&!/\b(PAS|NON|SI|PRESQUE|BIENTOT|PEUT|DEVRAIT)\b/.test(s))return {kind:'be'};
 const tp=[...s.matchAll(/\bTP\s*(\d+)\s+TOUCH(?:ER|E|EE|ES|EES)\b/g)].map(m=>Number(m[1]));
 const sl=/\bSTOP\s*LOSS\s+TOUCH(?:ER|E|EE|ES)\b/.test(s)||/^\W*SL\W*$/.test(s);
 const relevant=/\b(TP\s*\d+|STOP\s*LOSS|SL|BREAK[\s-]*EVEN|BE)\b/.test(s);
 if(!relevant)return {kind:'ignore'};
 if(/\b(PAS|NON|SI|PRESQUE|BIENTOT|ANNUL|PEUT|DEVRAIT)\b/.test(s)||s.includes('?')||(tp.length||sl)&&/\b(BE|BREAK[\s-]*EVEN)\b/.test(s)||tp.length&&sl)return {kind:'review',reason:'Annonce ambiguë.'};
 if(tp.length)return {kind:'tp',target:Math.max(...tp)};
 if(sl)return {kind:'sl'};
 return {kind:'review',reason:'Résultat non reconnu : vérifier le message.'};
}
export function buildStats(events:Event[]){
 const ordered=[...events].sort((a,b)=>a.date-b.date||a.message_id-b.message_id), byId=new Map(ordered.map(e=>[e.message_id,e])),trades=new Map<number,Trade>();
 const issues:{message:number;reason:string}[]=[];
 const uncertain=new Set<number>();
 for(const e of ordered)if(e.parsed.kind==='signal')trades.set(e.message_id,{...e.parsed.signal,id:e.message_id,date:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(e.date*1000)),status:'pending',target:0,r:null});
 const root=(e:Event)=>{let id=e.reply_to;const seen=new Set<number>();while(id!==null&&!seen.has(id)){seen.add(id);if(trades.has(id))return id;id=byId.get(id)?.reply_to??null;}return null;};
 for(const e of ordered){const p=e.parsed;if(p.kind==='signal'||p.kind==='ignore')continue;const id=root(e),t=id===null?undefined:trades.get(id);
  if(p.kind==='review'||!t){issues.push({message:e.message_id,reason:p.kind==='review'?p.reason:'Réponse sans signal connu : répondre au message d’origine.'});if(t)uncertain.add(t.id);continue;}
  if(t.status==='review')continue;
  if(p.kind==='cancel'){
   if(t.status==='win'||t.status==='loss'||t.status==='be'){
    issues.push({message:e.message_id,reason:'Annulation refusée : ce signal possède déjà un résultat TP, SL ou BE.'});continue;
   }
   t.status='cancelled';t.r=null;t.target=0;continue;
  }
  if(t.status==='cancelled'){
   t.status='review';t.r=null;
   issues.push({message:e.message_id,reason:'Résultat reçu après annulation de cet ordre : vérifier les messages.'});continue;
  }
  if(p.kind==='tp'){
   if(!t.targets[p.target-1]||(t.status==='loss'||t.status==='be')){t.status='review';t.r=null;issues.push({message:e.message_id,reason:'TP inconnu ou contradictoire avec un SL.'});continue;}
   t.target=Math.max(t.target,p.target);t.status='win';t.r=Math.abs(t.targets[t.target-1]-t.entry)/Math.abs(t.entry-t.sl);
  }else if(p.kind==='sl'){
   if(t.status==='win'||t.status==='be'){t.status='review';t.r=null;issues.push({message:e.message_id,reason:'SL contradictoire avec un TP sur le même signal.'});continue;}
   t.status='loss';t.r=-1;
  }else if(p.kind==='be'){
   if(t.status==='win'||t.status==='loss'){t.status='review';t.r=null;issues.push({message:e.message_id,reason:'BE contradictoire avec un TP ou SL sur le même signal.'});continue;}
   t.status='be';t.r=0;
  }
 }
 // An unrecognized comment cannot erase an explicit outcome. Actual conflicting
 // outcomes above still block the trade and require correction.
 for(const id of uncertain){const t=trades.get(id)!;if(t.status==='pending')t.status='review';}
 return {trades:[...trades.values()],issues};
}
