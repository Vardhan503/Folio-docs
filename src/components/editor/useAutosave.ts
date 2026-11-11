"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/react";
import { saveDocumentContentAction } from "@/lib/documents/actions";

export type SaveStatus = "saved" | "unsaved" | "saving" | "error";

type UseAutosaveOptions = {
  documentId: string;
  initialSavedAt: string;
  /** Returns the editor's current JSON, or null if the editor isn't ready. */
  getContent: () => JSONContent | null;
  delayMs?: number;
};

const NETWORK_ERROR =
  "We couldn't reach the server. Check your connection, then retry.";

function readSerializedContent(getContent: () => JSONContent | null): string | null {
  const content = getContent();
  return content ? JSON.stringify(content) : null;
}

/**
 * Debounced, serialized autosave. Each edit bumps a local revision; at most one
 * save is in flight, and it always sends the latest content, so an older save
 * can never land after a newer one. "saved" means the latest revision persisted.
 */
export function useAutosave({
  documentId,
  initialSavedAt,
  getContent,
  delayMs = 900,
}: UseAutosaveOptions) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState(initialSavedAt);

  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const unmountContentRef = useRef<string | null>(null);
  const getContentRef = useRef(getContent);
  const flushRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    getContentRef.current = getContent;
  }, [getContent]);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }
    if (revisionRef.current === savedRevisionRef.current) return;

    const content = readSerializedContent(getContentRef.current);
    if (!content) return;

    const revision = revisionRef.current;
    inFlightRef.current = true;
    setStatus("saving");
    setError(null);

    let result: Awaited<ReturnType<typeof saveDocumentContentAction>>;
    try {
      result = await saveDocumentContentAction(documentId, content);
    } catch {
      result = { ok: false, code: "server_error", error: NETWORK_ERROR };
    }
    inFlightRef.current = false;

    if (result.ok) {
      savedRevisionRef.current = Math.max(savedRevisionRef.current, revision);
    }

    if (!mountedRef.current) {
      const pending = unmountContentRef.current;
      unmountContentRef.current = null;
      if (pending) void saveDocumentContentAction(documentId, pending);
      return;
    }

    if (!result.ok) {
      queuedRef.current = false;
      setStatus("error");
      setError(result.error);
      return;
    }

    setLastSavedAt(result.data.updated_at);

    if (revisionRef.current === savedRevisionRef.current) {
      setStatus("saved");
    } else if (queuedRef.current) {
      queuedRef.current = false;
      void flushRef.current();
    } else {
      setStatus("unsaved");
    }
  }, [documentId]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const markDirty = useCallback(() => {
    revisionRef.current += 1;
    setStatus((current) => (current === "saving" ? current : "unsaved"));
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flushRef.current(), delayMs);
  }, [delayMs]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (revisionRef.current === savedRevisionRef.current) return;

      // Best effort: persist the final edits when leaving the page in-app.
      const content = readSerializedContent(getContentRef.current);
      if (!content) return;
      if (inFlightRef.current) {
        unmountContentRef.current = content;
      } else {
        void saveDocumentContentAction(documentId, content);
      }
    };
  }, [documentId]);

  const hasUnsavedChanges = status !== "saved";

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  return { status, error, lastSavedAt, hasUnsavedChanges, markDirty, saveNow: flush };
}
