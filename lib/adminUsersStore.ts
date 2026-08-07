export type AdminUser = {
  id: string;
  username: string;
  email?: string;
  plan: "Free" | "Premium" | "VIP";
  daysLeft: number;
  role: "user" | "mod" | "admin";
  avatarMediaId?: string | number;
  avatarDataUrl?: string;
  createdAt: number;
  lastActiveAt: number;
};

const KEY = "ip_admin_users_v1";

export function loadAdminUsers(): AdminUser[] {
  if (typeof window === "undefined") return [];
  return JSON.parse(localStorage.getItem(KEY) || "[]");
}

export function saveAdminUsers(users: AdminUser[]) {
  localStorage.setItem(KEY, JSON.stringify(users));
}
