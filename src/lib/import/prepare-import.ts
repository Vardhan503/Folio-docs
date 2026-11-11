import type { TiptapDocument, ValidationResult } from "@/lib/documents/validation";
import { convertImportedText } from "@/lib/import/convert";
import {
  IMPORT_ERRORS,
  MAX_IMPORT_BYTES,
  decodeImportText,
  validateImportFile,
} from "@/lib/import/file-rules";

export type PreparedImport = { title: string; content: TiptapDocument };

/** Validates an uploaded file and converts it to editor JSON. Touches no storage. */
export async function prepareImport(file: unknown): Promise<ValidationResult<PreparedImport>> {
  if (!(file instanceof File)) return { ok: false, error: IMPORT_ERRORS.missing };

  const checked = validateImportFile({ name: file.name, size: file.size });
  if (!checked.ok) return checked;

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_IMPORT_BYTES) return { ok: false, error: IMPORT_ERRORS.tooLarge };

  const text = decodeImportText(bytes);
  if (!text.ok) return text;

  const content = convertImportedText(text.value, checked.value.format);
  if (!content.ok) return content;

  return { ok: true, value: { title: checked.value.title, content: content.value } };
}
