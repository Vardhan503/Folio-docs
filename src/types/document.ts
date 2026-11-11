import type { ShareRole } from "@/lib/sharing/roles";

export type DocumentOwnership = "owned" | "shared";

export type DocumentOwner = {
  id: string;
  name: string;
};

export type DocumentSummary = {
  id: string;
  title: string;
  owner: DocumentOwner;
  /** ISO 8601 timestamp. */
  lastEditedAt: string;
  ownership: DocumentOwnership;
  /** The signed-in user's access, for documents shared with them. */
  role?: ShareRole;
};
