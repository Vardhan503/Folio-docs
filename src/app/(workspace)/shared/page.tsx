import { Suspense } from "react";
import type { Metadata } from "next";
import { DocumentDashboard } from "@/components/documents/DocumentDashboard";
import { listSharedDocuments } from "@/lib/data/sharing";

export const metadata: Metadata = {
  title: "Shared With Me",
};

export default function SharedWithMePage() {
  return (
    <Suspense
      fallback={
        <DocumentDashboard view="shared" ownedDocuments={[]} sharedDocuments={[]} isLoading />
      }
    >
      <SharedDocuments />
    </Suspense>
  );
}

async function SharedDocuments() {
  const documents = await listSharedDocuments();

  return (
    <DocumentDashboard
      view="shared"
      ownedDocuments={[]}
      sharedDocuments={documents.ok ? documents.data : []}
      sharedLoadError={documents.ok ? null : documents.error}
    />
  );
}
