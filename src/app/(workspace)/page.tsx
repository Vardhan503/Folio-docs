import { Suspense } from "react";
import type { Metadata } from "next";
import { DocumentDashboard } from "@/components/documents/DocumentDashboard";
import { buildAccountSummary } from "@/lib/account";
import { getCurrentUser } from "@/lib/auth/session";
import { listOwnedDocuments } from "@/lib/data/documents";
import { getCurrentProfile } from "@/lib/data/profiles";

export const metadata: Metadata = {
  title: "My Documents",
};

export default function MyDocumentsPage() {
  return (
    <Suspense
      fallback={
        <DocumentDashboard
          view="my-documents"
          ownedDocuments={[]}
          sharedDocuments={[]}
          isLoading
        />
      }
    >
      <MyDocuments />
    </Suspense>
  );
}

async function MyDocuments() {
  const [user, profileResult] = await Promise.all([
    getCurrentUser(),
    getCurrentProfile(),
  ]);
  const profile = profileResult.ok ? profileResult.data : null;
  const { displayName } = buildAccountSummary(
    profile?.display_name,
    profile?.email ?? user.email,
  );

  const documents = await listOwnedDocuments(displayName);

  return (
    <DocumentDashboard
      view="my-documents"
      ownedDocuments={documents.ok ? documents.data : []}
      ownedLoadError={documents.ok ? null : documents.error}
      sharedDocuments={[]}
    />
  );
}
