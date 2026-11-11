import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  getDocumentById,
  updateDocumentContent,
  updateDocumentTitle,
} from "@/lib/data/documents";
import {
  listDocumentCollaborators,
  listSharedDocuments,
  revokeDocumentAccess,
  shareDocument,
  updateSharePermission,
} from "@/lib/data/sharing";
import { createEmptyDocument } from "@/lib/documents/validation";
import { canEdit, validateEmail } from "@/lib/sharing/roles";

// These tests mock Supabase, so they check the server-side guards only.
// Live RLS behaviour is covered by supabase/tests/003_document_sharing_rls.sql.

const session = vi.hoisted(() => ({
  user: null as AuthenticatedUser | null,
}));

vi.mock("@/lib/auth/session", () => ({
  getOptionalUser: vi.fn(async () => session.user),
  getCurrentUser: vi.fn(async () => {
    if (!session.user) throw new Error("NEXT_REDIRECT:/login");
    return session.user;
  }),
}));

type QueryResponse = { data: unknown; error: { code?: string; message?: string } | null };
type Call = { method: string; args: unknown[] };

const db = vi.hoisted(() => ({
  calls: [] as Call[],
  /** Responses for successive queries, in order; an empty queue yields no rows. */
  queue: [] as QueryResponse[],
}));

function createQueryBuilder(): unknown {
  const builder: unknown = new Proxy(
    {},
    {
      get(_target, method: string) {
        if (method === "then") {
          return (resolve: (value: QueryResponse) => void) =>
            resolve(db.queue.shift() ?? { data: null, error: null });
        }
        return (...args: unknown[]) => {
          db.calls.push({ method, args });
          return builder;
        };
      },
    },
  );
  return builder;
}

const createClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const OWNER: AuthenticatedUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.com",
};
const COLLABORATOR: AuthenticatedUser = {
  id: "33333333-3333-4333-8333-333333333333",
  email: "collaborator@example.com",
};
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";
const NOT_FOUND = {
  ok: false,
  code: "not_found",
  error: "This document doesn't exist or you don't have access to it.",
};

const ownerAccess = (): QueryResponse => ({
  data: { owner_id: OWNER.id, document_shares: [] },
  error: null,
});
const sharedAccess = (role: "viewer" | "editor"): QueryResponse => ({
  data: { owner_id: OWNER.id, document_shares: [{ role, user_id: COLLABORATOR.id }] },
  error: null,
});
const noAccess = (): QueryResponse => ({ data: null, error: null });

function callsTo(method: string) {
  return db.calls.filter((call) => call.method === method).map((call) => call.args);
}

function respond(...responses: QueryResponse[]) {
  db.queue = responses;
}

beforeEach(() => {
  session.user = OWNER;
  db.calls = [];
  db.queue = [];
  createClient.mockReset();
  createClient.mockImplementation(async () => ({
    from: (table: string) => {
      db.calls.push({ method: "from", args: [table] });
      return createQueryBuilder();
    },
    rpc: (fn: string, args: unknown) => {
      db.calls.push({ method: "rpc", args: [fn, args] });
      return createQueryBuilder();
    },
  }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("document access by role", () => {
  const row = {
    id: DOCUMENT_ID,
    title: "Plan",
    content: createEmptyDocument(),
    updated_at: "2026-11-11T19:00:00Z",
    owner_id: OWNER.id,
  };

  it("gives the owner the owner role", async () => {
    respond({ data: { ...row, document_shares: [] }, error: null });
    const result = await getDocumentById(DOCUMENT_ID);
    expect(result).toMatchObject({ ok: true, data: { role: "owner" } });
  });

  it.each(["viewer", "editor"] as const)("gives a shared %s their share role", async (role) => {
    session.user = COLLABORATOR;
    respond({
      data: { ...row, document_shares: [{ role, user_id: COLLABORATOR.id }] },
      error: null,
    });
    const result = await getDocumentById(DOCUMENT_ID);
    expect(result).toMatchObject({ ok: true, data: { role } });
    expect(result.ok && "owner_id" in result.data).toBe(false);
  });

  it("denies an unshared user the same way as a missing document", async () => {
    session.user = COLLABORATOR;
    respond(noAccess());
    expect(await getDocumentById(DOCUMENT_ID)).toEqual(NOT_FOUND);
  });

  it("denies a row whose embedded share belongs to someone else", async () => {
    session.user = COLLABORATOR;
    respond({
      data: { ...row, document_shares: [{ role: "editor", user_id: OWNER.id }] },
      error: null,
    });
    expect(await getDocumentById(DOCUMENT_ID)).toEqual(NOT_FOUND);
  });

  it("only treats owners and editors as able to edit", () => {
    expect(canEdit("owner")).toBe(true);
    expect(canEdit("editor")).toBe(true);
    expect(canEdit("viewer")).toBe(false);
  });
});

describe("saving shared documents", () => {
  const content = JSON.stringify(createEmptyDocument());
  const saved = { data: { id: DOCUMENT_ID, title: "New", updated_at: "2026-11-11T20:00:00Z" }, error: null };

  it("lets an editor rename and save content", async () => {
    session.user = COLLABORATOR;
    respond(sharedAccess("editor"), saved, sharedAccess("editor"), saved);

    expect((await updateDocumentTitle(DOCUMENT_ID, "New")).ok).toBe(true);
    expect((await updateDocumentContent(DOCUMENT_ID, content)).ok).toBe(true);
    expect(callsTo("update")).toHaveLength(2);
  });

  it("refuses viewer saves without attempting the update", async () => {
    session.user = COLLABORATOR;
    respond(sharedAccess("viewer"), sharedAccess("viewer"));

    const rename = await updateDocumentTitle(DOCUMENT_ID, "Mine");
    const save = await updateDocumentContent(DOCUMENT_ID, content);

    expect(rename).toMatchObject({ ok: false, code: "forbidden" });
    expect(save).toMatchObject({ ok: false, code: "forbidden" });
    expect(callsTo("update")).toEqual([]);
  });

  it("re-checks access on every save, so a downgraded editor is refused", async () => {
    session.user = COLLABORATOR;
    respond(sharedAccess("editor"), saved, sharedAccess("viewer"));

    expect((await updateDocumentTitle(DOCUMENT_ID, "First")).ok).toBe(true);
    expect(await updateDocumentTitle(DOCUMENT_ID, "Second")).toMatchObject({
      ok: false,
      code: "forbidden",
    });
    expect(callsTo("update")).toHaveLength(1);
  });

  it("refuses saves after access is revoked", async () => {
    session.user = COLLABORATOR;
    respond(noAccess());
    expect(await updateDocumentContent(DOCUMENT_ID, content)).toEqual(NOT_FOUND);
    expect(callsTo("update")).toEqual([]);
  });

  it("never sends ownership or identity columns in an update", async () => {
    session.user = COLLABORATOR;
    respond(sharedAccess("editor"), saved, sharedAccess("editor"), saved);
    await updateDocumentTitle(DOCUMENT_ID, "New");
    await updateDocumentContent(DOCUMENT_ID, content);

    for (const [payload] of callsTo("update") as [Record<string, unknown>][]) {
      expect(Object.keys(payload).every((key) => key === "title" || key === "content")).toBe(true);
    }
  });

  it("reports an expired session without querying", async () => {
    session.user = null;
    expect(await updateDocumentTitle(DOCUMENT_ID, "New")).toMatchObject({
      ok: false,
      code: "unauthenticated",
    });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("shareDocument", () => {
  it("resolves the email through the scoped RPC and inserts one share", async () => {
    respond(ownerAccess(), { data: COLLABORATOR.id, error: null }, { data: null, error: null });

    const result = await shareDocument(DOCUMENT_ID, "  Collaborator@Example.com ", "editor");

    expect(result).toEqual({ ok: true, data: { userId: COLLABORATOR.id } });
    expect(callsTo("rpc")).toEqual([
      [
        "find_share_recipient",
        { p_document_id: DOCUMENT_ID, p_email: "collaborator@example.com" },
      ],
    ]);
    expect(callsTo("insert")).toEqual([
      [{ document_id: DOCUMENT_ID, user_id: COLLABORATOR.id, role: "editor" }],
    ]);
  });

  it("never includes an owner id in the share it writes", async () => {
    respond(ownerAccess(), { data: COLLABORATOR.id, error: null }, { data: null, error: null });
    await shareDocument(DOCUMENT_ID, COLLABORATOR.email, "viewer");
    const [[payload]] = callsTo("insert") as [[Record<string, unknown>]];
    expect(Object.keys(payload).sort()).toEqual(["document_id", "role", "user_id"]);
  });

  it.each([
    ["an invalid document id", "not-a-uuid", "a@example.com", "viewer", "not_found"],
    ["an invalid role", DOCUMENT_ID, "a@example.com", "owner", "invalid_input"],
    ["a missing role", DOCUMENT_ID, "a@example.com", undefined, "invalid_input"],
    ["an empty email", DOCUMENT_ID, "   ", "viewer", "invalid_input"],
    ["a malformed email", DOCUMENT_ID, "not-an-email", "viewer", "invalid_input"],
    ["a non-string email", DOCUMENT_ID, { email: "a@example.com" }, "viewer", "invalid_input"],
  ])("rejects %s before touching the database", async (_label, id, email, role, code) => {
    const result = await shareDocument(id, email, role);
    expect(result).toMatchObject({ ok: false, code });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects sharing with your own email", async () => {
    const result = await shareDocument(DOCUMENT_ID, "OWNER@example.com", "viewer");
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects sharing with yourself even if the email lookup resolves to you", async () => {
    respond(ownerAccess(), { data: OWNER.id, error: null });
    const result = await shareDocument(DOCUMENT_ID, "alias@example.com", "viewer");
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(callsTo("insert")).toEqual([]);
  });

  it("explains when no account uses the email", async () => {
    respond(ownerAccess(), { data: null, error: null });
    const result = await shareDocument(DOCUMENT_ID, "nobody@example.com", "viewer");
    expect(result).toMatchObject({ ok: false, code: "not_found" });
    expect(result.ok ? "" : result.error).toMatch(/No Folio account/);
    expect(callsTo("insert")).toEqual([]);
  });

  it("treats a duplicate share as a safe conflict", async () => {
    respond(
      ownerAccess(),
      { data: COLLABORATOR.id, error: null },
      { data: null, error: { code: "23505", message: "duplicate key value violates document_shares_pkey" } },
    );
    const result = await shareDocument(DOCUMENT_ID, COLLABORATOR.email, "viewer");
    expect(result).toMatchObject({ ok: false, code: "conflict" });
    expect(JSON.stringify(result)).not.toMatch(/pkey|duplicate key/);
  });

  it.each(["viewer", "editor"] as const)("refuses to let a %s share", async (role) => {
    session.user = COLLABORATOR;
    respond(sharedAccess(role));
    const result = await shareDocument(DOCUMENT_ID, "third@example.com", "viewer");
    expect(result).toMatchObject({
      ok: false,
      code: "forbidden",
      error: "Only the document owner can manage sharing.",
    });
    expect(callsTo("rpc")).toEqual([]);
    expect(callsTo("insert")).toEqual([]);
  });

  it("hides documents the caller can't see at all", async () => {
    session.user = COLLABORATOR;
    respond(noAccess());
    expect(await shareDocument(DOCUMENT_ID, "third@example.com", "viewer")).toEqual(NOT_FOUND);
  });

  it("maps a database permission error to forbidden", async () => {
    respond(ownerAccess(), { data: null, error: { code: "42501", message: "Only the owner can share" } });
    expect(await shareDocument(DOCUMENT_ID, COLLABORATOR.email, "viewer")).toMatchObject({
      ok: false,
      code: "forbidden",
    });
  });

  it("does not expose database error details", async () => {
    respond(ownerAccess(), { data: null, error: { code: "XX000", message: "internal: relation private.x" } });
    const result = await shareDocument(DOCUMENT_ID, COLLABORATOR.email, "viewer");
    expect(result).toMatchObject({ ok: false, code: "server_error" });
    expect(JSON.stringify(result)).not.toMatch(/internal|private/);
  });

  it("reports an expired session", async () => {
    session.user = null;
    expect(await shareDocument(DOCUMENT_ID, COLLABORATOR.email, "viewer")).toMatchObject({
      ok: false,
      code: "unauthenticated",
    });
  });
});

describe("listDocumentCollaborators", () => {
  it("returns collaborators with profile details for the owner", async () => {
    respond(ownerAccess(), {
      data: [
        {
          user_id: COLLABORATOR.id,
          role: "editor",
          created_at: "2026-11-11T19:00:00Z",
          profile: { email: COLLABORATOR.email, display_name: "Casey" },
        },
      ],
      error: null,
    });

    expect(await listDocumentCollaborators(DOCUMENT_ID)).toEqual({
      ok: true,
      data: [
        { userId: COLLABORATOR.id, email: COLLABORATOR.email, displayName: "Casey", role: "editor" },
      ],
    });
    expect(callsTo("eq")).toContainEqual(["document_id", DOCUMENT_ID]);
  });

  it("refuses collaborators who ask for the list", async () => {
    session.user = COLLABORATOR;
    respond(sharedAccess("editor"));
    expect(await listDocumentCollaborators(DOCUMENT_ID)).toMatchObject({
      ok: false,
      code: "forbidden",
    });
    expect(callsTo("from")).toEqual([["documents"]]);
  });
});

describe("updateSharePermission", () => {
  it("lets the owner change a collaborator's role", async () => {
    respond(ownerAccess(), { data: { user_id: COLLABORATOR.id }, error: null });

    expect(await updateSharePermission(DOCUMENT_ID, COLLABORATOR.id, "viewer")).toEqual({
      ok: true,
      data: null,
    });
    expect(callsTo("update")).toEqual([[{ role: "viewer" }]]);
    expect(callsTo("eq")).toContainEqual(["user_id", COLLABORATOR.id]);
  });

  it("reports a collaborator who was already removed", async () => {
    respond(ownerAccess(), { data: null, error: null });
    expect(await updateSharePermission(DOCUMENT_ID, COLLABORATOR.id, "editor")).toMatchObject({
      ok: false,
      code: "not_found",
    });
  });

  it.each([
    ["an invalid user id", COLLABORATOR.id.slice(1), "viewer"],
    ["an invalid role", COLLABORATOR.id, "admin"],
    ["the owner's own id", OWNER.id, "viewer"],
  ])("rejects %s", async (_label, userId, role) => {
    expect(await updateSharePermission(DOCUMENT_ID, userId, role)).toMatchObject({
      ok: false,
      code: "invalid_input",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("refuses editors who try to change permissions", async () => {
    session.user = COLLABORATOR;
    respond(sharedAccess("editor"));
    const result = await updateSharePermission(
      DOCUMENT_ID,
      "44444444-4444-4444-8444-444444444444",
      "editor",
    );
    expect(result).toMatchObject({ ok: false, code: "forbidden" });
    expect(callsTo("update")).toEqual([]);
  });
});

describe("revokeDocumentAccess", () => {
  it("deletes only the chosen collaborator's share", async () => {
    respond(ownerAccess(), { data: null, error: null });

    expect(await revokeDocumentAccess(DOCUMENT_ID, COLLABORATOR.id)).toEqual({
      ok: true,
      data: null,
    });
    expect(callsTo("delete")).toHaveLength(1);
    expect(callsTo("eq")).toEqual(
      expect.arrayContaining([
        ["document_id", DOCUMENT_ID],
        ["user_id", COLLABORATOR.id],
      ]),
    );
  });

  it("refuses collaborators who try to revoke access", async () => {
    session.user = COLLABORATOR;
    respond(sharedAccess("viewer"));
    expect(await revokeDocumentAccess(DOCUMENT_ID, COLLABORATOR.id)).toMatchObject({
      ok: false,
      code: "invalid_input",
    });
    respond(sharedAccess("viewer"));
    expect(
      await revokeDocumentAccess(DOCUMENT_ID, "44444444-4444-4444-8444-444444444444"),
    ).toMatchObject({ ok: false, code: "forbidden" });
    expect(callsTo("delete")).toEqual([]);
  });

  it("doesn't let the owner remove their own access", async () => {
    expect(await revokeDocumentAccess(DOCUMENT_ID, OWNER.id)).toMatchObject({
      ok: false,
      code: "invalid_input",
    });
  });

  it("removes the document from the recipient's shared list and editor", async () => {
    respond(ownerAccess(), { data: null, error: null });
    await revokeDocumentAccess(DOCUMENT_ID, COLLABORATOR.id);

    session.user = COLLABORATOR;
    respond({ data: [], error: null }, noAccess());
    expect(await listSharedDocuments()).toEqual({ ok: true, data: [] });
    expect(await getDocumentById(DOCUMENT_ID)).toEqual(NOT_FOUND);
  });
});

describe("listSharedDocuments", () => {
  it("lists only the caller's shares, newest first, with owner and role", async () => {
    session.user = COLLABORATOR;
    respond({
      data: [
        {
          role: "viewer",
          document: {
            id: "55555555-5555-4555-8555-555555555555",
            title: "Older",
            updated_at: "2026-11-10T10:00:00Z",
            owner_id: OWNER.id,
            owner: { email: OWNER.email, display_name: "" },
          },
        },
        {
          role: "editor",
          document: {
            id: DOCUMENT_ID,
            title: "Newer",
            updated_at: "2026-11-11T10:00:00Z",
            owner_id: OWNER.id,
            owner: { email: OWNER.email, display_name: "Olivia" },
          },
        },
        { role: "viewer", document: null },
      ],
      error: null,
    });

    const result = await listSharedDocuments();

    expect(callsTo("eq")).toEqual([["user_id", COLLABORATOR.id]]);
    expect(callsTo("select")[0][0]).toContain("owner:profiles!owner_id(");
    expect(result).toEqual({
      ok: true,
      data: [
        {
          id: DOCUMENT_ID,
          title: "Newer",
          owner: { id: OWNER.id, name: "Olivia" },
          lastEditedAt: "2026-11-11T10:00:00Z",
          ownership: "shared",
          role: "editor",
        },
        {
          id: "55555555-5555-4555-8555-555555555555",
          title: "Older",
          owner: { id: OWNER.id, name: OWNER.email },
          lastEditedAt: "2026-11-10T10:00:00Z",
          ownership: "shared",
          role: "viewer",
        },
      ],
    });
  });

  it("never lists the caller's own documents as shared", async () => {
    session.user = OWNER;
    respond({
      data: [
        {
          role: "editor",
          document: { id: DOCUMENT_ID, title: "Mine", updated_at: "2026-11-11T10:00:00Z", owner_id: OWNER.id, owner: null },
        },
      ],
      error: null,
    });
    expect(await listSharedDocuments()).toEqual({ ok: true, data: [] });
  });

  it("returns a safe error when the query fails", async () => {
    respond({ data: null, error: { code: "XX000", message: "internal detail" } });
    const result = await listSharedDocuments();
    expect(result).toMatchObject({ ok: false, code: "server_error" });
    expect(JSON.stringify(result)).not.toMatch(/internal/);
  });
});

describe("validateEmail", () => {
  it("normalizes case and whitespace", () => {
    expect(validateEmail("  Name@Example.COM ")).toEqual({ ok: true, value: "name@example.com" });
  });

  it.each(["", "name", "name@", "@example.com", "a b@example.com", `${"a".repeat(320)}@x.io`])(
    "rejects %j",
    (input) => {
      expect(validateEmail(input).ok).toBe(false);
    },
  );
});

describe("003 sharing migration", () => {
  const migration = readFileSync(
    new URL("../../../supabase/migrations/003_document_sharing.sql", import.meta.url),
    "utf8",
  ).toLowerCase();

  it("limits document updates to the title and content columns", () => {
    expect(migration).toContain("revoke update on public.documents from authenticated");
    expect(migration).toContain("grant update (title, content) on public.documents to authenticated");
  });

  it("lets owners change only the role column of a share", () => {
    expect(migration).toContain("grant update (role) on public.document_shares to authenticated");
  });

  it("keeps security definer helpers out of the exposed schema", () => {
    const functions = migration.match(/create (?:or replace )?function [\s\S]*?\$\$;/g) ?? [];
    const definers = functions.filter((body) => body.includes("security definer"));
    expect(functions).toHaveLength(5);
    expect(definers).toHaveLength(4);
    for (const fn of definers) {
      expect(fn).toMatch(/^create (?:or replace )?function private\./);
      expect(fn).toContain("set search_path = ''");
    }
    expect(migration).not.toMatch(/disable row level security|service_role/);
  });
});
