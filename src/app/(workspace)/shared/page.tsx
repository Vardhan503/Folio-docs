import type { Metadata } from "next";
import { DocumentDashboard } from "@/components/documents/DocumentDashboard";

export const metadata: Metadata = {
  title: "Shared With Me",
};

export default function SharedWithMePage() {
  return (
    <DocumentDashboard view="shared" ownedDocuments={[]} sharedDocuments={[]} />
  );
}
