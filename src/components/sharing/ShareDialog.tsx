"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { AlertCircle, Check, Loader2, Share2, UserRound, X } from "lucide-react";
import type { Collaborator } from "@/lib/data/sharing";
import {
  listCollaboratorsAction,
  revokeDocumentAccessAction,
  shareDocumentAction,
  updateSharePermissionAction,
  type SharingChangeResult,
} from "@/lib/sharing/actions";
import {
  ROLE_LABELS,
  SHARE_ROLES,
  validateEmail,
  type ShareRole,
} from "@/lib/sharing/roles";

const NETWORK_ERROR = "We couldn't reach the server. Check your connection, then try again.";

const fieldClass =
  "h-9 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/30 disabled:cursor-not-allowed disabled:opacity-60";

type ShareButtonProps = { documentId: string };

/** Owner-only entry point; the server re-checks ownership on every request. */
export function ShareButton({ documentId }: ShareButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();

  // When the page is hidden (navigating away keeps it mounted), close the modal:
  // an open modal dialog would leave the visible page inert.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    return () => dialog?.close();
  }, []);

  function open() {
    setIsOpen(true);
    dialogRef.current?.showModal();
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-white shadow-sm hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Share2 aria-hidden="true" className="size-4" />
        Share
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setIsOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/30"
      >
        {isOpen ? (
          <SharePanel
            documentId={documentId}
            titleId={titleId}
            onClose={() => dialogRef.current?.close()}
          />
        ) : null}
      </dialog>
    </>
  );
}

type SharePanelProps = {
  documentId: string;
  titleId: string;
  onClose: () => void;
};

function SharePanel({ documentId, titleId, onClose }: SharePanelProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("viewer");
  const [isSharing, setIsSharing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [confirmingUserId, setConfirmingUserId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ userId: string; message: string } | null>(null);
  // One sharing request at a time, even if a click lands before React re-renders.
  const busyRef = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const emailId = useId();
  const roleId = useId();
  const formErrorId = useId();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const result = await listCollaboratorsAction(documentId);
      if (result.ok) setCollaborators(result.data);
      else setLoadError(result.error);
    } catch {
      setLoadError(NETWORK_ERROR);
    }
  }, [documentId]);

  useEffect(() => {
    let cancelled = false;
    listCollaboratorsAction(documentId)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setCollaborators(result.data);
        else setLoadError(result.error);
      })
      .catch(() => {
        if (!cancelled) setLoadError(NETWORK_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  /** Runs one sharing change; returns the server result, or null if another change is running. */
  async function runChange(
    request: () => Promise<SharingChangeResult>,
  ): Promise<SharingChangeResult | null> {
    if (busyRef.current) return null;
    busyRef.current = true;
    let result: SharingChangeResult;
    try {
      result = await request();
    } catch {
      result = { ok: false, code: "server_error", error: NETWORK_ERROR };
    }
    busyRef.current = false;
    if (result.ok) {
      if (result.data.collaborators) setCollaborators(result.data.collaborators);
      else void load();
    }
    return result;
  }

  async function handleShare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    setNotice(null);
    const validated = validateEmail(email);
    if (!validated.ok) {
      setFormError(validated.error);
      return;
    }

    setFormError(null);
    setIsSharing(true);
    const result = await runChange(() => shareDocumentAction(documentId, validated.value, role));
    setIsSharing(false);
    if (!result) return;
    if (result.ok) {
      setEmail("");
      setNotice(`Shared with ${validated.value} as ${ROLE_LABELS[role].toLowerCase()}.`);
    } else {
      setFormError(result.error);
    }
  }

  async function handleRoleChange(collaborator: Collaborator, nextRole: ShareRole) {
    if (nextRole === collaborator.role) return;
    setNotice(null);
    setRowError(null);
    setBusyUserId(collaborator.userId);
    const result = await runChange(() =>
      updateSharePermissionAction(documentId, collaborator.userId, nextRole),
    );
    setBusyUserId(null);
    if (!result) return;
    if (result.ok) {
      setNotice(`${collaborator.displayName} is now ${nextRole === "editor" ? "an editor" : "a viewer"}.`);
    } else {
      setRowError({ userId: collaborator.userId, message: result.error });
      if (result.code === "not_found") void load();
    }
  }

  async function handleRevoke(collaborator: Collaborator) {
    setNotice(null);
    setRowError(null);
    setBusyUserId(collaborator.userId);
    const result = await runChange(() =>
      revokeDocumentAccessAction(documentId, collaborator.userId),
    );
    setBusyUserId(null);
    setConfirmingUserId(null);
    if (!result) return;
    if (result.ok) {
      setNotice(`Removed access for ${collaborator.displayName}.`);
      // The row (and the focused button) is gone; keep focus inside the dialog.
      emailRef.current?.focus();
    } else {
      setRowError({ userId: collaborator.userId, message: result.error });
    }
  }

  const isBusy = isSharing || busyUserId !== null;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <h2 id={titleId} className="text-base font-semibold text-ink">
            Share document
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            Add people who already have a Folio account.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mt-1 -mr-2 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-black/[0.04] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>

      <form onSubmit={handleShare} noValidate className="border-b border-line px-5 py-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="min-w-0 flex-1">
            <label htmlFor={emailId} className="sr-only">
              Email address
            </label>
            <input
              ref={emailRef}
              id={emailId}
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="name@example.com"
              autoFocus
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (formError) setFormError(null);
              }}
              readOnly={isSharing}
              aria-invalid={formError ? true : undefined}
              aria-describedby={formError ? formErrorId : undefined}
              className={`${fieldClass} w-full`}
            />
          </div>
          <div className="flex gap-2">
            <label htmlFor={roleId} className="sr-only">
              Permission
            </label>
            <select
              id={roleId}
              value={role}
              onChange={(event) => setRole(event.target.value as ShareRole)}
              disabled={isSharing}
              className={`${fieldClass} flex-1 pr-8 sm:flex-none`}
            >
              {SHARE_ROLES.map((option) => (
                <option key={option} value={option}>
                  {ROLE_LABELS[option]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={isBusy}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-medium text-white shadow-sm hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-80"
            >
              {isSharing ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
              {isSharing ? "Sharing…" : "Share"}
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-subtle">
          Viewers can read. Editors can also edit and rename. Only you can manage access.
        </p>
        {formError ? (
          <p id={formErrorId} role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-red-700">
            <AlertCircle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            {formError}
          </p>
        ) : null}
        <p role="status" className={notice ? "mt-2 flex items-start gap-1.5 text-xs text-emerald-700" : "sr-only"}>
          {notice ? <Check aria-hidden="true" className="mt-px size-3.5 shrink-0" /> : null}
          {notice}
        </p>
      </form>

      <div className="px-5 py-4">
        <h3 className="text-xs font-medium tracking-wide text-ink-subtle uppercase">
          People with access
        </h3>
        <ul className="mt-2 divide-y divide-line" aria-busy={collaborators === null && !loadError}>
          <li className="flex items-center gap-3 py-2.5">
            <Avatar />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">You</span>
            <span className="text-xs text-ink-muted">Owner</span>
          </li>
          {collaborators?.map((collaborator) => (
            <CollaboratorRow
              key={collaborator.userId}
              collaborator={collaborator}
              isBusy={busyUserId === collaborator.userId}
              isDisabled={isBusy}
              isConfirming={confirmingUserId === collaborator.userId}
              error={rowError?.userId === collaborator.userId ? rowError.message : null}
              onRoleChange={(nextRole) => void handleRoleChange(collaborator, nextRole)}
              onRequestRevoke={() => {
                setRowError(null);
                setConfirmingUserId(collaborator.userId);
              }}
              onCancelRevoke={() => setConfirmingUserId(null)}
              onConfirmRevoke={() => void handleRevoke(collaborator)}
            />
          ))}
        </ul>
        {collaborators === null && !loadError ? (
          <p role="status" className="flex items-center gap-2 py-2 text-sm text-ink-muted">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Loading people with access…
          </p>
        ) : null}
        {loadError ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 py-2 text-sm text-red-700">
            <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
            <span>{loadError}</span>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded font-medium underline underline-offset-2 hover:text-red-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Retry
            </button>
          </div>
        ) : null}
        {collaborators?.length === 0 ? (
          <p className="py-2 text-sm text-ink-muted">Not shared with anyone yet.</p>
        ) : null}
        <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
          Removing access stops someone from opening or saving this document from then on. It
          can&apos;t remove a copy that&apos;s already open in their browser.
        </p>
      </div>
    </div>
  );
}

type CollaboratorRowProps = {
  collaborator: Collaborator;
  isBusy: boolean;
  isDisabled: boolean;
  isConfirming: boolean;
  error: string | null;
  onRoleChange: (role: ShareRole) => void;
  onRequestRevoke: () => void;
  onCancelRevoke: () => void;
  onConfirmRevoke: () => void;
};

function CollaboratorRow({
  collaborator,
  isBusy,
  isDisabled,
  isConfirming,
  error,
  onRoleChange,
  onRequestRevoke,
  onCancelRevoke,
  onConfirmRevoke,
}: CollaboratorRowProps) {
  const selectId = useId();
  const { displayName, email } = collaborator;

  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Avatar />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{displayName}</p>
          {email && email !== displayName ? (
            <p className="truncate text-xs text-ink-muted">{email}</p>
          ) : null}
        </div>
        {isConfirming ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-muted">Remove access?</span>
            <button
              type="button"
              onClick={onConfirmRevoke}
              disabled={isDisabled}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-red-600 px-2.5 text-xs font-medium text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-wait disabled:opacity-80"
            >
              {isBusy ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : null}
              Remove
            </button>
            <button
              type="button"
              // The Remove button that had focus was replaced by this prompt.
              autoFocus
              onClick={onCancelRevoke}
              disabled={isBusy}
              className="inline-flex h-8 items-center rounded-lg border border-line-strong bg-surface px-2.5 text-xs font-medium text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {isBusy ? (
              <Loader2 aria-label="Updating" className="size-4 animate-spin text-ink-subtle" />
            ) : null}
            <label htmlFor={selectId} className="sr-only">
              Permission for {displayName}
            </label>
            <select
              id={selectId}
              value={collaborator.role}
              onChange={(event) => onRoleChange(event.target.value as ShareRole)}
              disabled={isDisabled}
              className={`${fieldClass} h-8 pr-8 text-xs`}
            >
              {SHARE_ROLES.map((option) => (
                <option key={option} value={option}>
                  {ROLE_LABELS[option]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onRequestRevoke}
              disabled={isDisabled}
              aria-label={`Remove access for ${displayName}`}
              className="inline-flex h-8 items-center rounded-lg px-2 text-xs font-medium text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        )}
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 flex items-start gap-1.5 pl-11 text-xs text-red-700">
          <AlertCircle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </li>
  );
}

function Avatar() {
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
    >
      <UserRound className="size-4" />
    </span>
  );
}
