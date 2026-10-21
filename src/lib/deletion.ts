import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Both operations use RLS. FK cascades and the clip-delete trigger run atomically.
export async function deleteOwnedRow(client: SupabaseClient<Database>, table: "videos" | "clips", id: string) {
  const { data, error } = await client.from(table).delete().eq("id", id).select("id").single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("This item is no longer available.");
}