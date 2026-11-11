import {
  isFontSize,
  isHighlightColor,
  isTextAlignment,
  isTextColor,
} from "@/lib/documents/formatting";
import type { Json } from "@/lib/supabase/database.types";

export const DEFAULT_DOCUMENT_TITLE = "Untitled document";
export const MAX_TITLE_LENGTH = 120;
/** Serialized JSON size limit; leaves headroom under the 1 MB Server Action body limit. */
export const MAX_CONTENT_BYTES = 500 * 1024;
const MAX_NODE_DEPTH = 40;

type JsonAttrs = { [key: string]: Json | undefined };

export type TiptapMark = {
  type: string;
  attrs?: JsonAttrs;
};

export type TiptapNode = {
  type: string;
  attrs?: JsonAttrs;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  text?: string;
};

export type TiptapDocument = TiptapNode & { type: "doc"; content: TiptapNode[] };

export function createEmptyDocument(): TiptapDocument {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/** Nodes and marks produced by the editor's extensions (see components/editor/extensions.ts). */
const ALLOWED_NODES = new Set([
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
]);
const ALLOWED_MARKS = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "textStyle",
  "highlight",
]);

/**
 * Attributes whose values are rendered into inline styles. Each may be absent
 * or null; otherwise it must be one of the values in lib/documents/formatting.
 */
const STYLED_MARK_ATTRS: Record<string, Record<string, (value: unknown) => boolean>> = {
  textStyle: { color: isTextColor, fontSize: isFontSize },
  highlight: { color: isHighlightColor },
};
export const ALLOWED_HEADING_LEVELS = [1, 2] as const;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function validateTitle(input: unknown): ValidationResult<string> {
  if (typeof input !== "string") {
    return { ok: false, error: "Title must be text." };
  }
  const title = input.trim();
  if (!title) {
    return { ok: false, error: "Title can't be empty." };
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return {
      ok: false,
      error: `Title can be at most ${MAX_TITLE_LENGTH} characters.`,
    };
  }
  return { ok: true, value: title };
}

const INVALID_JSON_ERROR = "Document content is not valid JSON.";
const TOO_LARGE_ERROR =
  "This document is too large to save. Try splitting it into smaller documents.";

function exceedsContentLimit(serialized: string): boolean {
  return new TextEncoder().encode(serialized).length > MAX_CONTENT_BYTES;
}

/**
 * Parses and validates content sent from the editor as a JSON string. The size
 * limit is enforced before parsing so oversized payloads are never parsed.
 */
export function parseDocumentContent(
  serialized: unknown,
): ValidationResult<TiptapDocument> {
  if (typeof serialized !== "string") {
    return { ok: false, error: INVALID_JSON_ERROR };
  }
  if (exceedsContentLimit(serialized)) {
    return { ok: false, error: TOO_LARGE_ERROR };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return { ok: false, error: INVALID_JSON_ERROR };
  }
  return validateDocumentContent(parsed);
}

export function validateDocumentContent(
  input: unknown,
): ValidationResult<TiptapDocument> {
  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    return { ok: false, error: INVALID_JSON_ERROR };
  }
  if (serialized === undefined) {
    return { ok: false, error: INVALID_JSON_ERROR };
  }
  if (exceedsContentLimit(serialized)) {
    return { ok: false, error: TOO_LARGE_ERROR };
  }

  if (!isPlainObject(input) || input.type !== "doc") {
    return { ok: false, error: "Document content must be a Tiptap document." };
  }
  if (!Array.isArray(input.content)) {
    return { ok: false, error: "Document content must contain a list of blocks." };
  }

  for (const child of input.content) {
    const error = validateNode(child, 1);
    if (error) {
      return { ok: false, error: `Document content is malformed: ${error}` };
    }
  }

  return { ok: true, value: input as TiptapDocument };
}

function validateNode(node: unknown, depth: number): string | null {
  if (depth > MAX_NODE_DEPTH) return "content is nested too deeply.";
  if (!isPlainObject(node)) return "every node must be an object.";
  if (typeof node.type !== "string" || !ALLOWED_NODES.has(node.type)) {
    return `unsupported node type "${String(node.type)}".`;
  }
  if (!isValidAttrs(node.attrs)) {
    return "node attributes must be an object.";
  }

  if (node.type === "text") {
    if (typeof node.text !== "string" || node.text.length === 0) {
      return "text nodes must contain text.";
    }
    if (node.content !== undefined) return "text nodes cannot have children.";
  } else if (node.text !== undefined) {
    return `"${node.type}" nodes cannot contain raw text.`;
  }

  if (node.type === "heading") {
    const level = isPlainObject(node.attrs) ? node.attrs.level : undefined;
    if (!ALLOWED_HEADING_LEVELS.includes(level as 1 | 2)) {
      return "headings must be level 1 or 2.";
    }
  }

  const textAlign = isPlainObject(node.attrs) ? node.attrs.textAlign : undefined;
  if (textAlign !== undefined && textAlign !== null) {
    if (node.type !== "paragraph" && node.type !== "heading") {
      return `"${node.type}" nodes can't be aligned.`;
    }
    if (!isTextAlignment(textAlign)) return "unsupported text alignment.";
  }

  if (node.marks !== undefined) {
    if (!Array.isArray(node.marks)) return "marks must be a list.";
    for (const mark of node.marks) {
      if (!isPlainObject(mark) || typeof mark.type !== "string") {
        return "every mark must have a type.";
      }
      if (!ALLOWED_MARKS.has(mark.type)) {
        return `unsupported mark "${mark.type}".`;
      }
      if (!isValidAttrs(mark.attrs)) {
        return "mark attributes must be an object.";
      }
      const error = validateStyledMarkAttrs(mark.type, mark.attrs);
      if (error) return error;
    }
  }

  if (node.content !== undefined) {
    if (!Array.isArray(node.content)) return "node content must be a list.";
    for (const child of node.content) {
      const error = validateNode(child, depth + 1);
      if (error) return error;
    }
  }

  return null;
}

function validateStyledMarkAttrs(type: string, attrs: unknown): string | null {
  const rules = STYLED_MARK_ATTRS[type];
  if (!rules || !isPlainObject(attrs)) return null;
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    const isAllowed = rules[key];
    if (!isAllowed) return `unsupported "${type}" attribute "${key}".`;
    if (!isAllowed(value)) return `unsupported ${key} value.`;
  }
  return null;
}

/** Attributes may be omitted or null; otherwise they must be an object (values may be null). */
function isValidAttrs(attrs: unknown): boolean {
  return attrs === undefined || attrs === null || isPlainObject(attrs);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
