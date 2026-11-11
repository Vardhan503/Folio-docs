import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  createDocument,
  deleteDocument,
  duplicateDocument,
  exportDocument,
  getDocumentById,
  importDocument,
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
  /** Responses for successive queries; db.response is used once it's empty. */
  queue: [] as QueryResponse[],
}));

/** Chainable stand-in for the Supabase query builder; awaiting it yields the next response. */
function createQueryBuilder(): unknown {
  const builder: unknown = new Proxy(
    {},
    {
      get(_target, method: string) {
        if (method === "then") {
          return (resolve: (value: QueryResponse) => void) =>
            resolve(db.queue.shift() ?? db.response);
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

/** Access-check response for a document the signed-in user owns. */
const OWNER_ACCESS: QueryResponse = {
  data: { owner_id: USER.id, document_shares: [] },
  error: null,
};

beforeEach(() => {
  session.user = USER;
  db.calls = [];
  db.queue = [];
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
  const row = {
    id: DOCUMENT_ID,
    title: "Plan",
    content: createEmptyDocument(),
    updated_at: "2026-11-11T19:00:00Z",
  };

  it("relies on RLS for access and only embeds the caller's own share", async () => {
    db.response = { data: { ...row, owner_id: USER.id, document_shares: [] }, error: null };

    const result = await getDocumentById(DOCUMENT_ID);

    expect(result).toEqual({ ok: true, data: { ...row, role: "owner" } });
    expect(callsTo("eq")).toEqual([
      ["id", DOCUMENT_ID],
      ["document_shares.user_id", USER.id],
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
  it("checks edit access, then saves only the trimmed title", async () => {
    db.queue = [OWNER_ACCESS];
    db.response = {
      data: { id: DOCUMENT_ID, title: "Roadmap", updated_at: "2026-11-11T19:00:00Z" },
      error: null,
    };

    const result = await updateDocumentTitle(DOCUMENT_ID, "  Roadmap  ");

    expect(result.ok).toBe(true);
    expect(callsTo("update")).toEqual([[{ title: "Roadmap" }]]);
    expect(callsTo("eq")).toEqual([
      ["id", DOCUMENT_ID],
      ["document_shares.user_id", USER.id],
      ["id", DOCUMENT_ID],
    ]);
  });

  it("never writes the content column when renaming", async () => {
    db.queue = [OWNER_ACCESS];
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

  it("saves validated JSON content after checking edit access", async () => {
    db.queue = [OWNER_ACCESS];
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
    expect(callsTo("eq")).toContainEqual(["document_shares.user_id", USER.id]);
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
    db.queue = [OWNER_ACCESS];
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

describe("importDocument", () => {
  function file(contents: string, name: string) {
    return new File([contents], name, { type: "text/plain" });
  }

  it("inserts one converted document owned by the verified user", async () => {
    db.response = { data: { id: DOCUMENT_ID }, error: null };

    const result = await importDocument(file("# Plan\n\nShip **it**", "project-plan.md"));

    expect(result).toEqual({ ok: true, data: { id: DOCUMENT_ID } });
    expect(callsTo("from")).toEqual([["documents"]]);
    expect(callsTo("insert")).toEqual([
      [
        {
          owner_id: USER.id,
          title: "project-plan",
          content: {
            type: "doc",
            content: [
              { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Plan" }] },
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "Ship " },
                  { type: "text", text: "it", marks: [{ type: "bold" }] },
                ],
              },
            ],
          },
        },
      ],
    ]);
    expect(callsTo("update")).toEqual([]);
  });

  it("takes owner_id from the session, never from the upload", async () => {
    db.response = { data: { id: DOCUMENT_ID }, error: null };
    const forged = file('{"owner_id":"33333333-3333-4333-8333-333333333333"}', "owner_id.txt");

    await importDocument(forged);

    const [[row]] = callsTo("insert") as [[{ owner_id: string; title: string }]];
    expect(row.owner_id).toBe(USER.id);
    expect(row.title).toBe("owner_id");
  });

  it("refuses to import without a session", async () => {
    session.user = null;

    const result = await importDocument(file("Hello", "notes.txt"));

    expect(result).toMatchObject({ ok: false, code: "unauthenticated" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects invalid files before touching the database", async () => {
    for (const upload of [null, "notes.txt", file("%PDF-1.7", "report.pdf"), file("", "empty.txt")]) {
      const result = await importDocument(upload);
      expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    }
    expect(createClient).not.toHaveBeenCalled();
  });

  it("creates no row for a damaged .docx", async () => {
    const result = await importDocument(new File(["PK not really a zip"], "report.docx"));

    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("creates no row when conversion fails", async () => {
    const result = await importDocument(file("[docs]: https://example.com\n", "links.md"));

    expect(result).toEqual({
      ok: false,
      code: "invalid_input",
      error: "This file doesn't contain any text that can be imported.",
    });
    expect(createClient).not.toHaveBeenCalled();
    expect(callsTo("insert")).toEqual([]);
  });

  it("returns a safe message when the insert fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    db.response = {
      data: null,
      error: { code: "42501", message: "new row violates row-level security policy" },
    };

    const result = await importDocument(file("Hello", "notes.txt"));

    expect(result).toEqual({
      ok: false,
      code: "server_error",
      error: "We couldn't import this file. Please try again.",
    });
    expect(log).toHaveBeenCalled();
  });
});

describe("document actions", () => {
  const content = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Hello", marks: [{ type: "bold" }] }] }],
  };
  function sourceRow(role: "owner" | "editor" | "viewer") {
    return {
      data: {
        title: "Plan",
        content,
        owner_id: role === "owner" ? USER.id : "33333333-3333-4333-8333-333333333333",
        document_shares: role === "owner" ? [] : [{ role, user_id: USER.id }],
      },
      error: null,
    };
  }

  describe("duplicateDocument", () => {
    it.each(["owner", "editor"] as const)(
      "copies title and content into a new document owned by the %s",
      async (role) => {
        db.queue = [sourceRow(role)];
        db.response = { data: { id: "44444444-4444-4444-8444-444444444444", title: "Copy of Plan" }, error: null };

        const result = await duplicateDocument(DOCUMENT_ID);

        expect(result).toEqual({
          ok: true,
          data: { id: "44444444-4444-4444-8444-444444444444", title: "Copy of Plan" },
        });
        expect(callsTo("insert")).toEqual([[{ owner_id: USER.id, title: "Copy of Plan", content }]]);
        expect(callsTo("from")).toEqual([["documents"], ["documents"]]);
      },
    );

    it("never copies shares", async () => {
      db.queue = [sourceRow("owner")];
      db.response = { data: { id: DOCUMENT_ID, title: "Copy of Plan" }, error: null };
      await duplicateDocument(DOCUMENT_ID);
      expect(callsTo("from")).not.toContainEqual(["document_shares"]);
    });

    it("refuses viewers without writing", async () => {
      db.queue = [sourceRow("viewer")];
      const result = await duplicateDocument(DOCUMENT_ID);
      expect(result).toMatchObject({ ok: false, code: "forbidden" });
      expect(callsTo("insert")).toEqual([]);
    });

    it("treats documents hidden by RLS as not found", async () => {
      db.response = { data: null, error: null };
      expect(await duplicateDocument(DOCUMENT_ID)).toEqual(NOT_FOUND);
      expect(callsTo("insert")).toEqual([]);
    });

    it("rejects signed-out callers and malformed ids before querying", async () => {
      expect(await duplicateDocument("not-a-uuid")).toEqual(NOT_FOUND);
      session.user = null;
      expect(await duplicateDocument(DOCUMENT_ID)).toMatchObject({ ok: false, code: "unauthenticated" });
      expect(createClient).not.toHaveBeenCalled();
    });
  });

  describe("exportDocument", () => {
    it("returns the saved content as Markdown with a safe filename", async () => {
      db.response = { ...sourceRow("editor"), data: { ...sourceRow("editor").data, title: "Q3/../plan: final?" } };

      const result = await exportDocument(DOCUMENT_ID, "md");

      expect(result).toEqual({
        ok: true,
        data: {
          filename: "Q3 .. plan final.md",
          mimeType: "text/markdown;charset=utf-8",
          text: "**Hello**\n",
        },
      });
    });

    it("returns plain text", async () => {
      db.response = sourceRow("owner");
      const result = await exportDocument(DOCUMENT_ID, "txt");
      expect(result).toMatchObject({ ok: true, data: { filename: "Plan.txt", text: "Hello\n" } });
    });

    it("refuses viewers", async () => {
      db.response = sourceRow("viewer");
      expect(await exportDocument(DOCUMENT_ID, "txt")).toMatchObject({ ok: false, code: "forbidden" });
    });

    it("rejects unknown formats before querying", async () => {
      expect(await exportDocument(DOCUMENT_ID, "html")).toMatchObject({ ok: false, code: "invalid_input" });
      expect(createClient).not.toHaveBeenCalled();
    });
  });

  describe("deleteDocument", () => {
    it("deletes only a document the caller owns", async () => {
      db.queue = [OWNER_ACCESS];
      db.response = { data: { id: DOCUMENT_ID }, error: null };

      const result = await deleteDocument(DOCUMENT_ID);

      expect(result).toEqual({ ok: true, data: { id: DOCUMENT_ID } });
      expect(callsTo("delete")).toEqual([[]]);
      expect(callsTo("eq")).toEqual([
        ["id", DOCUMENT_ID],
        ["document_shares.user_id", USER.id],
        ["id", DOCUMENT_ID],
        ["owner_id", USER.id],
      ]);
    });

    it.each(["editor", "viewer"] as const)("refuses an %s without deleting", async (role) => {
      db.queue = [sourceRow(role)];

      const result = await deleteDocument(DOCUMENT_ID);

      expect(result).toEqual({
        ok: false,
        code: "forbidden",
        error: "Only the owner can delete this document.",
      });
      expect(callsTo("delete")).toEqual([]);
    });

    it("treats documents hidden by RLS as not found", async () => {
      db.response = { data: null, error: null };
      expect(await deleteDocument(DOCUMENT_ID)).toEqual(NOT_FOUND);
      expect(callsTo("delete")).toEqual([]);
    });

    it("reports not_found when RLS removed no row", async () => {
      db.queue = [OWNER_ACCESS];
      db.response = { data: null, error: null };
      expect(await deleteDocument(DOCUMENT_ID)).toEqual(NOT_FOUND);
    });

    it("rejects signed-out callers without querying", async () => {
      session.user = null;
      expect(await deleteDocument(DOCUMENT_ID)).toMatchObject({ ok: false, code: "unauthenticated" });
      expect(createClient).not.toHaveBeenCalled();
    });
  });
});
