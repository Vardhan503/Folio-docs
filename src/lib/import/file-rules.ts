import { validateTitle, type ValidationResult } from "@/lib/documents/validation";

/** Shared by the browser and the server so both apply the same rules. */
export const MAX_IMPORT_BYTES = 250 * 1024;
/**
 * Stays under the 1 MB default Server Action body limit (with room for the
 * multipart overhead), so the limit for every other action stays as it is.
 */
export const MAX_DOCX_BYTES = 1_000_000;
const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const IMPORT_ACCEPT = `.txt,.md,.docx,text/plain,text/markdown,${DOCX_MIME_TYPE}`;
export const IMPORT_FORMATS_HINT = ".txt or .md up to 250 KB, or .docx up to 1 MB";

export type ImportFormat = "text" | "markdown" | "docx";

const FORMATS_BY_EXTENSION: Record<string, ImportFormat> = {
  txt: "text",
  md: "markdown",
  docx: "docx",
};

export function maxImportBytes(format: ImportFormat): number {
  return format === "docx" ? MAX_DOCX_BYTES : MAX_IMPORT_BYTES;
}

export const IMPORT_ERRORS = {
  missing: "Choose a .txt, .md, or .docx file to import.",
  unsupported: "Only .txt, .md, and .docx files can be imported.",
  legacyWord: "Older Word .doc files can't be imported. Save the file as .docx in Word, then try again.",
  empty: "This file is empty. Add some text and try again.",
  tooLarge: "This file is larger than 250 KB. Split it into smaller files and try again.",
  docxTooLarge:
    "This .docx file is larger than 1 MB. Remove images or split the document, then try again.",
  invalidUtf8: "This file isn't valid UTF-8 text. Save it with UTF-8 encoding and try again.",
  binary: "This file doesn't look like plain text. Import a .txt or .md file.",
  titleEmpty: "The file name can't be used as a title. Rename the file and try again.",
  titleTooLong:
    "The file name is too long to use as a title (120 characters max). Rename the file and try again.",
} as const;

export type ImportFileInfo = { name: string; size: number };
export type ValidatedImportFile = { title: string; format: ImportFormat };

/** Checks name, extension and size. MIME types are ignored: Markdown MIME types vary by OS. */
export function validateImportFile(
  file: ImportFileInfo,
): ValidationResult<ValidatedImportFile> {
  const name = baseName(file.name);
  if (!name) return { ok: false, error: IMPORT_ERRORS.missing };

  const extension = extensionOf(name);
  const format = FORMATS_BY_EXTENSION[extension];
  if (!format) {
    return {
      ok: false,
      error: extension === "doc" ? IMPORT_ERRORS.legacyWord : IMPORT_ERRORS.unsupported,
    };
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, error: IMPORT_ERRORS.empty };
  }
  if (file.size > maxImportBytes(format)) {
    return { ok: false, error: tooLargeError(format) };
  }

  const title = titleFromFileName(name);
  if (!title.ok) return title;

  return { ok: true, value: { title: title.value, format } };
}

/**
 * Derives a document title from a file name: drops any path and the final
 * extension, strips control and bidirectional-override characters, collapses
 * whitespace, then applies the normal title rules.
 */
export function titleFromFileName(fileName: string): ValidationResult<string> {
  const name = baseName(fileName);
  const dot = name.lastIndexOf(".");
  const stem = dot === -1 ? name : name.slice(0, dot);

  const normalized = stem
    .normalize("NFC")
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return { ok: false, error: IMPORT_ERRORS.titleEmpty };

  const validated = validateTitle(normalized);
  if (!validated.ok) return { ok: false, error: IMPORT_ERRORS.titleTooLong };
  return validated;
}

/** Decodes strict UTF-8 (a leading BOM is dropped) and rejects binary-looking or blank text. */
export function decodeImportText(bytes: Uint8Array): ValidationResult<string> {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, error: IMPORT_ERRORS.invalidUtf8 };
  }

  if (looksBinary(text)) return { ok: false, error: IMPORT_ERRORS.binary };
  if (!text.trim()) return { ok: false, error: IMPORT_ERRORS.empty };
  return { ok: true, value: text };
}

/** NUL never appears in text files; other control characters only rarely. */
function looksBinary(text: string): boolean {
  if (text.includes("\u0000")) return true;
  const controls = text.match(/[\u0001-\u0008\u000B\u000E-\u001F\u007F]/g)?.length ?? 0;
  return controls / text.length > 0.01;
}

export function tooLargeError(format: ImportFormat): string {
  return format === "docx" ? IMPORT_ERRORS.docxTooLarge : IMPORT_ERRORS.tooLarge;
}

function baseName(fileName: string): string {
  return (fileName.split(/[\\/]/).pop() ?? "").trim();
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}
