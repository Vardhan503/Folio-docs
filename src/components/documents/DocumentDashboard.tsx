import { FileText, Inbox, Users } from "lucide-react";
import { CreateDocumentButton } from "@/components/documents/CreateDocumentButton";
import { DocumentSection } from "@/components/documents/DocumentSection";
import { EmptyState } from "@/components/documents/EmptyState";
import { ImportFileButton } from "@/components/documents/ImportFileButton";
import { IMPORT_FORMATS_HINT } from "@/lib/import/file-rules";
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

const IMPORT_HINT_ID = "import-file-hint";
const EMPTY_IMPORT_HINT_ID = "empty-import-file-hint";

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
            <div className="flex flex-wrap gap-2 md:justify-end">
              <ImportFileButton describedBy={IMPORT_HINT_ID} />
              <CreateDocumentButton />
            </div>
            <p id={IMPORT_HINT_ID} className="text-xs text-ink-subtle">
              Import {IMPORT_FORMATS_HINT}.
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
                description="Create your first document or import a text file to get started. It will appear here with its title, owner, and when it was last edited."
              >
                <div className="flex flex-col items-center gap-2">
                  <div className="flex flex-wrap justify-center gap-2">
                    <ImportFileButton describedBy={EMPTY_IMPORT_HINT_ID} align="center" />
                  </div>
                  <p id={EMPTY_IMPORT_HINT_ID} className="text-xs text-ink-subtle">
                    {IMPORT_FORMATS_HINT}
                  </p>
                </div>
              </EmptyState>
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
