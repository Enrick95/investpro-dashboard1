export type AdminUser = {
  id: string;
  avatarUrl?: string;
  username: string;
  email: string;
  role: "USER" | "MOD" | "ADMIN";
  plan: "FREE" | "MENSUEL" | "ANNUEL" | "VIP";
  subscribedUntil?: number; // ms
  createdAt: number; // ms
  lastActiveAt: number; // ms
};

export type FlaggedComment = {
  id: string;
  byUser: string;
  byAvatar?: string;
  content: string;
  reason: "spam" | "insulte" | "harcèlement" | "fake" | "autre";
  page: string;
  createdAt: number;
};

export const mockUsers: AdminUser[] = [
  {
    id: "u1",
    username: "Tethrax",
    email: "admin@investpro.local",
    role: "ADMIN",
    plan: "VIP",
    subscribedUntil: Date.now() + 120 * 24 * 3600 * 1000,
    createdAt: Date.now() - 90 * 24 * 3600 * 1000,
    lastActiveAt: Date.now() - 2 * 60 * 1000,
    avatarUrl: "/logo.png",
  },
  {
    id: "u2",
    username: "Nobara",
    email: "nobara@gmail.com",
    role: "MOD",
    plan: "MENSUEL",
    subscribedUntil: Date.now() + 10 * 24 * 3600 * 1000,
    createdAt: Date.now() - 25 * 24 * 3600 * 1000,
    lastActiveAt: Date.now() - 17 * 60 * 1000,
  },
  {
    id: "u3",
    username: "Megumi",
    email: "megumi@gmail.com",
    role: "USER",
    plan: "FREE",
    createdAt: Date.now() - 5 * 24 * 3600 * 1000,
    lastActiveAt: Date.now() - 5 * 3600 * 1000,
  },
];

export const mockFlagged: FlaggedComment[] = [
  {
    id: "c1",
    byUser: "User_Alpha",
    content: "C'est un scam !",
    reason: "fake",
    page: "/dashboard/classement/user_alpha",
    createdAt: Date.now() - 50 * 60 * 1000,
  },
  {
    id: "c2",
    byUser: "User_Beta",
    content: "Insulte gratuite…",
    reason: "insulte",
    page: "/dashboard/profil",
    createdAt: Date.now() - 3 * 3600 * 1000,
  },
];

export type CountryStat = { code: string; label: string; visitors: number; newUsers: number; avgSessionMin: number };

export const mockCountries: CountryStat[] = [
  { code: "FR", label: "France", visitors: 44123, newUsers: 1340, avgSessionMin: 3.2 },
  { code: "JP", label: "Japan", visitors: 38765, newUsers: 990, avgSessionMin: 3.9 },
  { code: "IN", label: "India", visitors: 27112, newUsers: 2011, avgSessionMin: 2.4 },
  { code: "MX", label: "Mexico", visitors: 19002, newUsers: 640, avgSessionMin: 2.8 },
  { code: "EG", label: "Egypt", visitors: 13220, newUsers: 510, avgSessionMin: 3.1 },
  { code: "GF", label: "Guyane (FR)", visitors: 820, newUsers: 40, avgSessionMin: 2.2 },
  { code: "RE", label: "Réunion (FR)", visitors: 910, newUsers: 61, avgSessionMin: 2.5 },
];

export type MiniSeriesPoint = { t: string; v: number };

export function mockSeries(): MiniSeriesPoint[] {
  const base = 40000;
  return Array.from({ length: 14 }).map((_, i) => {
    const v = base + Math.round((Math.sin(i / 2) * 12000 + (Math.random() - 0.5) * 8000));
    return { t: `J-${13 - i}`, v: Math.max(12000, v) };
  });
}
