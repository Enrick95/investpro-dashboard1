export type Locale = "fr" | "en";
export const LOCALE_KEY = "ip_locale";

export function isLocale(value: unknown): value is Locale {
  return value === "fr" || value === "en";
}

/** Explicit choice wins; unsupported languages never become routes or HTML attributes. */
export function resolveLocale(explicit: unknown, preferred: readonly string[] | string | null | undefined): Locale {
  if (isLocale(explicit)) return explicit;
  const languages = typeof preferred === "string"
    ? preferred.split(",").map((part, order) => {
      const [tag, ...parameters] = part.trim().split(";");
      const quality = parameters.find(value => value.trim().startsWith("q="));
      const q = quality ? Number(quality.trim().slice(2)) : 1;
      return { tag, q: Number.isFinite(q) && q >= 0 && q <= 1 ? q : 0, order };
    }).filter(item => item.q > 0).sort((a, b) => b.q - a.q || a.order - b.order).map(item => item.tag)
    : preferred || [];
  for (const language of languages) {
    const base = language.trim().toLowerCase().split(/[-_]/)[0];
    if (isLocale(base)) return base;
  }
  return "fr";
}

export function translateMessage(locale: Locale, message: string, messages: Readonly<Record<string, string>>, context?: string): string {
  if (locale === "fr" || !message) return message;
  if (context && Object.hasOwn(messages, `${context}:${message}`)) return messages[`${context}:${message}`];
  if (Object.hasOwn(messages, message)) return messages[message];
  const normalized = message.trim().replace(/\s+/g, " ");
  if (!Object.hasOwn(messages, normalized)) return message;
  const leading = message.match(/^\s*/)?.[0] || "";
  const trailing = message.match(/\s*$/)?.[0] || "";
  return leading + messages[normalized] + trailing;
}
