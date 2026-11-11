"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import {
  EditorContent,
  useEditor,
  type Editor,
  type JSONContent,
} from "@tiptap/react";
import { AlertCircle, ArrowLeft, Eye, PencilLine } from "lucide-react";
import { DocumentTitleInput } from "@/components/editor/DocumentTitleInput";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { createEditorExtensions } from "@/components/editor/extensions";
import { SaveStatusIndicator } from "@/components/editor/SaveStatusIndicator";
import { useAutosave } from "@/components/editor/useAutosave";
import { ShareButton } from "@/components/sharing/ShareDialog";
import type { TiptapDocument } from "@/lib/documents/validation";
import { canEdit, type DocumentRole } from "@/lib/sharing/roles";

type DocumentEditorProps = {
  documentId: string;
  initialTitle: string;
  initialContent: TiptapDocument;
  initialUpdatedAt: string;
  /** Decided on the server; every save is re-checked by the server and database. */
  role: DocumentRole;
};

const LEAVE_WARNING =
  "Some changes haven't been saved yet. Leave this document anyway?";

export function DocumentEditor({
  documentId,
  initialTitle,
  initialContent,
  initialUpdatedAt,
  role,
}: DocumentEditorProps) {
  const isEditable = canEdit(role);
  const isOwner = role === "owner";
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
    editable: isEditable,
    editorProps: {
      attributes: {
        id: "document-content",
        class: "folio-editor",
        "aria-label": "Document content",
        "aria-multiline": "true",
        "aria-readonly": isEditable ? "false" : "true",
        role: "textbox",
      },
    },
    onUpdate: () => {
      if (isEditable) markDirty();
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!isEditable) return;
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveNow();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEditable, saveNow]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <Link
          href={isOwner ? "/" : "/shared"}
          onNavigate={(event) => {
            if (hasUnsavedChanges && !window.confirm(LEAVE_WARNING)) {
              event.preventDefault();
            }
          }}
          className="-ml-2 inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-ink-muted hover:bg-black/[0.04] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          <span>
            Back<span className="hidden sm:inline"> to {isOwner ? "Documents" : "Shared With Me"}</span>
          </span>
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          {isEditable ? (
            <SaveStatusIndicator
              status={status}
              error={error}
              lastSavedAt={lastSavedAt}
              onRetry={() => void saveNow()}
            />
          ) : null}
          {role === "editor" ? (
            <AccessBadge icon={PencilLine} label="Editor" />
          ) : role === "viewer" ? (
            <AccessBadge icon={Eye} label="View only" />
          ) : null}
          {isOwner ? <ShareButton documentId={documentId} /> : null}
        </div>
      </div>

      <div className="mt-4">
        <DocumentTitleInput
          documentId={documentId}
          initialTitle={initialTitle}
          readOnly={!isEditable}
        />
      </div>

      {!isEditable ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink-muted">
          <Eye aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          You can read this document but not change it. Ask the owner for edit access.
        </p>
      ) : null}

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

      {isEditable ? (
        <div className="sticky top-[109px] z-10 mt-4 bg-canvas/95 py-2 backdrop-blur supports-[backdrop-filter]:bg-canvas/80 sm:top-[61px]">
          {editor ? (
            <EditorToolbar editor={editor} />
          ) : (
            <div aria-hidden="true" className="h-[42px] rounded-xl border border-line bg-surface" />
          )}
        </div>
      ) : null}

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

function AccessBadge({ icon: Icon, label }: { icon: typeof Eye; label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-muted">
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </span>
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
