"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/react";
import {
  createAutosaveController,
  type AutosaveController,
  type AutosaveSnapshot,
} from "@/components/editor/autosave-controller";
import { saveDocumentContentAction } from "@/lib/documents/actions";

export type { SaveStatus } from "@/components/editor/autosave-controller";

const SAVE_WAIT_MS = 10_000;

type UseAutosaveOptions = {
  documentId: string;
  initialSavedAt: string;
  /** Returns the editor's current JSON, or null if the editor isn't ready. */
  getContent: () => JSONContent | null;
  delayMs?: number;
};

/** React binding for the autosave controller; see autosave-controller.ts for the save rules. */
export function useAutosave({
  documentId,
  initialSavedAt,
  getContent,
  delayMs = 900,
}: UseAutosaveOptions) {
  const getContentRef = useRef(getContent);
  const [snapshot, setSnapshot] = useState<AutosaveSnapshot>({
    status: "saved",
    error: null,
    retryable: true,
    lastSavedAt: initialSavedAt,
  });
  const controllerRef = useRef<AutosaveController | null>(null);

  useEffect(() => {
    getContentRef.current = getContent;
  }, [getContent]);

  useEffect(() => {
    // Created once and kept while the page is hidden and shown again, so
    // unsaved revisions survive; the editor is keyed by document.
    controllerRef.current ??= createAutosaveController({
      initialSavedAt,
      delayMs,
      save: (content) => saveDocumentContentAction(documentId, content),
      getContent: () => {
        const content = getContentRef.current();
        return content ? JSON.stringify(content) : null;
      },
      onChange: setSnapshot,
    });
    const controller = controllerRef.current;
    controller.attach();
    return () => controller.detach();
  }, [documentId, initialSavedAt, delayMs]);

  const markDirty = useCallback(() => controllerRef.current?.markDirty(), []);
  const saveNow = useCallback(async () => controllerRef.current?.flush(), []);

  /** Saves pending edits and waits for any save in flight; true if everything is saved. */
  const saveAndConfirm = useCallback(async (): Promise<boolean> => {
    const controller = controllerRef.current;
    if (!controller) return false;
    await controller.flush();
    const deadline = Date.now() + SAVE_WAIT_MS;
    while (controller.getSnapshot().status === "saving" && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return controller.getSnapshot().status === "saved";
  }, []);

  const hasUnsavedChanges = snapshot.status !== "saved";

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  return {
    status: snapshot.status,
    error: snapshot.error,
    retryable: snapshot.retryable,
    lastSavedAt: snapshot.lastSavedAt,
    hasUnsavedChanges,
    markDirty,
    saveNow,
    saveAndConfirm,
  };
}
