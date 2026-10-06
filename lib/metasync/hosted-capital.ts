import {validateSnapshot} from './payload';
export function validateHostedSnapshot(input:unknown){
 const snapshot=validateSnapshot(input);
 const raw=(input as Record<string,unknown>).funding;
 if(raw===undefined)return snapshot;
 if(!raw||typeof raw!=='object')throw Error('funding');
 const v=raw as Record<string,unknown>;
 const money=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<1e12;
 if(!money(v.inflows)||!money(v.outflows)||!money(v.reference_balance)||!['first_deposit','first_sync_balance'].includes(String(v.reference_method)))throw Error('funding');
 if(v.reference_method==='first_deposit'&&(!(Number(v.reference_balance)>0)||Number(v.reference_balance)>Number(v.inflows)))throw Error('funding');
 if(v.reference_method==='first_sync_balance'&&Math.abs(Number(v.reference_balance)-Math.max(0,snapshot.balance))>0.000001)throw Error('funding');
 return {...snapshot,funding:{inflows:v.inflows,outflows:v.outflows,reference_balance:v.reference_balance,reference_method:v.reference_method}};
}
