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
  validateDocumentContent,
  validateTitle,
  type TiptapDocument,
} from "@/lib/documents/validation";
import {
  copyTitle,
  documentToMarkdown,
  documentToPlainText,
  exportFilename,
} from "@/lib/documents/export";
import { EXPORT_FORMATS, isExportFormat } from "@/lib/documents/export-formats";
import { prepareImport } from "@/lib/import/prepare-import";
import {
  canCopyOrExport,
  canDelete,
  canEdit,
  isShareRole,
  type DocumentRole,
} from "@/lib/sharing/roles";
import type { DocumentRow } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import type { DocumentSummary } from "@/types/document";

export type EditableDocument = Pick<
  DocumentRow,
  "id" | "title" | "content" | "updated_at"
> & { role: DocumentRole };

export type SavedDocument = Pick<DocumentRow, "id" | "updated_at">;

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const NOT_FOUND_MESSAGE =
  "This document doesn't exist or you don't have access to it.";
export const SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Sign in again in a new tab, then retry.";
const VIEW_ONLY_MESSAGE =
  "You have view-only access to this document, so changes can't be saved.";

export function notFound<T>(): DataResult<T> {
  return rejected("not_found", NOT_FOUND_MESSAGE);
}

type AccessRow = {
  owner_id: string;
  document_shares?: { role: string; user_id: string }[] | null;
};

/** Owner via owner_id, otherwise the caller's own share (the query only embeds that one). */
function roleFromAccessRow(row: AccessRow, userId: string): DocumentRole | null {
  if (row.owner_id === userId) return "owner";
  const share = row.document_shares?.find((candidate) => candidate.user_id === userId);
  return share && isShareRole(share.role) ? share.role : null;
}

/**
 * The caller's role on a document, read through RLS: documents the caller
 * can't see resolve to not_found, whether they exist or not.
 */
export async function resolveDocumentRole(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
): Promise<DataResult<DocumentRole>> {
  const { data, error } = await supabase
    .from("documents")
    .select("owner_id, document_shares(role, user_id)")
    .eq("id", documentId)
    .eq("document_shares.user_id", userId)
    .maybeSingle();

  if (error) {
    return failure(
      "resolveDocumentRole",
      error,
      "We couldn't check your access to this document. Please try again.",
    );
  }
  const role = data ? roleFromAccessRow(data satisfies AccessRow, userId) : null;
  return role ? success(role) : notFound();
}

/** Server-side edit check that runs before every write; RLS checks again on the write. */
async function requireEditAccess(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
): Promise<DataResult<DocumentRole>> {
  const access = await resolveDocumentRole(supabase, userId, documentId);
  if (access.ok && !canEdit(access.data)) return rejected("forbidden", VIEW_ONLY_MESSAGE);
  return access;
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

/**
 * Creates a document from an uploaded .txt or .md file. The file is validated
 * and converted before the single insert; the raw file is never stored.
 */
export async function importDocument(file: unknown): Promise<DataResult<{ id: string }>> {
  const user = await getOptionalUser();
  if (!user) return rejected("unauthenticated", SESSION_EXPIRED_MESSAGE);

  const prepared = await prepareImport(file);
  if (!prepared.ok) return rejected("invalid_input", prepared.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .insert({
      owner_id: user.id,
      title: prepared.value.title,
      content: prepared.value.content,
    })
    .select("id")
    .single();

  if (error) {
    return failure(
      "importDocument",
      error,
      "We couldn't import this file. Please try again.",
    );
  }

  return success({ id: data.id });
}

/**
 * Loads a document the signed-in user owns or has been shared, with their role.
 * RLS decides visibility; missing and inaccessible documents look the same.
 */
export async function getDocumentById(
  documentId: string,
): Promise<DataResult<EditableDocument>> {
  const user = await getCurrentUser();
  if (!isUuid(documentId)) return notFound();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, content, updated_at, owner_id, document_shares(role, user_id)")
    .eq("id", documentId)
    .eq("document_shares.user_id", user.id)
    .maybeSingle();

  if (error) {
    return failure(
      "getDocumentById",
      error,
      "We couldn't load this document. Refresh the page to try again.",
    );
  }
  const role = data ? roleFromAccessRow(data satisfies AccessRow, user.id) : null;
  if (!data || !role) return notFound();

  return success({
    id: data.id,
    title: data.title,
    content: data.content,
    updated_at: data.updated_at,
    role,
  });
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
  const access = await requireEditAccess(supabase, user.id, documentId);
  if (!access.ok) return access;

  const { data, error } = await supabase
    .from("documents")
    .update({ title: validated.value })
    .eq("id", documentId)
    .select("id, title, updated_at")
    .maybeSingle();

  if (error) {
    return failure("updateDocumentTitle", error, "We couldn't rename this document.");
  }
  if (!data) return notFound();

  return success(data);
}

/** The last saved title and content, for callers whose role passes `allowed`. */
async function readDocumentFor(
  documentId: unknown,
  allowed: (role: DocumentRole) => boolean,
  forbiddenMessage: string,
): Promise<
  DataResult<{
    supabase: SupabaseClient;
    userId: string;
    title: string;
    content: TiptapDocument;
  }>
> {
  const user = await getOptionalUser();
  if (!user) return rejected("unauthenticated", SESSION_EXPIRED_MESSAGE);
  if (!isUuid(documentId)) return notFound();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("title, content, owner_id, document_shares(role, user_id)")
    .eq("id", documentId)
    .eq("document_shares.user_id", user.id)
    .maybeSingle();

  if (error) {
    return failure(
      "readDocumentFor",
      error,
      "We couldn't load this document. Please try again.",
    );
  }
  const role = data ? roleFromAccessRow(data satisfies AccessRow, user.id) : null;
  if (!data || !role) return notFound();
  if (!allowed(role)) return rejected("forbidden", forbiddenMessage);

  const content = validateDocumentContent(data.content);
  if (!content.ok) return rejected("invalid_input", content.error);

  return success({ supabase, userId: user.id, title: data.title, content: content.value });
}

/**
 * Copies the last saved title and content into a new document owned by the
 * caller. Shares are not copied.
 */
export async function duplicateDocument(
  documentId: unknown,
): Promise<DataResult<{ id: string; title: string }>> {
  const source = await readDocumentFor(
    documentId,
    canCopyOrExport,
    "You have view-only access, so you can't make a copy of this document.",
  );
  if (!source.ok) return source;

  const { supabase, userId, title, content } = source.data;
  const { data, error } = await supabase
    .from("documents")
    .insert({ owner_id: userId, title: copyTitle(title), content })
    .select("id, title")
    .single();

  if (error) {
    return failure("duplicateDocument", error, "We couldn't copy this document. Please try again.");
  }
  return success(data);
}

export type ExportedDocument = { filename: string; mimeType: string; text: string };

/** The last saved version as .txt or .md, built from the stored JSON. */
export async function exportDocument(
  documentId: unknown,
  format: unknown,
): Promise<DataResult<ExportedDocument>> {
  if (!isExportFormat(format)) return rejected("invalid_input", "Choose .txt or .md.");

  const source = await readDocumentFor(
    documentId,
    canCopyOrExport,
    "You have view-only access, so you can't download this document.",
  );
  if (!source.ok) return source;

  const { title, content } = source.data;
  return success({
    filename: exportFilename(title, format),
    mimeType: EXPORT_FORMATS[format].mimeType,
    text: format === "md" ? documentToMarkdown(content) : documentToPlainText(content),
  });
}

/**
 * Permanently deletes a document the caller owns; its shares go with it
 * (`on delete cascade`). RLS allows only owners to delete.
 */
export async function deleteDocument(documentId: unknown): Promise<DataResult<{ id: string }>> {
  const user = await getOptionalUser();
  if (!user) return rejected("unauthenticated", SESSION_EXPIRED_MESSAGE);
  if (!isUuid(documentId)) return notFound();

  const supabase = await createClient();
  const access = await resolveDocumentRole(supabase, user.id, documentId);
  if (!access.ok) return access;
  if (!canDelete(access.data)) {
    return rejected("forbidden", "Only the owner can delete this document.");
  }

  const { data, error } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return failure("deleteDocument", error, "We couldn't delete this document. Please try again.");
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
  const access = await requireEditAccess(supabase, user.id, documentId);
  if (!access.ok) return access;

  const { data, error } = await supabase
    .from("documents")
    .update({ content: validated.value })
    .eq("id", documentId)
    .select("id, updated_at")
    .maybeSingle();

  if (error) {
    return failure("updateDocumentContent", error, "We couldn't save your changes.");
  }
  if (!data) return notFound();

  return success(data);
}
