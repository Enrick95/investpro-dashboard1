import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/admin/permissions";
export async function GET(request:Request){const result=await authenticateAdmin(request);return NextResponse.json({ok:true,isAdmin:!("error" in result),permissions:"error" in result?[]:result.access.permissions,owner:"error" in result?false:result.access.owner});}
