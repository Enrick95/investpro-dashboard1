export type ReportedComment = {
  id: string;
  username: string;
  reason: string;
  text: string;
  createdAt: number;
  status: "open" | "removed" | "ignored";
};

const KEY = "ip_moderation_v1";

export function loadReports(): ReportedComment[] {
  if (typeof window === "undefined") return [];
  return JSON.parse(localStorage.getItem(KEY) || "[]");
}

export function saveReports(v: ReportedComment[]) {
  localStorage.setItem(KEY, JSON.stringify(v));
}
a