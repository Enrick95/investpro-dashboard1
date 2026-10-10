import { createClient } from "@supabase/supabase-js";
export async function notifySupportReply(userId:string, ticketId:string, title:string){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return;
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user}}=await admin.auth.admin.getUserById(userId);
 const apiKey=process.env.RESEND_API_KEY,from=process.env.INVESTPRO_SUPPORT_FROM_EMAIL;
 if(apiKey&&from&&user?.email){
  try {const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[user.email],subject:"InvestPro : nouvelle réponse du support",text:`Bonjour,\n\nNotre équipe a répondu à votre conversation « ${title} ».\nConnectez-vous à InvestPro pour consulter la réponse : https://investprotrading.fr/dashboard\n\nL’équipe InvestPro Trading`})});if(!r.ok)console.error("[support/mail] delivery failed",r.status)}catch{console.error("[support/mail] network failed")}
 }

}
