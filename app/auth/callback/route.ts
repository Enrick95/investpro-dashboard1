import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth-next-path";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNextPath(requestUrl.searchParams.get("next"));

  function loginError(reason: string) {
    const url = new URL("/login", requestUrl.origin);
    url.searchParams.set("error", reason);
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  if (!code) {
    return loginError("oauth_missing_code");
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("InvestPro OAuth callback error:", error.message);

    return loginError("oauth_exchange_failed");
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
