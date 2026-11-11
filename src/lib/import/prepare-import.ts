import type { TiptapDocument, ValidationResult } from "@/lib/documents/validation";
import { convertImportedText } from "@/lib/import/convert";
import { convertDocx } from "@/lib/import/docx";
import {
  IMPORT_ERRORS,
  decodeImportText,
  maxImportBytes,
  tooLargeError,
  validateImportFile,
} from "@/lib/import/file-rules";

export type PreparedImport = { title: string; content: TiptapDocument };

/** Validates an uploaded file and converts it to editor JSON. Touches no storage. */
export async function prepareImport(file: unknown): Promise<ValidationResult<PreparedImport>> {
  if (!(file instanceof File)) return { ok: false, error: IMPORT_ERRORS.missing };

  const checked = validateImportFile({ name: file.name, size: file.size });
  if (!checked.ok) return checked;

  const { format } = checked.value;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > maxImportBytes(format)) return { ok: false, error: tooLargeError(format) };

  let content: ValidationResult<TiptapDocument>;
  if (format === "docx") {
    content = await convertDocx(bytes);
  } else {
    const text = decodeImportText(bytes);
    if (!text.ok) return text;
    content = convertImportedText(text.value, format);
  }
  if (!content.ok) return content;

  return { ok: true, value: { title: checked.value.title, content: content.value } };
}
