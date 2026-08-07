export type AdminMail = {
  id: string;
  createdAt: number;
  from: string;
  subject: string;
  body: string;
  status: "open" | "answered" | "closed";
  replyDraft?: string;
};

const KEY = "ip_admin_inbox_v1";

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

function seed(): AdminMail[] {
  const now = Date.now();
  return [
    {
      id: "m1",
      createdAt: now - 2 * 3600e3,
      from: "bug@user.com",
      subject: "Bug terminal",
      body: "Quand je clique sur Modifier, ça ne marche pas.",
      status: "open",
    },
    {
      id: "m2",
      createdAt: now - 1 * 864e5,
      from: "support@user.com",
      subject: "Demande abonnement",
      body: "Je veux passer Premium, comment faire ?",
      status: "open",
    },
  ];
}

export function loadAdminInbox(): AdminMail[] {
  if (typeof window === "undefined") return [];
  const d = safeParse<AdminMail[]>(localStorage.getItem(KEY));
  if (d && d.length) return d;
  const s = seed();
  localStorage.setItem(KEY, JSON.stringify(s));
  return s;
}

export function saveAdminInbox(list: AdminMail[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function updateMail(id: string, patch: Partial<AdminMail>) {
  const list = loadAdminInbox().map((m) => (m.id === id ? { ...m, ...patch } : m));
  saveAdminInbox(list);
}
