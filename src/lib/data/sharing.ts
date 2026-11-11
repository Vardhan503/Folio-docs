import "server-only";
import { getCurrentUser, getOptionalUser } from "@/lib/auth/session";
import {
  SESSION_EXPIRED_MESSAGE,
  notFound,
  resolveDocumentRole,
} from "@/lib/data/documents";
import {
  failure,
  rejected,
  success,
  type DataResult,
} from "@/lib/data/result";
import { isUuid } from "@/lib/documents/validation";
import { isShareRole, validateEmail, type ShareRole } from "@/lib/sharing/roles";
import { createClient } from "@/lib/supabase/server";
import type { DocumentSummary } from "@/types/document";

export type Collaborator = {
  userId: string;
  email: string | null;
  displayName: string;
  role: ShareRole;
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type ProfileRef = { email: string; display_name: string } | null;

const INVALID_ROLE_MESSAGE = "Choose Viewer or Editor.";
const OWNER_ONLY_MESSAGE = "Only the document owner can manage sharing.";
const SELF_SHARE_MESSAGE = "You already own this document. Enter someone else's email.";
const UNKNOWN_EMAIL_MESSAGE =
  "No Folio account uses that email. Check the address, or ask an administrator to create the account.";
const ALREADY_SHARED_MESSAGE =
  "That person already has access. Change their permission in the list below.";
const NO_LONGER_SHARED_MESSAGE = "That person no longer has access to this document.";
const OWN_ACCESS_MESSAGE = "As the owner, you always keep full access.";

/** Sharing is managed by the owner only; this is the server-side check (RLS checks again). */
async function requireOwner(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
): Promise<DataResult<null>> {
  const access = await resolveDocumentRole(supabase, userId, documentId);
  if (!access.ok) return access;
  return access.data === "owner" ? success(null) : rejected("forbidden", OWNER_ONLY_MESSAGE);
}

function profileName(profile: ProfileRef, fallback: string): string {
  return profile?.display_name?.trim() || profile?.email || fallback;
}

/** Grants a registered user (found by exact email) viewer or editor access. */
export async function shareDocument(
  documentId: unknown,
  recipientEmail: unknown,
  role: unknown,
): Promise<DataResult<{ userId: string }>> {
  const user = await getOptionalUser();
  if (!user) return rejected("unauthenticated", SESSION_EXPIRED_MESSAGE);
  if (!isUuid(documentId)) return notFound();
  if (!isShareRole(role)) return rejected("invalid_input", INVALID_ROLE_MESSAGE);

  const email = validateEmail(recipientEmail);
  if (!email.ok) return rejected("invalid_input", email.error);
  if (user.email && email.value === user.email.toLowerCase()) {
    return rejected("invalid_input", SELF_SHARE_MESSAGE);
  }

  const supabase = await createClient();
  const owner = await requireOwner(supabase, user.id, documentId);
  if (!owner.ok) return owner;

  const { data: recipientId, error: lookupError } = await supabase.rpc(
    "find_share_recipient",
    { p_document_id: documentId, p_email: email.value },
  );
  if (lookupError) {
    if (lookupError.code === "42501") return rejected("forbidden", OWNER_ONLY_MESSAGE);
    return failure("shareDocument.lookup", lookupError, "We couldn't share this document. Please try again.");
  }
  if (!recipientId) return rejected("not_found", UNKNOWN_EMAIL_MESSAGE);
  if (recipientId === user.id) return rejected("invalid_input", SELF_SHARE_MESSAGE);

  const { error } = await supabase
    .from("document_shares")
    .insert({ document_id: documentId, user_id: recipientId, role });

  if (error) {
    if (error.code === "23505") return rejected("conflict", ALREADY_SHARED_MESSAGE);
    if (error.code === "42501") return rejected("forbidden", OWNER_ONLY_MESSAGE);
    return failure("shareDocument", error, "We couldn't share this document. Please try again.");
  }

  return success({ userId: recipientId });
}

/** People the owner has shared a document with, oldest share first. */
export async function listDocumentCollaborators(
  documentId: unknown,
): Promise<DataResult<Collaborator[]>> {
  const user = await getOptionalUser();
  if (!user) return rejected("unauthenticated", SESSION_EXPIRED_MESSAGE);
  if (!isUuid(documentId)) return notFound();

  const supabase = await createClient();
  const owner = await requireOwner(supabase, user.id, documentId);
  if (!owner.ok) return owner;

  const { data, error } = await supabase
    .from("document_shares")
    .select("user_id, role, created_at, profile:profiles(email, display_name)")
    .eq("document_id", documentId)
    .order("created_at", { ascending: true });

  if (error) {
    return failure("listDocumentCollaborators", error, "We couldn't load the people with access.");
  }

  type Row = { user_id: string; role: string; profile: ProfileRef };
  return success(
    (data satisfies Row[])
      .filter((row) => isShareRole(row.role))
      .map((row) => ({
        userId: row.user_id,
        email: row.profile?.email ?? null,
        displayName: profileName(row.profile, "Folio user"),
        role: row.role as ShareRole,
      })),
  );
}

/** Changes a collaborator between viewer and editor. */
export async function updateSharePermission(
  documentId: unknown,
  userId: unknown,
  role: unknown,
): Promise<DataResult<null>> {
  const user = await getOptionalUser();
  if (!user) return rejected("unauthenticated", SESSION_EXPIRED_MESSAGE);
  if (!isUuid(documentId)) return notFound();
  if (!isUuid(userId)) return rejected("invalid_input", NO_LONGER_SHARED_MESSAGE);
  if (!isShareRole(role)) return rejected("invalid_input", INVALID_ROLE_MESSAGE);
  if (userId === user.id) return rejected("invalid_input", OWN_ACCESS_MESSAGE);

  const supabase = await createClient();
  const owner = await requireOwner(supabase, user.id, documentId);
  if (!owner.ok) return owner;

  const { data, error } = await supabase
    .from("document_shares")
    .update({ role })
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();

  if (error) {
    return failure("updateSharePermission", error, "We couldn't change this permission. Please try again.");
  }
  if (!data) return rejected("not_found", NO_LONGER_SHARED_MESSAGE);
  return success(null);
}

/** Removes a collaborator's share. Revoking access that's already gone succeeds. */
export async function revokeDocumentAccess(
  documentId: unknown,
  userId: unknown,
): Promise<DataResult<null>> {
  const user = await getOptionalUser();
  if (!user) return rejected("unauthenticated", SESSION_EXPIRED_MESSAGE);
  if (!isUuid(documentId)) return notFound();
  if (!isUuid(userId)) return rejected("invalid_input", NO_LONGER_SHARED_MESSAGE);
  if (userId === user.id) return rejected("invalid_input", OWN_ACCESS_MESSAGE);

  const supabase = await createClient();
  const owner = await requireOwner(supabase, user.id, documentId);
  if (!owner.ok) return owner;

  const { error } = await supabase
    .from("document_shares")
    .delete()
    .eq("document_id", documentId)
    .eq("user_id", userId);

  if (error) {
    return failure("revokeDocumentAccess", error, "We couldn't remove access. Please try again.");
  }
  return success(null);
}

/** Documents other people have explicitly shared with the signed-in user, most recently edited first. */
export async function listSharedDocuments(): Promise<DataResult<DocumentSummary[]>> {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("document_shares")
    .select(
      // documents and profiles are also linked through document_shares, so name the FK.
      "role, document:documents(id, title, updated_at, owner_id, owner:profiles!owner_id(email, display_name))",
    )
    .eq("user_id", user.id);

  if (error) {
    return failure(
      "listSharedDocuments",
      error,
      "We couldn't load documents shared with you. Refresh the page to try again.",
    );
  }

  type Row = {
    role: string;
    document: {
      id: string;
      title: string;
      updated_at: string;
      owner_id: string;
      owner: ProfileRef;
    } | null;
  };

  return success(
    (data satisfies Row[])
      .flatMap((row): DocumentSummary[] => {
        const document = row.document;
        if (!document || !isShareRole(row.role) || document.owner_id === user.id) return [];
        return [
          {
            id: document.id,
            title: document.title,
            owner: { id: document.owner_id, name: profileName(document.owner, "Another user") },
            lastEditedAt: document.updated_at,
            ownership: "shared",
            role: row.role,
          },
        ];
      })
      .sort((a, b) => b.lastEditedAt.localeCompare(a.lastEditedAt)),
  );
}
