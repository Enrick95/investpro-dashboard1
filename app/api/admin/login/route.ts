import { NextResponse } from "next/server";
export async function POST(){return NextResponse.json({error:"Ancienne authentification administrateur désactivée. Utilisez la session Supabase."},{status:410});}
