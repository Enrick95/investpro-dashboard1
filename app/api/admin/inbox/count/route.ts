import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/admin/permissions";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

function checkedCount(result: { count: number | null; error: unknown }) {
  if (result.error || !Number.isSafeInteger(result.count) || result.count === null || result.count < 0) {
    throw new Error("Inbox count unavailable");
  }
  return result.count;
}

export async function GET(request: Request) {
  try {
    const auth = await authenticateAdmin(request, "inbox");
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
    }

    // Count pending work without loading ticket content or customer profiles.
    const [support, bugs, deletions] = await Promise.all([
      auth.admin.from("support_tickets").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
      auth.admin.from("bug_reports").select("id", { count: "exact", head: true }).in("status", ["open", "investigating"]),
      auth.admin.from("account_deletion_requests").select("id", { count: "exact", head: true }).in("status", ["pending", "processing"]),
    ]);
    const open_support = checkedCount(support);
    const open_bugs = checkedCount(bugs);
    const pending_deletions = checkedCount(deletions);
    const total = checkedCount({ count: open_support + open_bugs + pending_deletions, error: null });

    return NextResponse.json({ open_support, open_bugs, pending_deletions, total }, { headers });
  } catch {
    return NextResponse.json(
      { error: "Le compteur des demandes est momentanément indisponible." },
      { status: 503, headers },
    );
  }
}
