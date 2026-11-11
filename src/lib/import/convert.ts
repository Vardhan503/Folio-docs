import {
  Extension,
  getSchema,
  type JSONContent,
  type MarkdownParseHelpers,
  type MarkdownToken,
} from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { Marked, type marked } from "marked";
import { createEditorExtensions } from "@/components/editor/extensions";
import {
  MAX_CONTENT_BYTES,
  validateDocumentContent,
  type TiptapDocument,
  type ValidationResult,
} from "@/lib/documents/validation";
import type { ImportFormat } from "@/lib/import/file-rules";

export const CONVERSION_ERRORS = {
  failed: "This file couldn't be converted into a document. Check its formatting and try again.",
  noText: "This file doesn't contain any text that can be imported.",
  tooLarge: `This file is too large once converted (documents can be up to ${MAX_CONTENT_BYTES / 1024} KB). Split it into smaller files and try again.`,
} as const;

const editorExtensions = createEditorExtensions();
const editorSchema = getSchema(editorExtensions);

/**
 * GFM tables have no node in the editor schema and would be dropped, so each
 * row becomes a paragraph with cells separated by " | ".
 */
const ImportTable = Extension.create({
  name: "importTable",
  markdownTokenName: "table",
  parseMarkdown: (token: MarkdownToken, helpers: MarkdownParseHelpers) => {
    const rows: MarkdownToken[][] = [token.header ?? [], ...(token.rows ?? [])];
    return rows.map((cells) => {
      const content: JSONContent[] = [];
      cells.forEach((cell, index) => {
        if (index > 0) content.push({ type: "text", text: " | " });
        content.push(...helpers.parseInline(cell.tokens ?? []));
      });
      return { type: "paragraph", content };
    });
  },
});

/**
 * The editor has no task lists, and the default list item parser produces
 * invalid content for them. Task items become list items whose text keeps a
 * literal "[ ]" or "[x]" prefix. Other items fall through to the default parser.
 */
const ImportTaskItem = Extension.create({
  name: "importTaskItem",
  priority: 1000,
  markdownTokenName: "list_item",
  parseMarkdown: (token: MarkdownToken, helpers: MarkdownParseHelpers) => {
    if (!token.task) return [];

    const blocks = (token.tokens ?? []).filter((child) => child.type !== "checkbox");
    const [first, ...rest] = blocks;
    const hasLeadingText = first?.type === "text" || first?.type === "paragraph";
    const inline = hasLeadingText
      ? helpers.parseInline(first.tokens ?? [{ type: "text", text: first.text ?? "" }])
      : [];

    return {
      type: "listItem",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: token.checked ? "[x] " : "[ ] " }, ...inline],
        },
        ...helpers.parseChildren(hasLeadingText ? rest : blocks),
      ],
    };
  },
});

let markdownManager: MarkdownManager | null = null;

function getMarkdownManager(): MarkdownManager {
  // The manager registers tokenizers on the instance it gets, so it must not be the global one.
  // A Marked instance has the Lexer, defaults and use() members the manager relies on.
  markdownManager ??= new MarkdownManager({
    marked: new Marked() as unknown as typeof marked,
    extensions: [...editorExtensions, ImportTable, ImportTaskItem],
  });
  return markdownManager;
}

/** One paragraph per line; blank lines become empty paragraphs. Never parsed as markup. */
export function textToDocument(text: string): JSONContent {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();

  return {
    type: "doc",
    content: lines.map((line) =>
      line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" },
    ),
  };
}

/**
 * Parses Markdown with the editor's own extensions. Raw HTML is kept as literal
 * text (no DOM parser on the server), and links and images keep only their text.
 */
export function markdownToDocument(markdown: string): JSONContent {
  const parsed = getMarkdownManager().parse(markdown.replace(/\r\n?/g, "\n"));
  return replaceSoftBreaks(parsed);
}

/** Markdown renders single newlines inside a paragraph as spaces; code keeps them. */
function replaceSoftBreaks(node: JSONContent, inCode = false): JSONContent {
  const isCode = inCode || node.type === "codeBlock";
  return {
    ...node,
    ...(node.type === "text" && !isCode && node.text
      ? { text: node.text.replace(/\n/g, " ") }
      : {}),
    ...(node.content
      ? { content: node.content.map((child) => replaceSoftBreaks(child, isCode)) }
      : {}),
  };
}

/**
 * Converts imported text into editor JSON, then checks it against the editor
 * schema and the same validation used for autosave. Anything that fails is
 * rejected instead of being stored.
 */
export function convertImportedText(
  text: string,
  format: ImportFormat,
): ValidationResult<TiptapDocument> {
  let json: unknown;
  try {
    const converted = format === "markdown" ? markdownToDocument(text) : textToDocument(text);
    if (!hasText(converted)) return { ok: false, error: CONVERSION_ERRORS.noText };

    const node = editorSchema.nodeFromJSON(converted);
    node.check();
    json = JSON.parse(JSON.stringify(node.toJSON()));
  } catch {
    return { ok: false, error: CONVERSION_ERRORS.failed };
  }

  const validated = validateDocumentContent(json);
  if (!validated.ok) {
    const tooLarge = validated.error.includes("too large");
    return { ok: false, error: tooLarge ? CONVERSION_ERRORS.tooLarge : CONVERSION_ERRORS.failed };
  }
  return validated;
}

function hasText(node: JSONContent): boolean {
  if (node.type === "text") return Boolean(node.text?.trim());
  return node.content?.some(hasText) ?? false;
}
