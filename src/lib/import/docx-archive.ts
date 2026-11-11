import "server-only";
import { inflateRawSync } from "node:zlib";
import type { ValidationResult } from "@/lib/documents/validation";

/**
 * Limits on what a .docx may expand to. A 1 MB upload of ordinary text
 * expands to a few MB; anything far beyond that is treated as a zip bomb.
 */
export const DOCX_ARCHIVE_LIMITS = {
  maxEntries: 1000,
  maxEntryBytes: 10 * 1024 * 1024,
  maxTotalBytes: 25 * 1024 * 1024,
} as const;

export const DOCX_ERRORS = {
  damaged: "This file isn't a valid .docx document, or it's damaged. Open it in Word, save it again as .docx, and retry.",
  encrypted: "Password-protected .docx files can't be imported. Remove the password in Word, then try again.",
  tooComplex:
    "This .docx file expands to too much data to import safely. Remove images or split the document, then try again.",
} as const;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT_SIZE = 0xffff;
const ZIP64_MARKER = 0xffffffff;

const REQUIRED_ENTRIES = ["[Content_Types].xml", "word/document.xml"];

type Rejection = keyof typeof DOCX_ERRORS;

class ArchiveError extends Error {
  constructor(readonly reason: Rejection) {
    super(reason);
  }
}

/**
 * Reads the ZIP central directory and inflates every entry with a hard output
 * cap, before the archive is handed to the DOCX parser. Declared sizes can lie,
 * so each entry's real size is measured, not trusted. Nothing is written to disk.
 */
export function inspectDocxArchive(bytes: Uint8Array): ValidationResult<{ entries: number }> {
  try {
    const entries = readEntries(bytes);
    return { ok: true, value: { entries } };
  } catch (error) {
    const reason = error instanceof ArchiveError ? error.reason : "damaged";
    return { ok: false, error: DOCX_ERRORS[reason] };
  }
}

function readEntries(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);

  const diskNumber = view.getUint16(eocd + 4, true);
  const centralDisk = view.getUint16(eocd + 6, true);
  const entriesOnDisk = view.getUint16(eocd + 8, true);
  const totalEntries = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);

  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries) {
    throw new ArchiveError("damaged");
  }
  if (totalEntries === 0xffff || centralSize === ZIP64_MARKER || centralOffset === ZIP64_MARKER) {
    throw new ArchiveError("tooComplex");
  }
  if (totalEntries === 0 || centralOffset + centralSize > eocd) {
    throw new ArchiveError("damaged");
  }
  if (totalEntries > DOCX_ARCHIVE_LIMITS.maxEntries) throw new ArchiveError("tooComplex");

  const names = new Set<string>();
  let totalBytes = 0;
  let offset = centralOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > eocd || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new ArchiveError("damaged");
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const declaredSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const nameEnd = offset + 46 + nameLength;
    if (nameEnd > eocd) throw new ArchiveError("damaged");
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, nameEnd));
    offset = nameEnd + extraLength + commentLength;

    if (flags & 0x1) throw new ArchiveError("encrypted");
    if (compressedSize === ZIP64_MARKER || declaredSize === ZIP64_MARKER || localOffset === ZIP64_MARKER) {
      throw new ArchiveError("tooComplex");
    }
    if (names.has(name)) throw new ArchiveError("damaged");
    names.add(name);

    const size = measureEntry(bytes, view, localOffset, method, compressedSize, declaredSize);
    totalBytes += size;
    if (totalBytes > DOCX_ARCHIVE_LIMITS.maxTotalBytes) throw new ArchiveError("tooComplex");
  }

  if (!REQUIRED_ENTRIES.every((name) => names.has(name))) throw new ArchiveError("damaged");
  return totalEntries;
}

function findEndOfCentralDirectory(view: DataView): number {
  const last = view.byteLength - EOCD_MIN_SIZE;
  const first = Math.max(0, last - MAX_COMMENT_SIZE);
  for (let offset = last; offset >= first; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  throw new ArchiveError("damaged");
}

/** Returns the entry's real uncompressed size, inflating with a cap. */
function measureEntry(
  bytes: Uint8Array,
  view: DataView,
  localOffset: number,
  method: number,
  compressedSize: number,
  declaredSize: number,
): number {
  if (declaredSize > DOCX_ARCHIVE_LIMITS.maxEntryBytes) throw new ArchiveError("tooComplex");
  if (localOffset + 30 > bytes.byteLength || view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
    throw new ArchiveError("damaged");
  }
  const dataStart =
    localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
  const dataEnd = dataStart + compressedSize;
  if (dataEnd > bytes.byteLength) throw new ArchiveError("damaged");
  const data = bytes.subarray(dataStart, dataEnd);

  if (method === 0) {
    if (compressedSize !== declaredSize) throw new ArchiveError("damaged");
    return declaredSize;
  }
  if (method !== 8) throw new ArchiveError("damaged");

  let inflated: Buffer;
  try {
    inflated = inflateRawSync(data, { maxOutputLength: DOCX_ARCHIVE_LIMITS.maxEntryBytes });
  } catch (error) {
    const code = (error as { code?: string }).code;
    throw new ArchiveError(code === "ERR_BUFFER_TOO_LARGE" ? "tooComplex" : "damaged");
  }
  if (inflated.byteLength !== declaredSize) throw new ArchiveError("damaged");
  return inflated.byteLength;
}
