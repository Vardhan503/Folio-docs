"use client";

import { useActionState, useEffect, useRef, type FormEvent } from "react";
import { AlertCircle, FilePlus, Loader2 } from "lucide-react";
import {
  createDocumentAction,
  type CreateDocumentState,
} from "@/lib/documents/actions";

const initialState: CreateDocumentState = { error: null };

export function CreateDocumentButton() {
  const [state, formAction, isPending] = useActionState(
    createDocumentAction,
    initialState,
  );
  // React queues repeat submissions instead of dropping them, so block them here.
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!isPending) submittingRef.current = false;
  }, [isPending, state]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (submittingRef.current) {
      event.preventDefault();
      return;
    }
    submittingRef.current = true;
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="contents">
      <button
        type="submit"
        disabled={isPending}
        aria-describedby={state.error ? "create-document-error" : undefined}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-medium text-white shadow-sm hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-80"
      >
        {isPending ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <FilePlus aria-hidden="true" className="size-4" />
        )}
        {isPending ? "Creating…" : "Create Document"}
      </button>
      {state.error && !isPending ? (
        <p
          id="create-document-error"
          role="alert"
          className="flex basis-full items-center gap-1.5 text-xs text-red-700 md:justify-end"
        >
          <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
