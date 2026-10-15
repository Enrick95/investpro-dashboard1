"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isLocale, LOCALE_KEY, resolveLocale, translateMessage, type Locale } from "@/lib/i18n/locale";
import { messages } from "@/lib/i18n/messages";

type LocaleContextValue = { locale: Locale; setLocale: (locale: Locale) => void; t: (message: string, context?: string) => string };
const LocaleContext = createContext<LocaleContextValue>({ locale: "fr", setLocale: () => {}, t: message => message });

function persistLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_KEY}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax;${location.protocol === "https:" ? " Secure;" : ""}`;
}

function explicitBrowserLocale(): Locale | null {
  const cookie = document.cookie.split(";").map(part => part.trim()).find(part => part.startsWith(LOCALE_KEY + "="))?.slice(LOCALE_KEY.length + 1);
  if (isLocale(cookie)) return cookie;
  try { const stored = localStorage.getItem(LOCALE_KEY); return isLocale(stored) ? stored : null; } catch { return null; }
}

export default function LocaleProvider({ initialLocale, children, detectBrowser = false }: { initialLocale: Locale; children: ReactNode; detectBrowser?: boolean }) {
  const [locale, updateLocale] = useState<Locale>(initialLocale);
  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    updateLocale(next);
    persistLocaleCookie(next);
    try { localStorage.setItem(LOCALE_KEY, next); } catch { /* The current page still works when storage is unavailable. */ }
    window.dispatchEvent(new CustomEvent("investpro:locale", { detail: next }));
  }, []);

  useEffect(() => {
    const synchronize = () => {
      const next = explicitBrowserLocale() ?? (detectBrowser ? resolveLocale(null, navigator.languages) : null);
      if (next) {
        updateLocale(next);
        // Restore a saved explicit choice for subsequent server-rendered pages too.
        if (explicitBrowserLocale()) persistLocaleCookie(next);
      }
    };
    // Synchronize explicit choices made on the standalone Enrick95 page or another tab.
    synchronize();
    window.addEventListener("storage", synchronize);
    window.addEventListener("investpro:locale", synchronize);
    return () => { window.removeEventListener("storage", synchronize); window.removeEventListener("investpro:locale", synchronize); };
  }, [detectBrowser]);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const t = useCallback((message: string, context?: string) => translateMessage(locale, message, messages, context), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() { return useContext(LocaleContext); }
