export type PublicComment = {
  id: string;
  profile: string;  // username du profil
  author: string;   // username du commentateur
  message: string;
  at: string;       // ISO
};

const KEY = "investpro_comments_v1";

export function loadComments(): PublicComment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveComments(list: PublicComment[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function addComment(c: PublicComment) {
  const list = loadComments();
  list.unshift(c);
  saveComments(list);
  return list;
}
