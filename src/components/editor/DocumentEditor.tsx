"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import {
  EditorContent,
  useEditor,
  type Editor,
  type JSONContent,
} from "@tiptap/react";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { DocumentTitleInput } from "@/components/editor/DocumentTitleInput";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { createEditorExtensions } from "@/components/editor/extensions";
import { SaveStatusIndicator } from "@/components/editor/SaveStatusIndicator";
import { useAutosave } from "@/components/editor/useAutosave";
import type { TiptapDocument } from "@/lib/documents/validation";

type DocumentEditorProps = {
  documentId: string;
  initialTitle: string;
  initialContent: TiptapDocument;
  initialUpdatedAt: string;
};

const LEAVE_WARNING =
  "Some changes haven't been saved yet. Leave this document anyway?";

export function DocumentEditor({
  documentId,
  initialTitle,
  initialContent,
  initialUpdatedAt,
}: DocumentEditorProps) {
  const editorRef = useRef<Editor | null>(null);
  const getContent = useCallback((): JSONContent | null => {
    const current = editorRef.current;
    if (!current || current.isDestroyed) return null;
    return current.getJSON();
  }, []);

  const { status, error, lastSavedAt, hasUnsavedChanges, markDirty, saveNow } =
    useAutosave({ documentId, initialSavedAt: initialUpdatedAt, getContent });

  const editor = useEditor({
    immediatelyRender: false,
    extensions: createEditorExtensions(),
    content: initialContent,
    editorProps: {
      attributes: {
        id: "document-content",
        class: "folio-editor",
        "aria-label": "Document content",
        "aria-multiline": "true",
        role: "textbox",
      },
    },
    onUpdate: () => markDirty(),
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveNow();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveNow]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          onNavigate={(event) => {
            if (hasUnsavedChanges && !window.confirm(LEAVE_WARNING)) {
              event.preventDefault();
            }
          }}
          className="-ml-2 inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-ink-muted hover:bg-black/[0.04] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          <span>
            Back<span className="hidden sm:inline"> to Documents</span>
          </span>
        </Link>
        <SaveStatusIndicator
          status={status}
          error={error}
          lastSavedAt={lastSavedAt}
          onRetry={() => void saveNow()}
        />
      </div>

      <div className="mt-4">
        <DocumentTitleInput documentId={documentId} initialTitle={initialTitle} />
      </div>

      {status === "error" && error ? (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>
            {error} Your edits are still here. Keep this tab open and use Retry.
          </p>
        </div>
      ) : null}

      <div className="sticky top-[109px] z-10 mt-4 bg-canvas/95 py-2 backdrop-blur supports-[backdrop-filter]:bg-canvas/80 sm:top-[61px]">
        {editor ? (
          <EditorToolbar editor={editor} />
        ) : (
          <div aria-hidden="true" className="h-[42px] rounded-xl border border-line bg-surface" />
        )}
      </div>

      <div className="mx-auto mt-3 mb-12 w-full max-w-[816px] rounded-xl border border-line bg-white shadow-[0_1px_3px_rgba(28,27,25,0.06)]">
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <EditorCanvasPlaceholder />
        )}
      </div>
    </div>
  );
}

function EditorCanvasPlaceholder() {
  return (
    <div
      role="status"
      aria-label="Loading editor"
      className="folio-editor flex flex-col gap-3"
    >
      <span className="h-4 w-3/4 rounded bg-line/70" />
      <span className="h-4 w-full rounded bg-line/70" />
      <span className="h-4 w-5/6 rounded bg-line/70" />
    </div>
  );
}
