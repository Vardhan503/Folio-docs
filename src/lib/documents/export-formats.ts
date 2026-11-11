/** Kept apart from export.ts so client code can use it without the Markdown serializer. */
export type ExportFormat = "txt" | "md";

export const EXPORT_FORMATS: Record<ExportFormat, { label: string; mimeType: string }> = {
  txt: { label: "plain text (.txt)", mimeType: "text/plain;charset=utf-8" },
  md: { label: "Markdown (.md)", mimeType: "text/markdown;charset=utf-8" },
};

export function isExportFormat(value: unknown): value is ExportFormat {
  return value === "txt" || value === "md";
}
