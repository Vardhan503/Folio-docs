import type { ReactNode } from "react";
import { AlertCircle, type LucideIcon } from "lucide-react";
import { DocumentList } from "@/components/documents/DocumentList";
import type { DocumentSummary } from "@/types/document";

type DocumentSectionProps = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tone: "owned" | "shared";
  documents: DocumentSummary[];
  /** Rendered in place of the list when there are no documents. */
  emptyState: ReactNode;
  /** Shown instead of the list or empty state when documents failed to load. */
  errorMessage?: string | null;
  isLoading?: boolean;
};

const toneStyles: Record<DocumentSectionProps["tone"], string> = {
  owned: "bg-accent-soft text-accent",
  shared: "bg-amber-50 text-amber-700",
};

export function DocumentSection({
  id,
  title,
  description,
  icon: Icon,
  tone,
  documents,
  emptyState,
  errorMessage,
  isLoading = false,
}: DocumentSectionProps) {
  const headingId = `${id}-heading`;
  const hasDocuments = documents.length > 0;

  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(28,27,25,0.04)]"
    >
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <span
          aria-hidden="true"
          className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${toneStyles[tone]}`}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 id={headingId} className="text-sm font-semibold text-ink">
              {title}
            </h2>
            {isLoading || errorMessage ? null : (
              <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-ink-muted tabular-nums">
                {documents.length}
                <span className="sr-only">
                  {documents.length === 1 ? " document" : " documents"}
                </span>
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
        </div>
      </div>

      {isLoading ? (
        <div role="status" aria-label={`Loading ${title.toLowerCase()}`}>
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              className="flex items-center gap-3 border-b border-line px-5 py-4 last:border-b-0"
            >
              <span className="size-4 rounded bg-line" />
              <span className="h-3 w-1/3 rounded bg-line" />
              <span className="ml-auto hidden h-3 w-20 rounded bg-line md:block" />
            </div>
          ))}
        </div>
      ) : errorMessage ? (
        <div
          role="alert"
          className="flex items-start gap-3 px-5 py-6 text-sm text-red-800"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>{errorMessage}</p>
        </div>
      ) : hasDocuments ? (
        <DocumentList documents={documents} label={title} />
      ) : (
        emptyState
      )}
    </section>
  );
}
