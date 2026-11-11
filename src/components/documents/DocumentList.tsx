import Link from "next/link";
import { FileText } from "lucide-react";
import { LocalDateTime } from "@/components/documents/LocalDateTime";
import { ROLE_LABELS } from "@/lib/sharing/roles";
import type { DocumentSummary } from "@/types/document";

type DocumentListProps = {
  documents: DocumentSummary[];
  /** Accessible name for the list, e.g. "Documents you own". */
  label: string;
};

const columns = "md:grid-cols-[minmax(0,1fr)_11rem_11rem]";

export function DocumentList({ documents, label }: DocumentListProps) {
  return (
    <div>
      <div
        aria-hidden="true"
        className={`hidden gap-4 border-b border-line px-5 py-2.5 text-xs font-medium text-ink-subtle md:grid ${columns}`}
      >
        <span>Title</span>
        <span>Owner</span>
        <span>Last edited</span>
      </div>
      <ul aria-label={label} className="divide-y divide-line">
        {documents.map((document) => (
          <li key={document.id}>
            <Link
              href={`/documents/${document.id}`}
              className={`grid grid-cols-[minmax(0,1fr)] gap-1 px-5 py-3.5 hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:items-center md:gap-4 ${columns}`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <FileText
                  aria-hidden="true"
                  className="size-4 shrink-0 text-accent"
                />
                <span className="truncate text-sm font-medium text-ink">
                  {document.title}
                </span>
                {document.role ? (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      document.role === "editor"
                        ? "bg-accent-soft text-accent"
                        : "bg-canvas text-ink-muted"
                    }`}
                  >
                    <span className="sr-only">Your access: </span>
                    {ROLE_LABELS[document.role]}
                  </span>
                ) : null}
              </span>
              <span className="truncate pl-7 text-xs text-ink-muted md:pl-0 md:text-sm">
                <span className="md:sr-only">Owner: </span>
                {document.owner.name}
              </span>
              <span className="pl-7 text-xs text-ink-muted md:pl-0 md:text-sm">
                <span className="md:sr-only">Last edited </span>
                <LocalDateTime iso={document.lastEditedAt} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
