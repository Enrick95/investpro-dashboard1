import { NextResponse } from "next/server";
import { requireUser } from "@/lib/brokers/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { user, supabase } = await requireUser(request);
    const { data, error } = await supabase
      .from("broker_connections")
      .select("status,updated_at,metadata")
      .eq("user_id", user.id)
      .eq("provider", "ctrader")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ ok: true, configured: Boolean(process.env.CTRADER_CLIENT_ID && process.env.CTRADER_CLIENT_SECRET && process.env.CTRADER_REDIRECT_URI), connection: data || null });
  } catch (error: any) {
    if (String(error?.message) === "UNAUTHORIZED") return NextResponse.json({ ok: false, error: "Session InvestPro expirée." }, { status: 401 });
    return NextResponse.json({ ok: false, error: String(error?.message || "Erreur cTrader.") }, { status: 400 });
  }
}
