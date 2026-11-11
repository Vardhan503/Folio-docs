import { DocumentMessage } from "@/components/editor/DocumentEditorStates";

export default function DocumentNotFound() {
  return (
    <DocumentMessage
      title="Document not found"
      description="This document doesn't exist, was deleted, or you don't have access to it."
    />
  );
}
