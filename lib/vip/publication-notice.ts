/** Shared wording for phone alerts and the authenticated notification feed. */
export type VipNoticePost = {
  id?: string;
  category: string;
  title: string;
  body: string;
  symbol?: string | null;
  direction?: string | null;
  levels?: Record<string, unknown> | null;
};

export function publicationPostId(eventKey: string, userId: string): string | null {
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const match = new RegExp(`^vip:post:(${uuid}):(${uuid})$`, "i").exec(eventKey);
  return match && match[2].toLowerCase() === userId.toLowerCase() ? match[1] : null;
}

function plain(value: string): string {
  return value.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "").replace(/[*_`#]/g, "")
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ").trim();
}

function excerpt(value: string, limit: number): string {
  if (value.length <= limit) return value;
  // Do not split a surrogate pair. Shorten prose at a word boundary where possible.
  const cut = value.slice(0, limit - 1).replace(/[\uD800-\uDBFF]$/, "");
  const word = cut.lastIndexOf(" ");
  return (word > limit / 2 ? cut.slice(0, word) : cut).trimEnd() + "…";
}

const titles: Record<string, string> = {
  signal: "Nouveau signal", analysis: "Nouvelle analyse", performance: "Nouveau bilan publié",
  followup: "Mise à jour du suivi", partnership: "Nouveau partenariat",
};
const defaultTitles = new Set([
  "nouveau signal", "mon analyse graphique", "le bilan de la session", "mise a jour du scenario", "nouveau partenariat",
  "new signal", "my chart analysis", "session recap", "scenario update", "new partnership",
]);
const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Template labels, normalised (no accents, lower case), each naming the field it fills. */
const signalAliases: Record<string, string> = {
  actif: "asset", asset: "asset", symbole: "asset", symbol: "asset", instrument: "asset",
  direction: "direction", sens: "direction", ordre: "direction", order: "direction",
  entree: "entry", entry: "entry", "zone d'entree": "entry", "zone d’entrée": "entry",
  "stop loss": "sl", stoploss: "sl", sl: "sl", tp1: "tp1", "tp 1": "tp1",
  tp2: "tp2", "tp 2": "tp2", tp3: "tp3", "tp 3": "tp3",
};

/** A template line reads "Label : value"; the label is what decides which field it is. */
const signalLine = /^[^\p{L}\p{N}]*([\p{L}\p{N} '’]+?)\s*[:：]\s*(.*)$/u;

/** Read only explicit template labels; never infer an order from commentary or a price. */
function signalFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of body.split(/\r?\n/)) {
    const match = plain(line).match(signalLine);
    if (!match) continue;
    const key = signalAliases[normalize(match[1].trim())];
    const value = match[2].trim();
    if (!key) continue;
    const actual = !value || /^(?:[-–—…._]+|n\/?a|a renseigner|to fill|\[[^\]]*\])$/i.test(normalize(value)) ? "" : value;
    // Duplicate conflicting labels are ambiguous: do not silently pick an order or a level.
    if (key in fields && fields[key] !== actual) fields[key] = "";
    else if (!(key in fields)) fields[key] = actual;
  }
  return fields;
}

function signalOrder(fields: Record<string, string>, fallback?: string | null) {
  const label = (Object.hasOwn(fields, "direction") ? fields.direction : plain(fallback || "")).toUpperCase();
  const match = /^(BUY|SELL|ACHAT|VENTE)(?:\s+(?:LIMIT|STOP(?:\s+LIMIT)?))?$/.exec(label);
  const side = match ? (match[1] === "BUY" || match[1] === "ACHAT" ? "buy" : "sell") : null;
  return { label, side } as { label: string; side: "buy" | "sell" | null };
}

/** Only explicit orders get a direction colour; empty/conflicting text overrides legacy metadata. */
export function vipSignalOrder(post: VipNoticePost) {
  return post.category === "signal" ? signalOrder(signalFields(post.body || ""), post.direction) : null;
}

/** The lines of a signal that are not template fields: the team’s own update or comment, kept as written. */
export function signalFreeText(body: string): string {
  return body.split(/\r?\n/)
    .filter(line => {
      const match = plain(line).match(signalLine);
      return !(match && signalAliases[normalize(match[1].trim())]);
    })
    .map(line => line.trim())
    .filter(Boolean)
    .join("\n");
}

/** The take-profit 3 written in the signal template (`TP3 : 2 350`), when it reads as a price. */
export function signalTakeProfit3(body: string): number | null {
  const value = signalFields(body).tp3;
  if (!value) return null;
  const price = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(price) && price > 0 ? price : null;
}

export function formatVipPublicationNotice(post: VipNoticePost): { title: string; body: string } {
  const heading = titles[post.category] || "Nouvelle publication VIP";
  const customTitle = plain(post.title || "");
  const usefulTitle = defaultTitles.has(normalize(customTitle)) ? "" : customTitle;
  if (post.category === "signal") {
    const fields = signalFields(post.body || "");
    // Visible text takes priority over legacy structured metadata preserved by the editor.
    const field = (key: string, fallback = "") => Object.hasOwn(fields, key) ? fields[key] : fallback;
    const asset = field("asset", plain(post.symbol || ""));
    const order = signalOrder(fields, post.direction);
    const direction = order.label;
    const levels = post.levels || {};
    const numeric = (key: string) => typeof levels[key] === "number" && Number.isFinite(levels[key]) && (levels[key] as number) > 0 ? String(levels[key]) : "";
    const parts = [
      direction && `${order.side === "buy" ? "🟢 " : order.side === "sell" ? "🔴 " : ""}${direction}`,
      field("entry", numeric("entry")) && `Entrée : ${field("entry", numeric("entry"))}`,
      field("sl", numeric("stopLoss")) && `SL : ${field("sl", numeric("stopLoss"))}`,
      field("tp1", numeric("takeProfit")) && `TP1 : ${field("tp1", numeric("takeProfit"))}`,
      field("tp2", numeric("takeProfit2")) && `TP2 : ${field("tp2", numeric("takeProfit2"))}`,
      fields.tp3 && `TP3 : ${fields.tp3}`,
    ].filter((part): part is string => Boolean(part));
    const included: string[] = [];
    for (const part of parts) {
      // Keep complete values: a truncated trading level could be mistaken for another price.
      if ([...included, part].join(" · ").length <= 239) included.push(part);
    }
    const freeText = Object.keys(fields).length ? "" : plain(post.body || "");
    const body = included.length ? included.join(" · ") : excerpt(freeText || usefulTitle || "Consultez le signal dans votre espace VIP.", 239);
    return { title: asset ? `${heading} · ${excerpt(asset, 60)}` : heading, body };
  }
  const message = plain(post.body || "");
  const detail = usefulTitle && normalize(usefulTitle) !== normalize(heading) ? usefulTitle : "";
  const body = detail && message && !message.toLowerCase().startsWith(detail.toLowerCase())
    ? `${detail} — ${message}` : message || detail;
  return { title: heading, body: excerpt(body || "À découvrir dans votre espace VIP.", 239) };
}

const telegramIcons: Record<string, string> = { signal: "🚨", analysis: "📊", performance: "📈", followup: "🔄", partnership: "🤝" };
export const VIP_SPACE_URL = "https://investprotrading.fr/dashboard/vip";

function customPostTitle(post: VipNoticePost): string {
  const title = plain(post.title || "");
  return defaultTitles.has(normalize(title)) ? "" : title;
}

function clipText(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 1) return "";
  return value.slice(0, max - 1).replace(/[\uD800-\uDBFF]$/, "").trimEnd() + "…";
}

/** Texte de la copie Telegram : titre, texte complet (ou niveaux d’un signal), lien vers l’espace VIP. Jamais plus de `limit` caractères. */
export function formatVipTelegramCopy(post: VipNoticePost, limit = 4000): string {
  const notice = formatVipPublicationNotice(post);
  const body = (post.body || "").trim();
  const isSignal = post.category === "signal";
  const explicit = isSignal && Object.keys(signalFields(body)).length > 0;
  const heading = `${telegramIcons[post.category] ?? "📣"} ${notice.title}`;
  const extraTitle = isSignal ? "" : customPostTitle(post);
  const top = extraTitle ? `${heading}\n${extraTitle}` : heading;
  // Texte libre sans champs : on ajoute les niveaux structurés, sauf s'ils figurent déjà dans le texte.
  const levels = isSignal && !explicit && notice.body && !body.includes(notice.body.replace(/…$/, "")) ? notice.body : "";
  const footer = `Espace VIP : ${VIP_SPACE_URL}`;
  const room = limit - [top, levels, footer].filter(Boolean).join("\n\n").length - 2;
  const main = body ? clipText(body, room) : "";
  return [top, levels, main, footer].filter(Boolean).join("\n\n");
}
