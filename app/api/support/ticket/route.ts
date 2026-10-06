import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

async function getUser(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return {
      response: NextResponse.json(
        { error: "Configuration Supabase incomplète." },
        { status: 500 }
      ),
    };
  }

  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!token) {
    return {
      response: NextResponse.json({ error: "Non authentifié." }, { status: 401 }),
    };
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return {
      response: NextResponse.json({ error: "Session invalide." }, { status: 401 }),
    };
  }

  return { user, supabase };
}

export async function GET(request: Request) {
  const verified = await getUser(request);
  if ("response" in verified && verified.response) return verified.response;

  const { user, supabase } = verified as any;

  const { data, error } = await supabase
    .from("support_tickets")
    .select("id,subject,message,status,admin_reply,created_at,updated_at,answered_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    return NextResponse.json(
      { error: "Le module support n’est pas encore initialisé." },
      { status: 500 }
    );
  }

  return NextResponse.json({ tickets: data || [] });
}

export async function POST(request: Request) {
  const verified = await getUser(request);
  if ("response" in verified && verified.response) return verified.response;

  const { user, supabase } = verified as any;

  const body = await request.json();
  const subject = String(body?.subject || "").trim();
  const message = String(body?.message || "").trim();

  if (subject.length < 3 || subject.length > 160) {
    return NextResponse.json(
      { error: "Le sujet doit contenir entre 3 et 160 caractères." },
      { status: 400 }
    );
  }

  if (message.length < 10 || message.length > 8000) {
    return NextResponse.json(
      { error: "Le message doit contenir entre 10 et 8 000 caractères." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("support_tickets")
    .insert({
      user_id: user.id,
      subject,
      message,
      status: "open",
    })
    .select("id,subject,message,status,created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Impossible d’enregistrer ta demande de support." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, ticket: data });
}
