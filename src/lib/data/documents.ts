import "server-only";
import { getCurrentUser } from "@/lib/auth/session";
import { failure, type DataResult } from "@/lib/data/result";
import { createClient } from "@/lib/supabase/server";
import type { DocumentSummary } from "@/types/document";

/** Lists documents owned by the signed-in user, most recently edited first. */
export async function listOwnedDocuments(
  ownerName: string,
): Promise<DataResult<DocumentSummary[]>> {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .select("id, title, owner_id, updated_at")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return failure(
      "listOwnedDocuments",
      error,
      "We couldn't load your documents. Refresh the page to try again.",
    );
  }

  return {
    ok: true,
    data: data.map((row) => ({
      id: row.id,
      title: row.title,
      owner: { id: row.owner_id, name: ownerName },
      lastEditedAt: row.updated_at,
      ownership: "owned",
    })),
  };
}
