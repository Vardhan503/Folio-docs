"use server";

import type { DataResult } from "@/lib/data/result";
import {
  listDocumentCollaborators,
  revokeDocumentAccess,
  shareDocument,
  updateSharePermission,
  type Collaborator,
} from "@/lib/data/sharing";

/** After a successful change, `collaborators` is the fresh list, or null if it couldn't be reloaded. */
export type SharingChangeResult = DataResult<{ collaborators: Collaborator[] | null }>;

async function withCollaborators(
  documentId: string,
  change: DataResult<unknown>,
): Promise<SharingChangeResult> {
  if (!change.ok) return change;
  const list = await listDocumentCollaborators(documentId);
  return { ok: true, data: { collaborators: list.ok ? list.data : null } };
}

export async function listCollaboratorsAction(documentId: string) {
  return listDocumentCollaborators(documentId);
}

export async function shareDocumentAction(
  documentId: string,
  email: string,
  role: string,
): Promise<SharingChangeResult> {
  return withCollaborators(documentId, await shareDocument(documentId, email, role));
}

export async function updateSharePermissionAction(
  documentId: string,
  userId: string,
  role: string,
): Promise<SharingChangeResult> {
  return withCollaborators(documentId, await updateSharePermission(documentId, userId, role));
}

export async function revokeDocumentAccessAction(
  documentId: string,
  userId: string,
): Promise<SharingChangeResult> {
  return withCollaborators(documentId, await revokeDocumentAccess(documentId, userId));
}
