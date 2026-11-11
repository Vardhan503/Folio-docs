"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createDocument,
  deleteDocument,
  duplicateDocument,
  exportDocument,
  importDocument,
  updateDocumentContent,
  updateDocumentTitle,
} from "@/lib/data/documents";

export type CreateDocumentState = { error: string | null };

export async function createDocumentAction(): Promise<CreateDocumentState> {
  const result = await createDocument();
  if (!result.ok) {
    return { error: result.error };
  }
  redirect(`/documents/${result.data.id}`);
}

export type ImportDocumentState = { error: string | null };

export async function importDocumentAction(
  _previous: ImportDocumentState,
  formData: FormData,
): Promise<ImportDocumentState> {
  const result = await importDocument(formData.get("file"));
  if (!result.ok) {
    return { error: result.error };
  }
  redirect(`/documents/${result.data.id}`);
}

export async function duplicateDocumentAction(documentId: string) {
  const result = await duplicateDocument(documentId);
  if (result.ok) revalidatePath("/");
  return result;
}

export async function exportDocumentAction(documentId: string, format: string) {
  return exportDocument(documentId, format);
}

export async function deleteDocumentAction(documentId: string) {
  const result = await deleteDocument(documentId);
  // Also drops pages kept in the client cache, so Back can't show the deleted document.
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function saveDocumentTitleAction(documentId: string, title: string) {
  return updateDocumentTitle(documentId, title);
}

/**
 * Takes the editor JSON as a string: ProseMirror builds attribute objects with a
 * null prototype, which React would send to the server as opaque references.
 */
export async function saveDocumentContentAction(
  documentId: string,
  serializedContent: string,
) {
  return updateDocumentContent(documentId, serializedContent);
}
