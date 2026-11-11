import type { ReactNode } from "react";
import { FilePlus, FileText, Inbox, Upload, Users } from "lucide-react";
import { DocumentSection } from "@/components/documents/DocumentSection";
import { EmptyState } from "@/components/documents/EmptyState";
import type { DocumentSummary } from "@/types/document";

export type DashboardView = "my-documents" | "shared";

type DocumentDashboardProps = {
  view: DashboardView;
  ownedDocuments: DocumentSummary[];
  sharedDocuments: DocumentSummary[];
  ownedLoadError?: string | null;
  /** Renders placeholder rows while document data streams in. */
  isLoading?: boolean;
};

const viewCopy: Record<DashboardView, { title: string; description: string }> =
  {
    "my-documents": {
      title: "My Documents",
      description: "Documents you own, plus a quick look at what others have shared with you.",
    },
    shared: {
      title: "Shared With Me",
      description: "Documents other people have shared with you.",
    },
  };

const UPCOMING_ACTIONS_NOTE_ID = "upcoming-actions-note";

export function DocumentDashboard({
  view,
  ownedDocuments,
  sharedDocuments,
  ownedLoadError,
  isLoading = false,
}: DocumentDashboardProps) {
  const copy = viewCopy[view];
  const showOwned = view === "my-documents";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-8">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">
            {copy.title}
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-ink-muted">
            {copy.description}
          </p>
        </div>

        {showOwned ? (
          <div className="flex shrink-0 flex-col gap-2 md:items-end">
            <div className="flex flex-wrap gap-2 md:flex-nowrap">
              <UpcomingActionButton
                icon={<Upload aria-hidden="true" className="size-4" />}
                label="Import File"
                variant="secondary"
              />
              <UpcomingActionButton
                icon={<FilePlus aria-hidden="true" className="size-4" />}
                label="Create Document"
                variant="primary"
              />
            </div>
            <p id={UPCOMING_ACTIONS_NOTE_ID} className="text-xs text-ink-subtle">
              Creating and importing documents are coming soon.
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-8 flex flex-col gap-6">
        {showOwned ? (
          <DocumentSection
            id="owned-documents"
            title="Owned by you"
            description="Documents you create or import."
            icon={FileText}
            tone="owned"
            documents={ownedDocuments}
            errorMessage={ownedLoadError}
            isLoading={isLoading}
            emptyState={
              <EmptyState
                icon={FileText}
                title="No documents yet"
                description="When you create or import a document, it will appear here with its title, owner, and when it was last edited."
              />
            }
          />
        ) : null}

        <DocumentSection
          id="shared-documents"
          title="Shared with you"
          description="Documents owned by other people that you can access."
          icon={Users}
          tone="shared"
          documents={sharedDocuments}
          emptyState={
            <EmptyState
              icon={Inbox}
              size={showOwned ? "compact" : "default"}
              title="Nothing shared with you yet"
              description="Sharing isn't available yet. Once it is, documents other people share with you will show up here."
            />
          }
        />
      </div>
    </div>
  );
}

type UpcomingActionButtonProps = {
  icon: ReactNode;
  label: string;
  variant: "primary" | "secondary";
};

function UpcomingActionButton({ icon, label, variant }: UpcomingActionButtonProps) {
  const variantStyles =
    variant === "primary"
      ? "bg-accent text-white disabled:bg-accent/55"
      : "border border-line-strong bg-surface text-ink disabled:text-ink-muted";

  return (
    <button
      type="button"
      disabled
      aria-describedby={UPCOMING_ACTIONS_NOTE_ID}
      className={`inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium shadow-sm disabled:cursor-not-allowed ${variantStyles}`}
    >
      {icon}
      {label}
      <span
        className={`rounded px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase ${
          variant === "primary" ? "bg-white/20 text-white" : "bg-canvas text-ink-subtle"
        }`}
      >
        Soon
      </span>
    </button>
  );
}
