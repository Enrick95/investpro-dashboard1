import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { LOCALE_KEY, resolveLocale } from "./locale";

/** Request-local language selection. Reading it intentionally makes personalized pages dynamic. */
export const getRequestLocale = cache(async () => {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  return resolveLocale(cookieStore.get(LOCALE_KEY)?.value, requestHeaders.get("accept-language"));
});
