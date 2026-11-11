import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NETWORK_ERROR,
  createAutosaveController,
  type AutosaveSnapshot,
  type SaveContent,
} from "@/components/editor/autosave-controller";

type SaveResult = Awaited<ReturnType<SaveContent>>;

const DELAY = 900;
const saved = (updatedAt: string): SaveResult => ({
  ok: true,
  data: { id: "doc", updated_at: updatedAt },
});

/** A save whose promise the test resolves explicitly. */
function deferredSaves() {
  const calls: { content: string; resolve: (result: SaveResult) => void; reject: () => void }[] = [];
  const save = vi.fn<SaveContent>(
    (content) =>
      new Promise((resolve, reject) => {
        calls.push({ content, resolve, reject: () => reject(new Error("offline")) });
      }),
  );
  return { save, calls };
}

function setup(save: SaveContent) {
  let content = "v0";
  const statuses: AutosaveSnapshot["status"][] = [];
  const controller = createAutosaveController({
    initialSavedAt: "2026-11-11T10:00:00Z",
    delayMs: DELAY,
    save,
    getContent: () => content,
    onChange: (snapshot) => statuses.push(snapshot.status),
  });
  return {
    controller,
    statuses,
    type(next: string) {
      content = next;
      controller.markDirty();
    },
  };
}

async function settle() {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("autosave", () => {
  it("debounces rapid typing into one save of the latest content", async () => {
    const save = vi.fn<SaveContent>(async () => saved("2026-11-11T10:01:00Z"));
    const { controller, type } = setup(save);

    type("a");
    await vi.advanceTimersByTimeAsync(300);
    type("ab");
    await vi.advanceTimersByTimeAsync(300);
    type("abc");
    expect(save).not.toHaveBeenCalled();
    expect(controller.getSnapshot().status).toBe("unsaved");

    await vi.advanceTimersByTimeAsync(DELAY);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("abc");
    expect(controller.getSnapshot()).toMatchObject({
      status: "saved",
      lastSavedAt: "2026-11-11T10:01:00Z",
    });
  });

  it("never runs two saves at once and sends the newest content last", async () => {
    const { save, calls } = deferredSaves();
    const { controller, type } = setup(save);

    type("first");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(calls).toHaveLength(1);

    type("second");
    await vi.advanceTimersByTimeAsync(DELAY);
    type("third");
    await controller.flush();
    expect(calls).toHaveLength(1);

    calls[0].resolve(saved("2026-11-11T10:01:00Z"));
    await settle();
    expect(calls.map((call) => call.content)).toEqual(["first", "third"]);
    expect(controller.getSnapshot().status).toBe("saving");

    calls[1].resolve(saved("2026-11-11T10:02:00Z"));
    await settle();
    expect(controller.getSnapshot()).toMatchObject({
      status: "saved",
      lastSavedAt: "2026-11-11T10:02:00Z",
    });
  });

  it("does not report saved when newer edits arrived during the save", async () => {
    const { save, calls } = deferredSaves();
    const { controller, type } = setup(save);

    type("first");
    await vi.advanceTimersByTimeAsync(DELAY);
    type("newer");
    calls[0].resolve(saved("2026-11-11T10:01:00Z"));
    await settle();

    expect(controller.getSnapshot().status).toBe("unsaved");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(calls[1].content).toBe("newer");
  });

  it.each([
    ["an expired session", { ok: false, code: "unauthenticated", error: "Your session has expired." }, true],
    ["revoked access", { ok: false, code: "not_found", error: "This document doesn't exist or you don't have access to it." }, false],
    ["view-only access", { ok: false, code: "forbidden", error: "You have view-only access to this document, so changes can't be saved." }, false],
    ["a database failure", { ok: false, code: "server_error", error: "We couldn't save your changes." }, true],
  ] as const)("shows a failure for %s and keeps the edits unsaved", async (_label, failure, retryable) => {
    const save = vi.fn<SaveContent>(async () => failure);
    const { controller, type, statuses } = setup(save);

    type("edits");
    await vi.advanceTimersByTimeAsync(DELAY);

    expect(controller.getSnapshot()).toMatchObject({
      status: "error",
      error: failure.error,
      retryable,
    });
    expect(statuses).not.toContain("saved");
  });

  it("reports a network failure and succeeds on retry", async () => {
    const { save, calls } = deferredSaves();
    const { controller, type } = setup(save);

    type("edits");
    await vi.advanceTimersByTimeAsync(DELAY);
    calls[0].reject();
    await settle();
    expect(controller.getSnapshot()).toMatchObject({
      status: "error",
      error: NETWORK_ERROR,
      retryable: true,
    });

    void controller.flush();
    expect(calls[1].content).toBe("edits");
    calls[1].resolve(saved("2026-11-11T10:05:00Z"));
    await settle();
    expect(controller.getSnapshot()).toMatchObject({ status: "saved", error: null });
  });

  it("retries automatically on the next edit after a failure", async () => {
    const save = vi
      .fn<SaveContent>()
      .mockResolvedValueOnce({ ok: false, code: "server_error", error: "We couldn't save your changes." })
      .mockResolvedValueOnce(saved("2026-11-11T10:06:00Z"));
    const { controller, type } = setup(save);

    type("one");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(controller.getSnapshot().status).toBe("error");

    type("one two");
    expect(controller.getSnapshot().status).toBe("unsaved");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(save).toHaveBeenLastCalledWith("one two");
    expect(controller.getSnapshot().status).toBe("saved");
  });

  it("never saves when nothing was edited, as for viewers", async () => {
    const save = vi.fn<SaveContent>(async () => saved("x"));
    const { controller } = setup(save);

    await controller.flush();
    await vi.advanceTimersByTimeAsync(DELAY * 3);
    controller.detach();

    expect(save).not.toHaveBeenCalled();
    expect(controller.getSnapshot().status).toBe("saved");
  });

  it("makes a best-effort save of pending edits when leaving the page", async () => {
    const save = vi.fn<SaveContent>(async () => saved("x"));
    const { controller, type } = setup(save);

    type("draft");
    controller.detach();
    expect(save).toHaveBeenCalledWith("draft");

    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("sends the final edits after an in-flight save when leaving mid-save", async () => {
    const { save, calls } = deferredSaves();
    const { controller, type } = setup(save);

    type("first");
    await vi.advanceTimersByTimeAsync(DELAY);
    type("final");
    controller.detach();
    expect(calls).toHaveLength(1);

    calls[0].resolve(saved("x"));
    await settle();
    expect(calls.map((call) => call.content)).toEqual(["first", "final"]);
  });

  it("skips saving until the editor can provide content", async () => {
    const save = vi.fn<SaveContent>(async () => saved("x"));
    const controller = createAutosaveController({
      initialSavedAt: "2026-11-11T10:00:00Z",
      delayMs: DELAY,
      save,
      getContent: () => null,
      onChange: () => {},
    });

    controller.markDirty();
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(save).not.toHaveBeenCalled();
    expect(controller.getSnapshot().status).toBe("unsaved");
  });
});
