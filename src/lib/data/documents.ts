import "server-only";
import { getCurrentUser, getOptionalUser } from "@/lib/auth/session";
import {
  failure,
  rejected,
  success,
  type DataResult,
} from "@/lib/data/result";
import {
  DEFAULT_DOCUMENT_TITLE,
  createEmptyDocument,
  isUuid,
  parseDocumentContent,
  validateTitle,
} from "@/lib/documents/validation";
import type { DocumentRow } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import type { DocumentSummary } from "@/types/document";

export type EditableDocument = Pick<
  DocumentRow,
  "id" | "title" | "content" | "updated_at"
>;

export type SavedDocument = Pick<DocumentRow, "id" | "updated_at">;

const NOT_FOUND_MESSAGE =
  "This document doesn't exist or you don't have access to it.";
const SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Sign in again in a new tab, then retry.";

function notFound<T>(): DataResult<T> {
  return rejected("not_found", NOT_FOUND_MESSAGE);
}

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

  return success(
    data.map((row) => ({
      id: row.id,
      title: row.title,
      owner: { id: row.owner_id, name: ownerName },
      lastEditedAt: row.updated_at,
      ownership: "owned",
    })),
  );
}

/** Creates an empty document owned by the signed-in user. */
export async function createDocument(): Promise<DataResult<{ id: string }>> {
  const user = await getOptionalUser();
  if (!user) return rejected("unauthenticated", SESSION_EXPIRED_MESSAGE);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .insert({
      owner_id: user.id,
      title: DEFAULT_DOCUMENT_TITLE,
      content: createEmptyDocument(),
    })
    .select("id")
    .single();

  if (error) {
    return failure(
      "createDocument",
      error,
      "We couldn't create a document. Please try again.",
    );
  }

  return success({ id: data.id });
}

/** Loads a document the signed-in user owns. Missing and inaccessible documents look the same. */
export async function getDocumentById(
  documentId: string,
): Promise<DataResult<EditableDocument>> {
  const user = await getCurrentUser();
  if (!isUuid(documentId)) return notFound();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, content, updated_at")
    .eq("id", documentId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) {
    return failure(
      "getDocumentById",
      error,
      "We couldn't load this document. Refresh the page to try again.",
    );
  }
  if (!data) return notFound();

  return success(data);
}

export async function updateDocumentTitle(
  documentId: unknown,
  title: unknown,
): Promise<DataResult<SavedDocument & { title: string }>> {
  const user = await getOptionalUser();
  if (!user) return rejected("unauthenticated", SESSION_EXPIRED_MESSAGE);
  if (!isUuid(documentId)) return notFound();

  const validated = validateTitle(title);
  if (!validated.ok) return rejected("invalid_input", validated.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .update({ title: validated.value })
    .eq("id", documentId)
    .eq("owner_id", user.id)
    .select("id, title, updated_at")
    .maybeSingle();

  if (error) {
    return failure("updateDocumentTitle", error, "We couldn't rename this document.");
  }
  if (!data) return notFound();

  return success(data);
}

/** Saves editor content sent as a JSON string (see `saveDocumentContentAction`). */
export async function updateDocumentContent(
  documentId: unknown,
  serializedContent: unknown,
): Promise<DataResult<SavedDocument>> {
  const user = await getOptionalUser();
  if (!user) return rejected("unauthenticated", SESSION_EXPIRED_MESSAGE);
  if (!isUuid(documentId)) return notFound();

  const validated = parseDocumentContent(serializedContent);
  if (!validated.ok) return rejected("invalid_input", validated.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .update({ content: validated.value })
    .eq("id", documentId)
    .eq("owner_id", user.id)
    .select("id, updated_at")
    .maybeSingle();

  if (error) {
    return failure("updateDocumentContent", error, "We couldn't save your changes.");
  }
  if (!data) return notFound();

  return success(data);
}
