"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Copy,
  Download,
  Link2,
  Loader2,
  MoreHorizontal,
  PencilLine,
  Trash2,
} from "lucide-react";
import { useNotice } from "@/components/feedback/NoticeProvider";
import {
  deleteDocumentAction,
  duplicateDocumentAction,
  exportDocumentAction,
} from "@/lib/documents/actions";
import { EXPORT_FORMATS, type ExportFormat } from "@/lib/documents/export-formats";
import {
  canCopyOrExport,
  canDelete,
  canEdit,
  type DocumentRole,
} from "@/lib/sharing/roles";

const NETWORK_ERROR = "We couldn't reach the server. Check your connection, then try again.";
const UNSAVED_NOTE = "Your latest edits weren't saved yet, so this uses the last saved version.";

type DocumentActionsMenuProps = {
  documentId: string;
  /** The last saved title, used in messages and the delete confirmation. */
  title: string;
  role: DocumentRole;
  /** Saves pending edits first; resolves false if something is still unsaved. */
  saveFirst: () => Promise<boolean>;
  onRename: () => void;
};

type Pending = "copy" | ExportFormat | null;

/** Document-level actions; the server re-checks the caller's role for each one. */
export function DocumentActionsMenu({
  documentId,
  title,
  role,
  saveFirst,
  onRename,
}: DocumentActionsMenuProps) {
  const router = useRouter();
  const { notify } = useNotice();
  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  function menuItems() {
    return Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ??
        [],
    );
  }

  function open(focus: "first" | "last" | null) {
    setIsOpen(true);
    if (!focus) return;
    requestAnimationFrame(() => {
      const items = menuItems();
      (focus === "first" ? items[0] : items.at(-1))?.focus();
    });
  }

  function close({ restoreFocus }: { restoreFocus: boolean }) {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      open(event.key === "ArrowDown" ? "first" : "last");
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = menuItems();
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const focusAt = (next: number) => items[(next + items.length) % items.length]?.focus();

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(items.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        close({ restoreFocus: true });
        break;
      case "Tab":
        setIsOpen(false);
        break;
    }
  }

  function run(action: () => void | Promise<void>) {
    close({ restoreFocus: true });
    void action();
  }

  async function makeCopy() {
    setPending("copy");
    const saved = await saveFirst();
    let result: Awaited<ReturnType<typeof duplicateDocumentAction>>;
    try {
      result = await duplicateDocumentAction(documentId);
    } catch {
      result = { ok: false, code: "server_error", error: NETWORK_ERROR };
    }
    setPending(null);
    if (!result.ok) {
      notify(result.error, "error");
      return;
    }
    notify(
      `Created “${result.data.title}”. You're now editing the copy.${saved ? "" : ` ${UNSAVED_NOTE}`}`,
    );
    router.push(`/documents/${result.data.id}`);
  }

  async function download(format: ExportFormat) {
    setPending(format);
    const saved = await saveFirst();
    let result: Awaited<ReturnType<typeof exportDocumentAction>>;
    try {
      result = await exportDocumentAction(documentId, format);
    } catch {
      result = { ok: false, code: "server_error", error: NETWORK_ERROR };
    }
    setPending(null);
    if (!result.ok) {
      notify(result.error, "error");
      return;
    }

    const url = URL.createObjectURL(new Blob([result.data.text], { type: result.data.mimeType }));
    const link = document.createElement("a");
    link.href = url;
    link.download = result.data.filename;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(`Downloaded ${result.data.filename}.${saved ? "" : ` ${UNSAVED_NOTE}`}`);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/documents/${documentId}`);
      notify("Link copied. Only people this document is shared with can open it.");
    } catch {
      notify("We couldn't copy the link. Copy it from the address bar instead.", "error");
    }
  }

  const isBusy = pending !== null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => (isOpen ? close({ restoreFocus: false }) : open(event.detail === 0 ? "first" : null))}
        onKeyDown={handleTriggerKeyDown}
        aria-label="Document actions"
        title="Document actions"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-busy={isBusy || undefined}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted hover:bg-black/[0.04] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {isBusy ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <MoreHorizontal aria-hidden="true" className="size-4" />
        )}
      </button>

      {isOpen ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Document actions"
          onKeyDown={handleMenuKeyDown}
          className="absolute top-full right-0 z-30 mt-1.5 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-lg"
        >
          {canEdit(role) ? (
            <MenuItem icon={PencilLine} onSelect={() => run(onRename)}>
              Rename
            </MenuItem>
          ) : null}
          {canCopyOrExport(role) ? (
            <>
              <MenuItem icon={Copy} disabled={isBusy} onSelect={() => run(makeCopy)}>
                Make a copy
              </MenuItem>
              {(Object.keys(EXPORT_FORMATS) as ExportFormat[]).map((format) => (
                <MenuItem
                  key={format}
                  icon={Download}
                  disabled={isBusy}
                  onSelect={() => run(() => download(format))}
                >
                  Download as {EXPORT_FORMATS[format].label}
                </MenuItem>
              ))}
            </>
          ) : null}
          <MenuItem icon={Link2} onSelect={() => run(copyLink)}>
            Copy link
          </MenuItem>
          {canDelete(role) ? (
            <>
              <div role="separator" className="my-1.5 h-px bg-line" />
              <MenuItem
                icon={Trash2}
                tone="danger"
                disabled={isBusy}
                onSelect={() => {
                  setIsOpen(false);
                  deleteDialogRef.current?.showModal();
                }}
              >
                Delete…
              </MenuItem>
            </>
          ) : null}
        </div>
      ) : null}

      {canDelete(role) ? (
        <DeleteDocumentDialog
          dialogRef={deleteDialogRef}
          documentId={documentId}
          title={title}
          onCancel={() => triggerRef.current?.focus()}
          onDeleted={() => {
            notify(`Deleted “${title}”.`);
            router.replace("/");
          }}
        />
      ) : null}
    </div>
  );
}

type MenuItemProps = {
  icon: typeof Copy;
  children: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
};

function MenuItem({ icon: Icon, children, onSelect, disabled, tone = "default" }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      disabled={disabled}
      onClick={onSelect}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${
        tone === "danger"
          ? "text-red-700 hover:bg-red-50 focus:bg-red-50"
          : "text-ink hover:bg-black/[0.04] focus:bg-black/[0.04]"
      }`}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {children}
    </button>
  );
}

type DeleteDocumentDialogProps = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  documentId: string;
  title: string;
  onCancel: () => void;
  onDeleted: () => void;
};

function DeleteDocumentDialog({
  dialogRef,
  documentId,
  title,
  onCancel,
  onDeleted,
}: DeleteDocumentDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Navigating away keeps the page mounted but hidden; an open modal would leave
  // the visible page inert.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    return () => dialog?.close();
  }, [dialogRef]);

  async function confirmDelete() {
    setIsDeleting(true);
    setError(null);
    let result: Awaited<ReturnType<typeof deleteDocumentAction>>;
    try {
      result = await deleteDocumentAction(documentId);
    } catch {
      result = { ok: false, code: "server_error", error: NETWORK_ERROR };
    }
    setIsDeleting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    dialogRef.current?.close();
    onDeleted();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        if (isDeleting) event.preventDefault();
      }}
      onClose={() => {
        setError(null);
        onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/30"
    >
      <div className="px-5 pt-5 pb-4">
        <h2 id={titleId} className="text-base font-semibold break-words text-ink">
          Delete “{title}”?
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-ink-muted">
          This permanently deletes the document for you and everyone it&apos;s shared with.
          It can&apos;t be undone.
        </p>
        {error ? (
          <p role="alert" className="mt-3 flex items-start gap-1.5 text-sm text-red-700">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          autoFocus
          disabled={isDeleting}
          onClick={() => dialogRef.current?.close()}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink hover:bg-black/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isDeleting}
          onClick={() => void confirmDelete()}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-red-700 px-3.5 text-sm font-medium text-white shadow-sm hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-wait disabled:opacity-80"
        >
          {isDeleting ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
          {isDeleting ? "Deleting…" : "Delete document"}
        </button>
      </div>
    </dialog>
  );
}
