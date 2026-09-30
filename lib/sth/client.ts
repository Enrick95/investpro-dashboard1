export type SthStatus={isTradingAccountConnected:boolean;masterAccountsList:{id:string;name:string;userIsSubscribed:boolean;lots:number}[]};
export async function partnerCall(endpoint:string,userId:string,payload:Record<string,unknown>={}):Promise<SthStatus>{
 const licence=process.env.STH_PARTNER_LICENSE;if(!licence)throw Error('NOT_CONFIGURED');
 let response:Response;
 try{response=await fetch(`https://socialtradehubapp.com/Partner/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,UserID:userId,PartnerLicense:licence}),cache:'no-store',signal:AbortSignal.timeout(45000)});}catch{throw Error('UNKNOWN_RESULT');}
 let data:any;try{data=await response.json();}catch{throw Error('UNKNOWN_RESULT');}
 // STH returns HTTP 200 even for business errors. Never relay provider text (may contain credentials).
 if(!response.ok)throw Error('UNKNOWN_RESULT');
 if(typeof data.errorMessage!=='string')throw Error('UNKNOWN_RESULT');
 if(data.errorMessage){
 const e=data.errorMessage.toLowerCase();
 throw Error(e.includes('busy')?'BUSY':e.includes('license')||e.includes('wrong service')?'LICENCE':e.includes('maximum limit')?'CAPACITY':e.includes('server not found')?'SERVER':'PROVIDER_REJECTED');
 }
 if(typeof data.isTradingAccountConnected!=='boolean'||!Array.isArray(data.masterAccountsList))throw Error('UNKNOWN_RESULT');
 const masters=data.masterAccountsList.map((m:any)=>{
 if(typeof m.id!=='string'||typeof m.name!=='string'||typeof m.userIsSubscribed!=='boolean'||!Number.isFinite(Number(m.lots)))throw Error('UNKNOWN_RESULT');
 return {id:m.id,name:m.name,userIsSubscribed:m.userIsSubscribed,lots:Number(m.lots)};
 });
 return {isTradingAccountConnected:data.isTradingAccountConnected,masterAccountsList:masters};
}
export function lotValue(value:unknown){const n=Number(value),max=Number(process.env.STH_MAX_LOTS||'0.10');if(!Number.isFinite(n)||!Number.isFinite(max)||max<=0||n<=0||n>max)throw Error('LOTS');return n;}
