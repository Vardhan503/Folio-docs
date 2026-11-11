import "server-only";
import type { JSONContent } from "@tiptap/core";
import mammoth from "mammoth";
import type { TiptapDocument, ValidationResult } from "@/lib/documents/validation";
import { CONVERSION_ERRORS, finalizeImportedDocument } from "@/lib/import/convert";
import { DOCX_ERRORS, inspectDocxArchive } from "@/lib/import/docx-archive";

/**
 * The parts of mammoth's document model that are read here. Everything else
 * (images, notes, comments, bookmarks, fonts, colors) is ignored.
 */
type DocxElement = {
  type: string;
  children?: DocxElement[];
  value?: string;
  styleId?: string | null;
  styleName?: string | null;
  numbering?: { level?: string | number; isOrdered?: boolean } | null;
  alignment?: string | null;
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  isStrikethrough?: boolean;
  breakType?: string;
};

type Mark = { type: "bold" | "italic" | "underline" | "strike" };

const MAX_LIST_DEPTH = 8;

const ALIGNMENTS: Record<string, string> = {
  center: "center",
  right: "right",
  end: "right",
  both: "justify",
  distribute: "justify",
};

/**
 * Converts a .docx file to editor JSON. The archive is checked first; mammoth
 * then parses it without external file access, images are never read, and the
 * HTML mammoth produces is discarded: only its document model is used.
 */
export async function convertDocx(bytes: Uint8Array): Promise<ValidationResult<TiptapDocument>> {
  const archive = inspectDocxArchive(bytes);
  if (!archive.ok) return archive;

  let model: DocxElement | null = null;
  try {
    await mammoth.convertToHtml(
      { buffer: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) },
      {
        externalFileAccess: false,
        includeEmbeddedStyleMap: false,
        convertImage: mammoth.images.imgElement(async () => ({ src: "" })),
        transformDocument: (document: DocxElement) => {
          model = document;
          return document;
        },
      },
    );
  } catch {
    return { ok: false, error: DOCX_ERRORS.damaged };
  }
  if (!model) return { ok: false, error: DOCX_ERRORS.damaged };

  let converted: JSONContent;
  try {
    converted = docxModelToDocument(model);
  } catch {
    return { ok: false, error: CONVERSION_ERRORS.failed };
  }
  return finalizeImportedDocument(converted);
}

export function docxModelToDocument(document: DocxElement): JSONContent {
  const blocks = convertBlocks(document.children ?? []);
  return { type: "doc", content: blocks.length ? blocks : [{ type: "paragraph" }] };
}

function convertBlocks(elements: DocxElement[]): JSONContent[] {
  const blocks: JSONContent[] = [];
  let list: ListBuilder | null = null;

  for (const element of elements) {
    if (element.type === "paragraph" && element.numbering) {
      list ??= new ListBuilder();
      list.add(element);
      continue;
    }
    if (list) {
      blocks.push(...list.finish());
      list = null;
    }
    if (element.type === "paragraph") {
      blocks.push(convertParagraph(element));
    } else if (element.type === "table") {
      blocks.push(...convertTable(element));
    }
  }
  if (list) blocks.push(...list.finish());
  return mergeQuotes(blocks);
}

function headingLevel(paragraph: DocxElement): 1 | 2 | null {
  const style = `${paragraph.styleName ?? paragraph.styleId ?? ""}`.toLowerCase().replace(/\s+/g, "");
  if (style === "title" || style === "heading1" || style === "heading") return 1;
  if (style === "subtitle" || style === "heading2") return 2;
  return null;
}

function isQuote(paragraph: DocxElement): boolean {
  const style = `${paragraph.styleName ?? paragraph.styleId ?? ""}`.toLowerCase().replace(/\s+/g, "");
  return style === "quote" || style === "intensequote";
}

function alignmentAttrs(paragraph: DocxElement): Record<string, string> | undefined {
  const textAlign = paragraph.alignment ? ALIGNMENTS[paragraph.alignment] : undefined;
  return textAlign ? { textAlign } : undefined;
}

function convertParagraph(paragraph: DocxElement): JSONContent {
  const content = paragraphContent(paragraph);
  const level = headingLevel(paragraph);
  const attrs = alignmentAttrs(paragraph);
  const node: JSONContent = level
    ? { type: "heading", attrs: { level, ...attrs } }
    : { type: "paragraph", ...(attrs ? { attrs } : {}) };
  if (content.length) node.content = content;
  if (isQuote(paragraph)) return { type: "blockquote", content: [{ ...node, type: "paragraph", attrs }] };
  return node;
}

/** Word marks a quote per paragraph; consecutive ones become one quote block. */
function mergeQuotes(blocks: JSONContent[]): JSONContent[] {
  const merged: JSONContent[] = [];
  for (const block of blocks) {
    const previous = merged.at(-1);
    if (block.type === "blockquote" && previous?.type === "blockquote") {
      previous.content = [...(previous.content ?? []), ...(block.content ?? [])];
    } else {
      merged.push(block);
    }
  }
  return merged;
}

function convertInline(elements: DocxElement[], marks: Mark[]): JSONContent[] {
  const result: JSONContent[] = [];
  const pushText = (text: string, textMarks: Mark[]) => {
    const clean = text.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").replace(/\t/g, " ");
    if (!clean) return;
    const previous = result.at(-1);
    if (previous?.type === "text" && sameMarks(previous.marks as Mark[] | undefined, textMarks)) {
      previous.text += clean;
      return;
    }
    result.push({ type: "text", text: clean, ...(textMarks.length ? { marks: textMarks } : {}) });
  };

  for (const element of elements) {
    switch (element.type) {
      case "text":
        pushText(element.value ?? "", marks);
        break;
      case "tab":
        pushText(" ", marks);
        break;
      case "break":
        if (!element.breakType || element.breakType === "line") result.push({ type: "hardBreak" });
        break;
      case "run":
        for (const child of convertInline(element.children ?? [], runMarks(element, marks))) {
          if (child.type === "text") pushText(child.text ?? "", (child.marks as Mark[]) ?? []);
          else result.push(child);
        }
        break;
      case "hyperlink":
        // Links aren't supported by the editor; their text is kept.
        result.push(...convertInline(element.children ?? [], marks));
        break;
      default:
        break;
    }
  }
  return result;
}

/** A paragraph's inline content, without line breaks left at its end. */
function paragraphContent(paragraph: DocxElement): JSONContent[] {
  const content = convertInline(paragraph.children ?? [], []);
  while (content.at(-1)?.type === "hardBreak") content.pop();
  return content;
}

function runMarks(run: DocxElement, inherited: Mark[]): Mark[] {
  const marks = [...inherited];
  const add = (type: Mark["type"], on: boolean | undefined) => {
    if (on && !marks.some((mark) => mark.type === type)) marks.push({ type });
  };
  add("bold", run.isBold || run.styleName === "Strong");
  add("italic", run.isItalic);
  add("underline", run.isUnderline);
  add("strike", run.isStrikethrough);
  return marks;
}

function sameMarks(a: Mark[] = [], b: Mark[] = []): boolean {
  return a.length === b.length && a.every((mark, index) => mark.type === b[index]?.type);
}

/** Tables have no editor node: each row becomes a paragraph, cells separated by " | ". */
function convertTable(table: DocxElement): JSONContent[] {
  const rows: JSONContent[] = [];
  for (const row of table.children ?? []) {
    if (row.type !== "tableRow") continue;
    const content: JSONContent[] = [];
    (row.children ?? []).forEach((cell, index) => {
      if (index > 0) content.push({ type: "text", text: " | " });
      const paragraphs = collectParagraphs(cell);
      paragraphs.forEach((paragraph, paragraphIndex) => {
        if (paragraphIndex > 0) content.push({ type: "text", text: " " });
        content.push(...paragraphContent(paragraph));
      });
    });
    rows.push({ type: "paragraph", ...(content.length ? { content } : {}) });
  }
  return rows;
}

function collectParagraphs(element: DocxElement): DocxElement[] {
  if (element.type === "paragraph") return [element];
  return (element.children ?? []).flatMap(collectParagraphs);
}

/** Builds nested lists from Word's flat numbered paragraphs (level 0, 1, …). */
class ListBuilder {
  private readonly roots: JSONContent[] = [];
  private readonly stack: { list: JSONContent; level: number }[] = [];

  add(paragraph: DocxElement) {
    const level = Math.min(Math.max(Number(paragraph.numbering?.level) || 0, 0), MAX_LIST_DEPTH);
    const type = paragraph.numbering?.isOrdered ? "orderedList" : "bulletList";
    const content = paragraphContent(paragraph);
    const item: JSONContent = {
      type: "listItem",
      content: [{ type: "paragraph", ...(content.length ? { content } : {}) }],
    };

    while (this.stack.length && this.stack.at(-1)!.level > level) this.stack.pop();
    let top = this.stack.at(-1);

    if (top && top.level === level && top.list.type !== type) {
      this.stack.pop();
      top = this.stack.at(-1);
    }
    if (!top || top.level < level) {
      const list: JSONContent = { type, content: [] };
      const parentItem = top?.list.content?.at(-1);
      if (parentItem) parentItem.content = [...(parentItem.content ?? []), list];
      else this.roots.push(list);
      this.stack.push({ list, level });
      top = this.stack.at(-1);
    }
    top!.list.content!.push(item);
  }

  finish(): JSONContent[] {
    return this.roots;
  }
}
