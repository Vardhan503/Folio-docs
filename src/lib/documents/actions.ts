"use server";

import { redirect } from "next/navigation";
import {
  createDocument,
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
