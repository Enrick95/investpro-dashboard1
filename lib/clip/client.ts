import { createClient } from "@/lib/supabase/client";

export class ClipApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function clipToken(): Promise<string | null> {
  const { data } = await createClient().auth.getSession();
  return data.session?.access_token ?? null;
}

/** Appel aux routes /api/clip avec la session Supabase du navigateur. */
export async function clipApi<T>(path: string, init?: { method?: "GET" | "POST" | "PATCH"; body?: unknown }): Promise<T> {
  const token = await clipToken();
  if (!token) throw new ClipApiError("Connecte-toi pour continuer.", 401);
  const hasBody = init?.body !== undefined;
  const response = await fetch(path, {
    method: init?.method ?? "GET",
    headers: hasBody ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { Authorization: `Bearer ${token}` },
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

export async function clipSignOut(): Promise<void> {
  await createClient().auth.signOut();
}
