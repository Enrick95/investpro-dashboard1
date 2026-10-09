import {NextResponse} from "next/server";
import {authenticateAdmin} from "@/lib/admin/permissions";
export async function GET(request:Request){const result=await authenticateAdmin(request);if("error" in result)return NextResponse.json({error:result.error},{status:result.status});return NextResponse.json({owner:result.access.owner,permissions:result.access.permissions});}
