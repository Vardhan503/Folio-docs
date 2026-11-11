import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
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
            <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-ink-muted tabular-nums">
              {documents.length}
              <span className="sr-only">
                {documents.length === 1 ? " document" : " documents"}
              </span>
            </span>
          </div>
          <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
        </div>
      </div>

      {hasDocuments ? (
        <DocumentList documents={documents} label={title} />
      ) : (
        emptyState
      )}
    </section>
  );
}
