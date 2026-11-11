"use client";

import { AlertCircle, Check, Circle, Loader2, RotateCw } from "lucide-react";
import type { SaveStatus } from "@/components/editor/useAutosave";
import { useIsClient } from "@/lib/use-is-client";

type SaveStatusIndicatorProps = {
  status: SaveStatus;
  error: string | null;
  lastSavedAt: string;
  onRetry: () => void;
};

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

export function SaveStatusIndicator({
  status,
  error,
  lastSavedAt,
  onRetry,
}: SaveStatusIndicatorProps) {
  const isClient = useIsClient();

  return (
    <div className="flex min-w-0 items-center gap-2 text-xs sm:text-sm">
      <p
        role="status"
        aria-live="polite"
        className={`flex min-w-0 items-center gap-1.5 ${
          status === "error" ? "text-red-700" : "text-ink-muted"
        }`}
      >
        {status === "saving" ? (
          <>
            <Loader2 aria-hidden="true" className="size-3.5 shrink-0 animate-spin" />
            Saving…
          </>
        ) : status === "unsaved" ? (
          <>
            <Circle aria-hidden="true" className="size-2.5 shrink-0 fill-amber-500 text-amber-500" />
            Unsaved changes
          </>
        ) : status === "error" ? (
          <>
            <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate" title={error ?? undefined}>
              Save failed
              <span className="sr-only">: {error}</span>
            </span>
          </>
        ) : (
          <>
            <Check aria-hidden="true" className="size-3.5 shrink-0 text-emerald-600" />
            <span className="truncate">
              All changes saved
              {isClient ? (
                <span className="hidden text-ink-subtle sm:inline">
                  {" · "}
                  {timeFormatter.format(new Date(lastSavedAt))}
                </span>
              ) : null}
            </span>
          </>
        )}
      </p>
      {status === "error" ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line-strong bg-surface px-2 py-1 text-xs font-medium text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <RotateCw aria-hidden="true" className="size-3.5" />
          Retry
        </button>
      ) : null}
    </div>
  );
}
