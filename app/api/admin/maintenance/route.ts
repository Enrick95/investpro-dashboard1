import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/admin/permissions";
export async function POST(request: Request){
 const access=await authenticateAdmin(request,"system");
 if("error" in access)return NextResponse.json({error:access.error},{status:access.status});
 const body=await request.json().catch(()=>({}));
 if(!["terminal","copieur"].includes(body?.target)||typeof body?.enabled!=="boolean")return NextResponse.json({error:"Requête invalide"},{status:400});
 const name=body.target==="terminal"?"ip_maint_terminal":"ip_maint_copier";
 const response=NextResponse.json({ok:true});
 response.cookies.set(name,body.enabled?"1":"0",{path:"/",httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production"});
 return response;
}
