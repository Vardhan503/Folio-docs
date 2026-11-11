import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  createDocument,
  getDocumentById,
  updateDocumentContent,
  updateDocumentTitle,
} from "@/lib/data/documents";
import { createEmptyDocument } from "@/lib/documents/validation";

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
  response: { data: null, error: null } as QueryResponse,
}));

/** Chainable stand-in for the Supabase query builder; awaiting it yields db.response. */
function createQueryBuilder(): unknown {
  const builder: unknown = new Proxy(
    {},
    {
      get(_target, method: string) {
        if (method === "then") {
          return (resolve: (value: QueryResponse) => void) => resolve(db.response);
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

const USER: AuthenticatedUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "alice@example.com",
};
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";
const NOT_FOUND = {
  ok: false,
  code: "not_found",
  error: "This document doesn't exist or you don't have access to it.",
};

function callsTo(method: string) {
  return db.calls.filter((call) => call.method === method).map((call) => call.args);
}

beforeEach(() => {
  session.user = USER;
  db.calls = [];
  db.response = { data: null, error: null };
  createClient.mockReset();
  createClient.mockImplementation(async () => ({
    from: (table: string) => {
      db.calls.push({ method: "from", args: [table] });
      return createQueryBuilder();
    },
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createDocument", () => {
  it("inserts a default document owned by the verified user", async () => {
    db.response = { data: { id: DOCUMENT_ID }, error: null };

    const result = await createDocument();

    expect(result).toEqual({ ok: true, data: { id: DOCUMENT_ID } });
    expect(callsTo("from")).toEqual([["documents"]]);
    expect(callsTo("insert")).toEqual([
      [
        {
          owner_id: USER.id,
          title: "Untitled document",
          content: createEmptyDocument(),
        },
      ],
    ]);
  });

  it("refuses to create documents without a session", async () => {
    session.user = null;

    const result = await createDocument();

    expect(result).toMatchObject({ ok: false, code: "unauthenticated" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns a safe message when the insert fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    db.response = {
      data: null,
      error: { code: "42501", message: "new row violates row-level security policy" },
    };

    const result = await createDocument();

    expect(result).toEqual({
      ok: false,
      code: "server_error",
      error: "We couldn't create a document. Please try again.",
    });
    expect(log).toHaveBeenCalled();
  });
});

describe("getDocumentById", () => {
  it("filters by both document id and the verified owner", async () => {
    const row = {
      id: DOCUMENT_ID,
      title: "Plan",
      content: createEmptyDocument(),
      updated_at: "2026-11-11T19:00:00Z",
    };
    db.response = { data: row, error: null };

    const result = await getDocumentById(DOCUMENT_ID);

    expect(result).toEqual({ ok: true, data: row });
    expect(callsTo("eq")).toEqual([
      ["id", DOCUMENT_ID],
      ["owner_id", USER.id],
    ]);
  });

  it("treats a document hidden by RLS the same as a missing one", async () => {
    db.response = { data: null, error: null };
    expect(await getDocumentById(DOCUMENT_ID)).toEqual(NOT_FOUND);
  });

  it("does not query the database for malformed ids", async () => {
    expect(await getDocumentById("not-a-uuid")).toEqual(NOT_FOUND);
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("updateDocumentTitle", () => {
  it("saves the trimmed title scoped to the owner", async () => {
    db.response = {
      data: { id: DOCUMENT_ID, title: "Roadmap", updated_at: "2026-11-11T19:00:00Z" },
      error: null,
    };

    const result = await updateDocumentTitle(DOCUMENT_ID, "  Roadmap  ");

    expect(result.ok).toBe(true);
    expect(callsTo("update")).toEqual([[{ title: "Roadmap" }]]);
    expect(callsTo("eq")).toEqual([
      ["id", DOCUMENT_ID],
      ["owner_id", USER.id],
    ]);
  });

  it("never writes the content column when renaming", async () => {
    db.response = {
      data: { id: DOCUMENT_ID, title: "Roadmap", updated_at: "2026-11-11T19:00:00Z" },
      error: null,
    };
    await updateDocumentTitle(DOCUMENT_ID, "Roadmap");
    const [[payload]] = callsTo("update") as [[Record<string, unknown>]];
    expect(Object.keys(payload)).toEqual(["title"]);
  });

  it("rejects an empty title before touching the database", async () => {
    const result = await updateDocumentTitle(DOCUMENT_ID, "   ");
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns not_found when no owned row was updated", async () => {
    db.response = { data: null, error: null };
    expect(await updateDocumentTitle(DOCUMENT_ID, "Mine now")).toEqual(NOT_FOUND);
  });

  it("reports an expired session instead of redirecting", async () => {
    session.user = null;
    const result = await updateDocumentTitle(DOCUMENT_ID, "Title");
    expect(result).toMatchObject({ ok: false, code: "unauthenticated" });
  });
});

describe("updateDocumentContent", () => {
  const content = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
  };

  it("saves validated JSON content scoped to the owner", async () => {
    db.response = {
      data: { id: DOCUMENT_ID, updated_at: "2026-11-11T19:00:00Z" },
      error: null,
    };

    const result = await updateDocumentContent(DOCUMENT_ID, JSON.stringify(content));

    expect(result).toEqual({
      ok: true,
      data: { id: DOCUMENT_ID, updated_at: "2026-11-11T19:00:00Z" },
    });
    expect(callsTo("update")).toEqual([[{ content }]]);
    expect(callsTo("eq")).toContainEqual(["owner_id", USER.id]);
  });

  it("rejects malformed content before touching the database", async () => {
    const result = await updateDocumentContent(DOCUMENT_ID, "<p>Hello</p>");
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("only accepts content serialized as a JSON string", async () => {
    const result = await updateDocumentContent(DOCUMENT_ID, content);
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns not_found for documents the user can't update", async () => {
    db.response = { data: null, error: null };
    expect(await updateDocumentContent(DOCUMENT_ID, JSON.stringify(content))).toEqual(NOT_FOUND);
  });

  it("does not expose database error details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.response = {
      data: null,
      error: { code: "XX000", message: "internal: relation details" },
    };

    const result = await updateDocumentContent(DOCUMENT_ID, JSON.stringify(content));

    expect(result).toEqual({
      ok: false,
      code: "server_error",
      error: "We couldn't save your changes.",
    });
  });
});
