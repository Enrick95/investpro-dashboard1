import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class ClipApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const SESSION_KEY = "investpro-clip-auth";
let authClient: SupabaseClient | null = null;

/** Session propre à l'espace clippeurs : elle ne se mélange pas avec celle du reste du site. */
export function clipAuth(): SupabaseClient {
  if (!authClient) {
    authClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { storageKey: SESSION_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return authClient;
}

export async function clipToken(): Promise<string | null> {
  const { data } = await clipAuth().auth.getSession();
  return data.session?.access_token ?? null;
}

export async function clipSignIn(email: string, password: string): Promise<void> {
  const { error } = await clipAuth().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (!error) return;
  const status = error.status ?? 400;
  if (error.code === "invalid_credentials" || /invalid login credentials/i.test(error.message)) throw new ClipApiError("E-mail ou mot de passe incorrect.", status);
  if (error.code === "email_not_confirmed") throw new ClipApiError("Ce compte n'est pas encore activé.", status);
  if (status === 429) throw new ClipApiError("Trop d'essais : patiente quelques minutes avant de réessayer.", status);
  throw new ClipApiError("Connexion impossible pour le moment, réessaie.", status);
}

/** Déconnecte seulement cet appareil, sans toucher aux autres sessions du compte. */
export async function clipSignOut(): Promise<void> {
  await clipAuth().auth.signOut({ scope: "local" });
}

/** Appel aux routes /api/clip avec la session de l'espace clippeurs. */
export async function clipApi<T>(path: string, init?: { method?: "GET" | "POST" | "PATCH"; body?: unknown; auth?: boolean }): Promise<T> {
  const token = init?.auth === false ? null : await clipToken();
  if (init?.auth !== false && !token) throw new ClipApiError("Connecte-toi pour continuer.", 401);
  const hasBody = init?.body !== undefined;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (hasBody) headers["Content-Type"] = "application/json";
  const response = await fetch(path, {
    method: init?.method ?? "GET",
    headers,
    body: hasBody ? JSON.stringify(init?.body) : undefined,
    cache: "no-store",
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof (payload as { error: unknown }).error === "string"
        ? (payload as { error: string }).error
        : "Une erreur est survenue, réessaie.";
    throw new ClipApiError(message, response.status);
  }
  return payload as T;
}
