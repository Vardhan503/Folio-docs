import type { DocumentShareRole } from "@/lib/supabase/database.types";
import type { ValidationResult } from "@/lib/documents/validation";

/** Access a user has to a document: owners via `owner_id`, others via a share. */
export type DocumentRole = "owner" | DocumentShareRole;
export type ShareRole = DocumentShareRole;

export const SHARE_ROLES: readonly ShareRole[] = ["viewer", "editor"];

export const ROLE_LABELS: Record<DocumentRole, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

export function isShareRole(value: unknown): value is ShareRole {
  return value === "viewer" || value === "editor";
}

export function canEdit(role: DocumentRole): boolean {
  return role === "owner" || role === "editor";
}

const MAX_EMAIL_LENGTH = 320;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trims and lower-cases an email address; profiles store emails lower-cased. */
export function validateEmail(input: unknown): ValidationResult<string> {
  if (typeof input !== "string" || !input.trim()) {
    return { ok: false, error: "Enter the email address of the person to share with." };
  }
  const email = input.trim().toLowerCase();
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Enter a valid email address, like name@example.com." };
  }
  return { ok: true, value: email };
}
