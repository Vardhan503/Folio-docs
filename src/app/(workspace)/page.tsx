import type { Metadata } from "next";
import { DocumentDashboard } from "@/components/documents/DocumentDashboard";

export const metadata: Metadata = {
  title: "My Documents",
};

export default function MyDocumentsPage() {
  return (
    <DocumentDashboard view="my-documents" ownedDocuments={[]} sharedDocuments={[]} />
  );
}
