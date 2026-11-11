"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { saveDocumentTitleAction } from "@/lib/documents/actions";
import { MAX_TITLE_LENGTH, validateTitle } from "@/lib/documents/validation";

type DocumentTitleInputProps = {
  documentId: string;
  initialTitle: string;
};

const NETWORK_ERROR = "We couldn't reach the server to rename this document.";

export function DocumentTitleInput({
  documentId,
  initialTitle,
}: DocumentTitleInputProps) {
  const [value, setValue] = useState(initialTitle);
  const [savedTitle, setSavedTitle] = useState(initialTitle);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    document.title = `${savedTitle} · Folio`;
  }, [savedTitle]);

  async function commit(nextValue: string) {
    if (savingRef.current) return;

    const validated = validateTitle(nextValue);
    if (!validated.ok) {
      setValue(savedTitle);
      setError(`${validated.error} The previous title was kept.`);
      return;
    }

    setValue(validated.value);
    if (validated.value === savedTitle) {
      setError(null);
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    setError(null);

    let result: Awaited<ReturnType<typeof saveDocumentTitleAction>>;
    try {
      result = await saveDocumentTitleAction(documentId, validated.value);
    } catch {
      result = { ok: false, code: "server_error", error: NETWORK_ERROR };
    }

    savingRef.current = false;
    setIsSaving(false);
    if (result.ok) {
      setSavedTitle(result.data.title);
    } else {
      setError(result.error);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      setValue(savedTitle);
      setError(null);
      // Blurring right away would commit the stale value before the reset renders.
      requestAnimationFrame(() => (event.target as HTMLInputElement).blur());
    }
  }

  const hasUnsavedTitle = error !== null && value !== savedTitle;

  return (
    <div className="min-w-0">
      <label htmlFor="document-title" className="sr-only">
        Document title
      </label>
      <div className="flex items-center gap-2">
        <input
          id="document-title"
          value={value}
          maxLength={MAX_TITLE_LENGTH}
          onChange={(event) => setValue(event.target.value)}
          onBlur={(event) => void commit(event.target.value)}
          onKeyDown={handleKeyDown}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "document-title-error" : undefined}
          autoComplete="off"
          spellCheck={false}
          className="-mx-2 w-full min-w-0 truncate rounded-lg border border-transparent bg-transparent px-2 py-1 text-xl font-semibold tracking-tight text-ink hover:border-line focus-visible:border-line-strong focus-visible:bg-surface focus-visible:outline-none sm:text-2xl"
        />
        {isSaving ? (
          <Loader2
            aria-label="Saving title"
            className="size-4 shrink-0 animate-spin text-ink-subtle"
          />
        ) : null}
      </div>
      {error ? (
        <p
          id="document-title-error"
          role="alert"
          className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-red-700"
        >
          <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
          <span>{error}</span>
          {hasUnsavedTitle ? (
            <button
              type="button"
              onClick={() => void commit(value)}
              className="rounded font-medium underline underline-offset-2 hover:text-red-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Retry
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
