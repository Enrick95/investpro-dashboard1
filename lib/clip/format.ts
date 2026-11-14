/** Formats d'affichage des maquettes (dates courtes, nombres compacts, masques). */

const DAY = 86_400_000;

function at(isoDate: string): Date {
  return new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
}

function capitalize(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

/** « Lun. 16 nov. » */
export function shortDay(isoDate: string): string {
  const date = at(isoDate);
  const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" }).format(date).replace(/\.$/, "");
  const month = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" }).format(date);
  return `${capitalize(weekday)}. ${ordinal(date.getUTCDate())} ${month}`;
}

/** « Lundi 16 novembre » */
export function longDay(isoDate: string): string {
  const date = at(isoDate);
  const text = new Intl.DateTimeFormat("fr-FR", { weekday: "long", month: "long", timeZone: "UTC" }).formatToParts(date);
  const weekday = text.find((part) => part.type === "weekday")?.value ?? "";
  const month = text.find((part) => part.type === "month")?.value ?? "";
  return `${capitalize(weekday)} ${ordinal(date.getUTCDate())} ${month}`;
}

/** « 16 nov. » ou « 1er nov. » */
export function dayMonth(isoDate: string): string {
  const date = at(isoDate);
  return `${ordinal(date.getUTCDate())} ${new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" }).format(date)}`;
}

/** « novembre » */
export function monthName(isoDate: string): string {
  return new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "UTC" }).format(at(isoDate));
}

export function ordinal(day: number): string {
  return day === 1 ? "1er" : String(day);
}

/** « Du 1er au 30 nov. » ou « Du 28 oct. au 5 nov. » */
export function dateRange(start: string, end: string): string {
  const a = at(start);
  const b = at(end);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  return sameMonth ? `Du ${ordinal(a.getUTCDate())} au ${dayMonth(end)}` : `Du ${dayMonth(start)} au ${dayMonth(end)}`;
}

/** « 4,1 % », « 0,6 % », « 12 % » */
export function percent(value: number): string {
  const rounded = value >= 9.95 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${String(rounded).replace(".", ",")}\u00a0%`;
}

/** « 4,82 M », « 312 k », « 12,4 k », « 980 » */
export function compact(value: number): string {
  const n = Math.max(0, Math.round(value));
  const decimals = (x: number, digits: number) => x.toFixed(digits).replace(/\.?0+$/, "").replace(".", ",");
  if (n >= 1_000_000) return `${decimals(n / 1_000_000, n >= 10_000_000 ? 1 : 2)} M`;
  if (n >= 100_000) return `${Math.round(n / 1000)} k`;
  if (n >= 1000) return `${decimals(n / 1000, 1)} k`;
  return String(n);
}

/** « il y a 2 h », « hier », « il y a 3 j » */
export function ago(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 2) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);
  if (days <= 1) return "hier";
  return `il y a ${days} j`;
}

/** « +33 6 •• •• 52 10 » */
export function maskPhone(phone: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.length < 8) return phone;
  const tail = digits.slice(-4);
  return `${digits.slice(0, 3)} ${digits.slice(3, 4)} •• •• ${tail.slice(0, 2)} ${tail.slice(2)}`;
}

/** « TQ7x…k9Fd » */
export function maskDetails(details: string | null): string {
  if (!details) return "";
  const value = details.trim();
  return value.length > 14 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
}

export function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "C";
}

export function firstNameOf(name: string): string {
  return name.split(/\s+/).filter(Boolean)[0] ?? name;
}

export function plural(count: number, word: string, pluralWord?: string): string {
  return `${count} ${count > 1 ? (pluralWord ?? `${word}s`) : word}`;
}

/** Pourcentage arrondi entre 0 et 100. */
export function pct(part: number, total: number): number {
  return total > 0 ? Math.max(0, Math.min(100, Math.round((part / total) * 100))) : 0;
}

/** « 9e » / « 1er » pour un classement. */
export function rankLabel(position: number): string {
  return position === 1 ? "1er" : `${position}e`;
}
