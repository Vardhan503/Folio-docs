import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { DocumentEditor } from "@/components/editor/DocumentEditor";
import {
  DocumentEditorSkeleton,
  DocumentMessage,
} from "@/components/editor/DocumentEditorStates";
import { getDocumentById } from "@/lib/data/documents";
import { validateDocumentContent } from "@/lib/documents/validation";

export const metadata: Metadata = {
  title: "Document",
};

export default function DocumentPage({
  params,
}: PageProps<"/documents/[documentId]">) {
  return (
    <Suspense fallback={<DocumentEditorSkeleton />}>
      <DocumentLoader params={params} />
    </Suspense>
  );
}

async function DocumentLoader({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const result = await getDocumentById(documentId);

  if (!result.ok) {
    if (result.code === "not_found") notFound();
    return (
      <DocumentMessage
        icon={AlertTriangle}
        title="We couldn't open this document"
        description={result.error}
      />
    );
  }

  const content = validateDocumentContent(result.data.content);
  if (!content.ok) {
    return (
      <DocumentMessage
        icon={AlertTriangle}
        title="This document can't be edited"
        description="Its saved content is in a format Folio doesn't support, so it was not opened to avoid overwriting it."
      />
    );
  }

  return (
    <DocumentEditor
      // Remount when access changes, e.g. an editor reopening after being made a viewer.
      key={`${result.data.id}:${result.data.role}`}
      documentId={result.data.id}
      initialTitle={result.data.title}
      initialContent={content.value}
      initialUpdatedAt={result.data.updated_at}
      role={result.data.role}
    />
  );
}
