import { FileText } from "lucide-react";
import { formatLastEdited } from "@/lib/format";
import type { DocumentSummary } from "@/types/document";

type DocumentListProps = {
  documents: DocumentSummary[];
  /** Accessible name for the list, e.g. "Documents you own". */
  label: string;
};

export function DocumentList({ documents, label }: DocumentListProps) {
  return (
    <div>
      <div
        aria-hidden="true"
        className="hidden grid-cols-[minmax(0,1fr)_12rem_9rem] gap-4 border-b border-line px-5 py-2.5 text-xs font-medium text-ink-subtle md:grid"
      >
        <span>Title</span>
        <span>Owner</span>
        <span>Last edited</span>
      </div>
      <ul aria-label={label} className="divide-y divide-line">
        {documents.map((document) => (
          <li
            key={document.id}
            className="grid grid-cols-[minmax(0,1fr)] gap-1 px-5 py-3.5 md:grid-cols-[minmax(0,1fr)_12rem_9rem] md:items-center md:gap-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <FileText
                aria-hidden="true"
                className="size-4 shrink-0 text-accent"
              />
              <span className="truncate text-sm font-medium text-ink">
                {document.title}
              </span>
            </div>
            <p className="truncate pl-7 text-xs text-ink-muted md:pl-0 md:text-sm">
              <span className="md:sr-only">Owner: </span>
              {document.owner.name}
            </p>
            <p className="pl-7 text-xs text-ink-muted md:pl-0 md:text-sm">
              <span className="md:sr-only">Last edited </span>
              <time dateTime={document.lastEditedAt}>
                {formatLastEdited(document.lastEditedAt)}
              </time>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
