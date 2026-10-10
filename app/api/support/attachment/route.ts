import { uploadSupportImage } from "@/lib/support-attachment";
export const dynamic="force-dynamic";
export async function POST(req:Request){return uploadSupportImage(req,false);}
