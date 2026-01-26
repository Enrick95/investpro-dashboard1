type User = {
  username: string;
  tag?: string;

  avatarDataUrl?: string;
  bio?: string;

  showOnLeaderboard?: boolean;
  profitUsd?: number;
};

const KEY_USER = "investpro_user_v2";
const KEY_SIDEBAR = "investpro_sidebar_v1";
const KEY_LEADERBOARD = "investpro_leaderboard_v1";

/** MODE PRO: comments store only URLs (no base64) */
const KEY_COMMENTS = "investpro_comments_v4";

/* =========================
   User / UI
========================= */
export function loadUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY_USER);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveUser(user: User | null) {
  if (typeof window === "undefined") return;
  if (!user) localStorage.removeItem(KEY_USER);
  else localStorage.setItem(KEY_USER, JSON.stringify(user));
}

export function loadSidebarExpanded(): boolean {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(KEY_SIDEBAR);
  return raw === "1";
}

export function saveSidebarExpanded(v: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_SIDEBAR, v ? "1" : "0");
}

/* =========================
   Leaderboard
========================= */
export function loadLeaderboard(): User[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY_LEADERBOARD);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveLeaderboard(users: User[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_LEADERBOARD, JSON.stringify(users));
}

export function upsertLeaderboardUser(user: User) {
  const list = loadLeaderboard();
  const idx = list.findIndex((u) => u.username.toLowerCase() === user.username.toLowerCase());
  if (idx >= 0) list[idx] = { ...list[idx], ...user };
  else list.push(user);
  saveLeaderboard(list);
}

/* =========================
   Comments (PRO)
========================= */
export type PublicCommentAttachment = {
  kind: "image" | "video" | "audio";
  name: string;
  mime: string;
  url: string; // ✅ URL served from /public/uploads/...
};

export type Reactions = Record<string, string[]>;
// ex: { "👍": ["frayse"], "🔥": ["john"] }

export type PublicComment = {
  id: string;
  toUsername: string;
  fromUsername: string;
  text: string;
  createdAt: number;

  fromAvatarDataUrl?: string;

  attachments?: PublicCommentAttachment[];
  reactions?: Reactions;
};

export function loadComments(): PublicComment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY_COMMENTS);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveComments(all: PublicComment[]) {
  try {
    localStorage.setItem(KEY_COMMENTS, JSON.stringify(all));
  } catch {
    alert("Stockage local plein ⚠️ Supprime des anciens commentaires.");
  }
}

export function addComment(c: PublicComment) {
  const all = loadComments();
  all.unshift({ ...c, reactions: c.reactions ?? {} });
  saveComments(all);
}

export function commentsFor(username: string) {
  return loadComments().filter((c) => c.toUsername.toLowerCase() === username.toLowerCase());
}

export function toggleReaction(commentId: string, emoji: string, username: string) {
  const all = loadComments();
  const idx = all.findIndex((c) => c.id === commentId);
  if (idx < 0) return;

  const c = all[idx];
  const reactions: Reactions = { ...(c.reactions ?? {}) };
  const set = new Set(reactions[emoji] ?? []);

  if (set.has(username)) set.delete(username);
  else set.add(username);

  reactions[emoji] = Array.from(set);
  all[idx] = { ...c, reactions };
  saveComments(all);
}

export function deleteComment(commentId: string) {
  const all = loadComments().filter((c) => c.id !== commentId);
  saveComments(all);
}
