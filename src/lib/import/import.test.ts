import { describe, expect, it } from "vitest";
import { CONVERSION_ERRORS, convertImportedText } from "@/lib/import/convert";
import {
  IMPORT_ERRORS,
  MAX_IMPORT_BYTES,
  decodeImportText,
  titleFromFileName,
  validateImportFile,
} from "@/lib/import/file-rules";
import { prepareImport } from "@/lib/import/prepare-import";

const encode = (text: string) => new TextEncoder().encode(text);
const text = (value: string) => ({ type: "text", text: value });
const bold = (value: string) => ({ type: "text", text: value, marks: [{ type: "bold" }] });
const italic = (value: string) => ({ type: "text", text: value, marks: [{ type: "italic" }] });
const paragraph = (...content: object[]) =>
  content.length ? { type: "paragraph", content } : { type: "paragraph" };
const item = (value: string) => ({ type: "listItem", content: [paragraph(text(value))] });

function convertOk(source: string, format: "text" | "markdown") {
  const result = convertImportedText(source, format);
  if (!result.ok) throw new Error(`Expected conversion to succeed: ${result.error}`);
  return result.value;
}

describe("validateImportFile", () => {
  it("accepts .txt and .md files, ignoring extension case", () => {
    expect(validateImportFile({ name: "meeting-notes.txt", size: 10 })).toEqual({
      ok: true,
      value: { title: "meeting-notes", format: "text" },
    });
    expect(validateImportFile({ name: "Project-Plan.MD", size: 10 })).toEqual({
      ok: true,
      value: { title: "Project-Plan", format: "markdown" },
    });
  });

  it.each(["report.pdf", "notes.docx", "notes", "notes.md.exe", "notes.markdown"])(
    "rejects unsupported file %s",
    (name) => {
      expect(validateImportFile({ name, size: 10 })).toEqual({
        ok: false,
        error: IMPORT_ERRORS.unsupported,
      });
    },
  );

  it("rejects missing, empty and oversized files", () => {
    expect(validateImportFile({ name: "", size: 10 }).ok).toBe(false);
    expect(validateImportFile({ name: "empty.txt", size: 0 })).toEqual({
      ok: false,
      error: IMPORT_ERRORS.empty,
    });
    expect(validateImportFile({ name: "big.md", size: MAX_IMPORT_BYTES + 1 })).toEqual({
      ok: false,
      error: IMPORT_ERRORS.tooLarge,
    });
    expect(validateImportFile({ name: "max.md", size: MAX_IMPORT_BYTES }).ok).toBe(true);
  });
});

describe("titleFromFileName", () => {
  it.each([
    ["meeting-notes.txt", "meeting-notes"],
    ["project-plan.md", "project-plan"],
    ["research-summary.md", "research-summary"],
    ["  quarterly   report \t final .md", "quarterly report final"],
    ["archive.v2.final.txt", "archive.v2.final"],
    ["C:\\fakepath\\notes.txt", "notes"],
    ["../../etc/passwd.md", "passwd"],
    ["line\nbreak\u0000.txt", "line break"],
    ["\u202Egnp.exe.md", "gnp.exe"],
    ["<img src=x onerror=alert(1)> & co.md", "<img src=x onerror=alert(1)> & co"],
  ])("derives a title from %j", (name, expected) => {
    expect(titleFromFileName(name)).toEqual({ ok: true, value: expected });
  });

  it.each([".md", "   .txt", "\u0000\u0001.txt", "folder/.md"])(
    "rejects %j, which has no usable title",
    (name) => {
      expect(titleFromFileName(name)).toEqual({ ok: false, error: IMPORT_ERRORS.titleEmpty });
    },
  );

  it("applies the 120 character title limit", () => {
    expect(titleFromFileName(`${"a".repeat(120)}.md`)).toEqual({
      ok: true,
      value: "a".repeat(120),
    });
    expect(titleFromFileName(`${"a".repeat(121)}.md`)).toEqual({
      ok: false,
      error: IMPORT_ERRORS.titleTooLong,
    });
    expect(validateImportFile({ name: `${"a".repeat(121)}.txt`, size: 5 }).ok).toBe(false);
  });
});

describe("decodeImportText", () => {
  it("decodes UTF-8 and drops a byte order mark", () => {
    expect(decodeImportText(encode("\uFEFFCafé – naïve ✓"))).toEqual({
      ok: true,
      value: "Café – naïve ✓",
    });
  });

  it("rejects invalid UTF-8", () => {
    expect(decodeImportText(new Uint8Array([0x48, 0x69, 0xc3, 0x28]))).toEqual({
      ok: false,
      error: IMPORT_ERRORS.invalidUtf8,
    });
    expect(decodeImportText(new Uint8Array([0xff, 0xfe, 0x48, 0x00])).ok).toBe(false);
  });

  it("rejects binary-looking content", () => {
    expect(decodeImportText(encode("PNG\u0000\u0000data"))).toEqual({
      ok: false,
      error: IMPORT_ERRORS.binary,
    });
    expect(decodeImportText(encode("\u0001\u0002\u0003\u0004 abc")).ok).toBe(false);
    expect(decodeImportText(encode("tabs\tand\fform feeds\r\n")).ok).toBe(true);
  });

  it("treats whitespace-only content as empty", () => {
    expect(decodeImportText(encode(" \n\t\r\n"))).toEqual({ ok: false, error: IMPORT_ERRORS.empty });
  });
});

describe("plain text conversion", () => {
  it("turns each line into a paragraph and keeps blank lines", () => {
    expect(convertOk("First line\n\nThird line\n", "text")).toEqual({
      type: "doc",
      content: [paragraph(text("First line")), paragraph(), paragraph(text("Third line"))],
    });
  });

  it("handles Windows and old Mac line endings", () => {
    expect(convertOk("a\r\nb\rc", "text")).toEqual({
      type: "doc",
      content: [paragraph(text("a")), paragraph(text("b")), paragraph(text("c"))],
    });
  });

  it("keeps HTML and Markdown characters as literal text", () => {
    const source = "<b>not bold</b> & <script>alert('x')</script>\n# not a heading\n**not bold**";
    expect(convertOk(source, "text")).toEqual({
      type: "doc",
      content: [
        paragraph(text("<b>not bold</b> & <script>alert('x')</script>")),
        paragraph(text("# not a heading")),
        paragraph(text("**not bold**")),
      ],
    });
  });

  it("preserves leading whitespace and tabs within a line", () => {
    expect(convertOk("  indented\tvalue", "text")).toEqual({
      type: "doc",
      content: [paragraph(text("  indented\tvalue"))],
    });
  });
});

describe("Markdown conversion", () => {
  it("converts paragraphs and H1/H2 headings", () => {
    expect(convertOk("# Title\n\n## Section\n\nBody text.", "markdown")).toEqual({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [text("Title")] },
        { type: "heading", attrs: { level: 2 }, content: [text("Section")] },
        paragraph(text("Body text.")),
      ],
    });
  });

  it("imports H3–H6 as paragraphs without losing their text", () => {
    expect(convertOk("### Three\n\n###### Six", "markdown")).toEqual({
      type: "doc",
      content: [paragraph(text("Three")), paragraph(text("Six"))],
    });
  });

  it("converts bold, italic and combined emphasis", () => {
    expect(convertOk("A **bold**, *italic*, __strong__, _em_ and ***both***.", "markdown")).toEqual({
      type: "doc",
      content: [
        paragraph(
          text("A "),
          bold("bold"),
          text(", "),
          italic("italic"),
          text(", "),
          bold("strong"),
          text(", "),
          italic("em"),
          text(" and "),
          { type: "text", text: "both", marks: [{ type: "bold" }, { type: "italic" }] },
          text("."),
        ),
      ],
    });
  });

  it("converts bulleted lists, including nested items", () => {
    expect(convertOk("- one\n- two\n  - nested", "markdown")).toEqual({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            item("one"),
            {
              type: "listItem",
              content: [paragraph(text("two")), { type: "bulletList", content: [item("nested")] }],
            },
          ],
        },
      ],
    });
  });

  it("converts numbered lists and keeps their start number", () => {
    expect(convertOk("1. first\n2. second", "markdown")).toEqual({
      type: "doc",
      content: [
        { type: "orderedList", attrs: { start: 1, type: null }, content: [item("first"), item("second")] },
      ],
    });
    expect(convertOk("3. third", "markdown")).toMatchObject({
      content: [{ type: "orderedList", attrs: { start: 3 } }],
    });
  });

  it("joins soft line breaks with spaces and keeps hard breaks", () => {
    expect(convertOk("one\ntwo  \nthree", "markdown")).toEqual({
      type: "doc",
      content: [paragraph(text("one two"), { type: "hardBreak" }, text("three"))],
    });
  });

  it("keeps raw HTML as literal text instead of rendering it", () => {
    expect(convertOk("<script>alert(1)</script>\n\nHi <img src=x onerror=alert(1)> &amp; bye", "markdown")).toEqual({
      type: "doc",
      content: [
        paragraph(text("<script>alert(1)</script>")),
        paragraph(text("Hi <img src=x onerror=alert(1)> & bye")),
      ],
    });
  });

  it("keeps link and image text but not their URLs", () => {
    expect(convertOk("See [the docs](https://example.com) ![diagram](x.png)", "markdown")).toEqual({
      type: "doc",
      content: [paragraph(text("See the docs diagram"))],
    });
  });

  it("keeps table text as one paragraph per row", () => {
    expect(convertOk("| Name | **Role** |\n|---|---|\n| Ada | Eng |", "markdown")).toEqual({
      type: "doc",
      content: [
        paragraph(text("Name | "), bold("Role")),
        paragraph(text("Ada | Eng")),
      ],
    });
  });

  it("keeps task list text with a literal checkbox", () => {
    expect(convertOk("- [ ] todo\n- [x] done\n- plain", "markdown")).toEqual({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [paragraph(text("[ ] todo"))] },
            { type: "listItem", content: [paragraph(text("[x] done"))] },
            item("plain"),
          ],
        },
      ],
    });
  });

  it("keeps code blocks, quotes and rules the editor supports", () => {
    expect(convertOk("> quote\n\n---\n\n```js\nif (a < b) {}\n```", "markdown")).toEqual({
      type: "doc",
      content: [
        { type: "blockquote", content: [paragraph(text("quote"))] },
        { type: "horizontalRule" },
        { type: "codeBlock", attrs: { language: "js" }, content: [text("if (a < b) {}")] },
      ],
    });
  });
});

describe("invalid conversion results", () => {
  it("rejects Markdown with no importable text", () => {
    expect(convertImportedText("[ref]: https://example.com", "markdown")).toEqual({
      ok: false,
      error: CONVERSION_ERRORS.noText,
    });
  });

  it("rejects content nested deeper than documents allow", () => {
    const nested = Array.from({ length: 30 }, (_, depth) => `${"  ".repeat(depth)}- level ${depth}`).join("\n");
    expect(convertImportedText(nested, "markdown")).toEqual({
      ok: false,
      error: CONVERSION_ERRORS.failed,
    });
  });

  it("rejects files that convert to more than the document size limit", () => {
    const manyBlankLines = `start${"\n".repeat(MAX_IMPORT_BYTES - 10)}end`;
    expect(convertImportedText(manyBlankLines, "text")).toEqual({
      ok: false,
      error: CONVERSION_ERRORS.tooLarge,
    });
  });
});

describe("prepareImport", () => {
  it("validates, decodes and converts an uploaded file", async () => {
    const file = new File(["Hello <world> & friends\r\n"], "meeting-notes.txt");
    expect(await prepareImport(file)).toEqual({
      ok: true,
      value: {
        title: "meeting-notes",
        content: { type: "doc", content: [paragraph(text("Hello <world> & friends"))] },
      },
    });
  });

  it("ignores the browser-supplied MIME type", async () => {
    const file = new File(["# Hi"], "notes.md", { type: "application/octet-stream" });
    expect((await prepareImport(file)).ok).toBe(true);
  });

  it("rejects non-file values and invalid content", async () => {
    expect(await prepareImport("notes.txt")).toEqual({ ok: false, error: IMPORT_ERRORS.missing });
    expect(await prepareImport(null)).toEqual({ ok: false, error: IMPORT_ERRORS.missing });
    expect(await prepareImport(new File([new Uint8Array([0xc3, 0x28])], "bad.txt"))).toEqual({
      ok: false,
      error: IMPORT_ERRORS.invalidUtf8,
    });
    expect(await prepareImport(new File(["x".repeat(MAX_IMPORT_BYTES + 1)], "big.txt"))).toEqual({
      ok: false,
      error: IMPORT_ERRORS.tooLarge,
    });
  });
});
