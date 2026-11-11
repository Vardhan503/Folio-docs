import type { DataResult } from "@/lib/data/result";

export type SaveStatus = "saved" | "unsaved" | "saving" | "error";

export type AutosaveSnapshot = {
  status: SaveStatus;
  error: string | null;
  /** False when retrying can't help, e.g. access was revoked or reduced to view-only. */
  retryable: boolean;
  lastSavedAt: string;
};

export type SaveContent = (
  serializedContent: string,
) => Promise<DataResult<{ id: string; updated_at: string }>>;

type AutosaveControllerOptions = {
  initialSavedAt: string;
  save: SaveContent;
  /** Returns the editor's current JSON as a string, or null if the editor isn't ready. */
  getContent: () => string | null;
  onChange: (snapshot: AutosaveSnapshot) => void;
  delayMs: number;
};

export const NETWORK_ERROR =
  "We couldn't reach the server. Check your connection, then retry.";

/**
 * Debounced, serialized autosave. Each edit bumps a local revision; at most one
 * save is in flight, and it always sends the latest content, so an older save
 * can never land after a newer one. "saved" means the latest revision persisted.
 */
export function createAutosaveController({
  initialSavedAt,
  save,
  getContent,
  onChange,
  delayMs,
}: AutosaveControllerOptions) {
  let snapshot: AutosaveSnapshot = {
    status: "saved",
    error: null,
    retryable: true,
    lastSavedAt: initialSavedAt,
  };
  let revision = 0;
  let savedRevision = 0;
  let inFlight = false;
  let queued = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attached = true;
  let pendingAfterDetach: string | null = null;

  function update(next: Partial<AutosaveSnapshot>) {
    snapshot = { ...snapshot, ...next };
    onChange(snapshot);
  }

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  async function flush(): Promise<void> {
    clearTimer();
    if (inFlight) {
      queued = true;
      return;
    }
    if (revision === savedRevision) return;

    const content = getContent();
    if (!content) return;

    const savingRevision = revision;
    inFlight = true;
    update({ status: "saving", error: null, retryable: true });

    let result: Awaited<ReturnType<SaveContent>>;
    try {
      result = await save(content);
    } catch {
      result = { ok: false, code: "server_error", error: NETWORK_ERROR };
    }
    inFlight = false;

    if (result.ok) {
      savedRevision = Math.max(savedRevision, savingRevision);
    }

    if (!attached) {
      const pending = pendingAfterDetach;
      pendingAfterDetach = null;
      if (pending) void save(pending).catch(() => {});
      return;
    }

    if (!result.ok) {
      queued = false;
      update({
        status: "error",
        error: result.error,
        retryable: result.code === "server_error" || result.code === "unauthenticated",
      });
      return;
    }

    if (revision === savedRevision) {
      update({ status: "saved", lastSavedAt: result.data.updated_at });
    } else if (queued) {
      queued = false;
      update({ lastSavedAt: result.data.updated_at });
      void flush();
    } else {
      update({ status: "unsaved", lastSavedAt: result.data.updated_at });
    }
  }

  return {
    getSnapshot: () => snapshot,

    markDirty() {
      revision += 1;
      if (snapshot.status !== "saving") update({ status: "unsaved" });
      clearTimer();
      timer = setTimeout(() => void flush(), delayMs);
    },

    flush,

    attach() {
      attached = true;
    },

    /** Leaving the page in-app: stop the timer and make a best-effort save of the final edits. */
    detach() {
      attached = false;
      clearTimer();
      if (revision === savedRevision) return;
      const content = getContent();
      if (!content) return;
      if (inFlight) {
        pendingAfterDetach = content;
      } else {
        void save(content).catch(() => {});
      }
    },
  };
}

export type AutosaveController = ReturnType<typeof createAutosaveController>;
