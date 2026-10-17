export const VIP_CHAT_PAGE_SIZE = 40;
export const VIP_CHAT_MAX_CHARACTERS = 2000;
export const VIP_CHAT_MAX_BODY_BYTES = 9000;

export type VipChatMessage = {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  own: boolean;
  adminAuthor: boolean;
};

export function isVipChatUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** Display text only: never an identity or permission source, and never an email fallback. */
export function vipChatPublicName(value: unknown): string {
  if (typeof value !== "string" || value.includes("@")) return "Membre InvestPro";
  const name = value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
  return Array.from(name).slice(0, 60).join("") || "Membre InvestPro";
}

export function vipChatText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (!text || Array.from(text).length > VIP_CHAT_MAX_CHARACTERS || /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(text)) return null;
  return text;
}
