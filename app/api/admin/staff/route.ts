import {NextResponse} from "next/server";
import {authenticateAdmin,PERMISSIONS,isOwner} from "@/lib/admin/permissions";
export async function GET(request:Request){
 const auth=await authenticateAdmin(request,"staff");if("error" in auth)return NextResponse.json({error:auth.error},{status:auth.status});
 const {data,error}=await auth.admin.from("admin_staff_permissions").select("user_id,permissions,enabled,updated_at").order("updated_at",{ascending:false});
 if(error)return NextResponse.json({error:"Migration staff manquante ou impossible à lire"},{status:503});
 return NextResponse.json({items:data||[]});
}
export async function POST(request:Request){
 const auth=await authenticateAdmin(request,"staff");if("error" in auth)return NextResponse.json({error:auth.error},{status:auth.status});
 const body=await request.json().catch(()=>({})); const userId=String(body?.user_id||"");
 if(!/^[0-9a-f-]{36}$/i.test(userId)||isOwner(userId))return NextResponse.json({error:"Identifiant invalide ou propriétaire protégé"},{status:400});
 const {data:target,error:targetError}=await auth.admin.auth.admin.getUserById(userId);
 if(targetError||!target?.user)return NextResponse.json({error:"Utilisateur introuvable"},{status:404});
 const permissions=Array.isArray(body.permissions)?[...new Set(body.permissions.filter((x:unknown):x is string=>typeof x==="string" && (PERMISSIONS as readonly string[]).includes(x)))]:[];
 if(permissions.length!==body.permissions?.length)return NextResponse.json({error:"Permission non reconnue"},{status:400});
 const enabled=body.enabled===true;
 const {error}=await auth.admin.from("admin_staff_permissions").upsert({user_id:userId,permissions,enabled,updated_at:new Date().toISOString(),updated_by:auth.user.id});
 if(error)return NextResponse.json({error:"Enregistrement impossible"},{status:503});
 await auth.admin.from("admin_staff_audit").insert({actor_id:auth.user.id,target_user_id:userId,action:enabled?"permissions_updated":"access_revoked",permissions});
 return NextResponse.json({ok:true});
}
