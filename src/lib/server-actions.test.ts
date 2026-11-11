import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import * as documentActions from "@/lib/documents/actions";
import * as sharingActions from "@/lib/sharing/actions";
import * as authActions from "@/lib/auth/actions";
import { isSupabaseAuthCookie, shouldResetForSession } from "@/lib/auth/session-boundary";

// Every export of a "use server" module is a public HTTP endpoint, so these
// tests call the actions directly the way a crafted request could.

const session = vi.hoisted(() => ({ user: null as AuthenticatedUser | null }));

vi.mock("@/lib/auth/session", () => ({
  getOptionalUser: vi.fn(async () => session.user),
  getCurrentUser: vi.fn(async () => {
    if (!session.user) throw new Error("NEXT_REDIRECT:/login");
    return session.user;
  }),
}));

const auth = vi.hoisted(() => ({
  signOut: vi.fn(async () => ({ error: null as { code?: string; status?: number } | null })),
}));
const createClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const cookieJar = vi.hoisted(() => ({
  names: [] as string[],
  deleted: [] as string[],
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => cookieJar.names.map((name) => ({ name, value: "x" })),
    delete: (name: string) => cookieJar.deleted.push(name),
  }),
}));

const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_USER_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  session.user = null;
  cookieJar.names = [];
  cookieJar.deleted = [];
  auth.signOut.mockReset();
  auth.signOut.mockResolvedValue({ error: null });
  createClient.mockReset();
  createClient.mockImplementation(async () => ({
    auth,
    from: () => {
      throw new Error("database queried without a session");
    },
    rpc: () => {
      throw new Error("database queried without a session");
    },
  }));
});

describe("server action surface", () => {
  it("exposes only the intended document and sharing actions", () => {
    expect(Object.keys(documentActions).sort()).toEqual([
      "createDocumentAction",
      "importDocumentAction",
      "saveDocumentContentAction",
      "saveDocumentTitleAction",
    ]);
    expect(Object.keys(sharingActions).sort()).toEqual([
      "listCollaboratorsAction",
      "revokeDocumentAccessAction",
      "shareDocumentAction",
      "updateSharePermissionAction",
    ]);
    expect(Object.keys(authActions).sort()).toEqual(["signIn", "signOut"]);
  });

  const file = new File(["hello"], "notes.txt", { type: "text/plain" });
  const formData = new FormData();
  formData.set("file", file);

  it.each([
    ["createDocumentAction", () => documentActions.createDocumentAction()],
    ["importDocumentAction", () => documentActions.importDocumentAction({ error: null }, formData)],
    ["saveDocumentTitleAction", () => documentActions.saveDocumentTitleAction(DOCUMENT_ID, "Title")],
    [
      "saveDocumentContentAction",
      () => documentActions.saveDocumentContentAction(DOCUMENT_ID, '{"type":"doc","content":[]}'),
    ],
    ["listCollaboratorsAction", () => sharingActions.listCollaboratorsAction(DOCUMENT_ID)],
    [
      "shareDocumentAction",
      () => sharingActions.shareDocumentAction(DOCUMENT_ID, "someone@example.com", "editor"),
    ],
    [
      "updateSharePermissionAction",
      () => sharingActions.updateSharePermissionAction(DOCUMENT_ID, OTHER_USER_ID, "editor"),
    ],
    [
      "revokeDocumentAccessAction",
      () => sharingActions.revokeDocumentAccessAction(DOCUMENT_ID, OTHER_USER_ID),
    ],
  ])("%s rejects a signed-out caller without querying data", async (_name, call) => {
    const result = (await call()) as { ok?: boolean; code?: string; error: string | null };

    if ("ok" in result) {
      expect(result).toMatchObject({ ok: false, code: "unauthenticated" });
    } else {
      expect(result.error).toMatch(/session has expired|sign in/i);
    }
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("signOut", () => {
  it("ends the Supabase session for this device", async () => {
    await authActions.signOut();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(cookieJar.deleted).toEqual([]);
  });

  it("still removes the auth cookies when Supabase can't be reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth.signOut.mockResolvedValue({ error: { code: "network_error", status: 0 } });
    cookieJar.names = [
      "sb-abcd-auth-token",
      "sb-abcd-auth-token.0",
      "sb-abcd-auth-token.1",
      "sb-abcd-auth-token-code-verifier",
      "theme",
    ];

    await authActions.signOut();

    expect(cookieJar.deleted).toEqual([
      "sb-abcd-auth-token",
      "sb-abcd-auth-token.0",
      "sb-abcd-auth-token.1",
      "sb-abcd-auth-token-code-verifier",
    ]);
  });

  it("does not log tokens or cookie values", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    auth.signOut.mockResolvedValue({ error: { code: "unexpected_failure", status: 500 } });
    cookieJar.names = ["sb-abcd-auth-token"];

    await authActions.signOut();

    expect(JSON.stringify(log.mock.calls)).not.toMatch(/sb-abcd|auth-token/);
  });
});

describe("account switching", () => {
  it("only reloads when leaving a signed-in user's pages", () => {
    expect(shouldResetForSession(undefined, null)).toBe(false);
    expect(shouldResetForSession(undefined, "user-a")).toBe(false);
    expect(shouldResetForSession(null, "user-a")).toBe(false);
    expect(shouldResetForSession("user-a", "user-a")).toBe(false);
    expect(shouldResetForSession("user-a", null)).toBe(true);
    expect(shouldResetForSession("user-a", "user-b")).toBe(true);
  });

  it("recognises only Supabase auth cookies", () => {
    expect(isSupabaseAuthCookie("sb-proj-auth-token")).toBe(true);
    expect(isSupabaseAuthCookie("sb-proj-auth-token.3")).toBe(true);
    expect(isSupabaseAuthCookie("sb-proj-auth-token-code-verifier")).toBe(true);
    expect(isSupabaseAuthCookie("sb-proj-other")).toBe(false);
    expect(isSupabaseAuthCookie("auth-token")).toBe(false);
  });
});
