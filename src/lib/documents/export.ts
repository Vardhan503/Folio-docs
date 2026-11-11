import { MarkdownManager } from "@tiptap/markdown";
import type { JSONContent } from "@tiptap/core";
import { Marked, type marked } from "marked";
import { createEditorExtensions } from "@/components/editor/extensions";
import type { ExportFormat } from "@/lib/documents/export-formats";
import {
  DEFAULT_DOCUMENT_TITLE,
  MAX_TITLE_LENGTH,
  type TiptapDocument,
} from "@/lib/documents/validation";

const COPY_PREFIX = "Copy of ";

/** Title for a duplicate, kept within the title limit. */
export function copyTitle(title: string): string {
  const base = title.trim() || DEFAULT_DOCUMENT_TITLE;
  return `${COPY_PREFIX}${base}`.slice(0, MAX_TITLE_LENGTH).trimEnd();
}

const MAX_FILENAME_LENGTH = 80;

/**
 * A download name built from the title: letters, numbers, spaces, dots, dashes
 * and underscores only, so it can't contain paths, control characters, or a
 * misleading extension.
 */
export function exportFilename(title: string, format: ExportFormat): string {
  const safe = title
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} ._-]+/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .slice(0, MAX_FILENAME_LENGTH)
    .trim();
  return `${safe || "document"}.${format}`;
}

function inlineText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(inlineText).join("");
}

function indent(text: string, prefix: string, continuation: string): string {
  return text
    .split("\n")
    .map((line, index) => (index === 0 ? prefix : line ? continuation : "") + line)
    .join("\n");
}

function blockText(node: JSONContent): string {
  const children = node.content ?? [];
  switch (node.type) {
    case "bulletList":
    case "orderedList": {
      const start = node.type === "orderedList" ? Number(node.attrs?.start ?? 1) || 1 : 0;
      return children
        .map((item, index) => {
          const marker = node.type === "orderedList" ? `${start + index}. ` : "- ";
          const body = (item.content ?? []).map(blockText).join("\n");
          return indent(body, marker, " ".repeat(marker.length));
        })
        .join("\n");
    }
    case "blockquote":
      return children.map(blockText).join("\n");
    case "horizontalRule":
      return "---";
    case "paragraph":
    case "heading":
    case "codeBlock":
      return inlineText(node);
    default:
      return children.length ? children.map(blockText).join("\n") : inlineText(node);
  }
}

/** One line per block, like the .txt importer reads it; list markers are kept. */
export function documentToPlainText(document: TiptapDocument): string {
  const text = (document.content ?? []).map(blockText).join("\n");
  return text.endsWith("\n") || !text ? text : `${text}\n`;
}

let markdownManager: MarkdownManager | null = null;

/**
 * Markdown via Tiptap's serializer. Underline is written as `<u>` and
 * highlight as `==text==`; colors, sizes and alignment have no Markdown form.
 */
export function documentToMarkdown(document: TiptapDocument): string {
  markdownManager ??= new MarkdownManager({
    marked: new Marked() as unknown as typeof marked,
    extensions: createEditorExtensions(),
  });
  const markdown = markdownManager.serialize(document as JSONContent);
  return markdown.endsWith("\n") || !markdown ? markdown : `${markdown}\n`;
}
