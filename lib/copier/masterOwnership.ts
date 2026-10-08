import type { SupabaseClient } from "@supabase/supabase-js";

export async function ownedMasterIds(db: SupabaseClient, userId: string): Promise<Set<string>> {
  const { data, error } = await db.from("copier_master_ownership")
    .select("provider_master_id").eq("user_id", userId);
  if (error) throw new Error("MASTER_OWNERSHIP_UNAVAILABLE");
  return new Set((data || []).map((row) => String(row.provider_master_id)));
}

export async function assertOwnedMasters(db: SupabaseClient, userId: string, ids: string[]) {
  const owned = await ownedMasterIds(db, userId);
  if (ids.some((id) => !owned.has(id))) throw new Error("MASTER_NOT_OWNED");
}
