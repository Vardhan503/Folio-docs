import { describe, expect, it } from "vitest";
import {
  copyTitle,
  documentToMarkdown,
  documentToPlainText,
  exportFilename,
} from "@/lib/documents/export";
import { isExportFormat } from "@/lib/documents/export-formats";
import { MAX_TITLE_LENGTH, type TiptapDocument } from "@/lib/documents/validation";
import { canCopyOrExport, canDelete } from "@/lib/sharing/roles";

const text = (value: string, marks?: { type: string; attrs?: Record<string, unknown> }[]) => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});
const paragraph = (...content: object[]) => ({ type: "paragraph", content });
const item = (...content: object[]) => ({ type: "listItem", content });

const sample = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1, textAlign: "center" }, content: [text("Plan *v2*")] },
    paragraph(
      text("Bold", [{ type: "bold" }]),
      text(" red", [{ type: "textStyle", attrs: { color: "#b91c1c", fontSize: null } }]),
      text(" marked", [{ type: "highlight", attrs: { color: "#fef08a" } }]),
    ),
    {
      type: "bulletList",
      content: [item(paragraph(text("one")), { type: "bulletList", content: [item(paragraph(text("nested")))] })],
    },
    { type: "orderedList", attrs: { start: 3 }, content: [item(paragraph(text("three")))] },
    { type: "blockquote", content: [paragraph(text("quoted"))] },
    { type: "codeBlock", content: [text("x = 1\ny = 2")] },
    { type: "paragraph" },
    paragraph(text("line"), { type: "hardBreak" }, text("next")),
  ],
} as TiptapDocument;

describe("copyTitle", () => {
  it("prefixes the title", () => {
    expect(copyTitle("Plan")).toBe("Copy of Plan");
    expect(copyTitle("  ")).toBe("Copy of Untitled document");
  });

  it("stays within the title limit", () => {
    const copied = copyTitle("x".repeat(MAX_TITLE_LENGTH));
    expect(copied.length).toBe(MAX_TITLE_LENGTH);
    expect(copied.startsWith("Copy of ")).toBe(true);
  });
});

describe("exportFilename", () => {
  it.each([
    ["Project plan", "txt", "Project plan.txt"],
    ["Q3/../plan: final?", "md", "Q3 .. plan final.md"],
    ["..\\..\\etc\\passwd", "txt", "etc passwd.txt"],
    ["notes.exe", "txt", "notes.exe.txt"],
    ["<script>alert(1)</script>", "md", "script alert 1 script.md"],
    ["Résumé 2026", "md", "Résumé 2026.md"],
    ["\u0000\u202e\u200b", "txt", "document.txt"],
    ["...", "md", "document.md"],
  ] as const)("%j becomes %j", (title, format, expected) => {
    expect(exportFilename(title, format)).toBe(expected);
  });

  it("caps the name length", () => {
    expect(exportFilename("a".repeat(200), "md")).toBe(`${"a".repeat(80)}.md`);
  });
});

describe("documentToPlainText", () => {
  it("writes one line per block and keeps list markers", () => {
    expect(documentToPlainText(sample)).toBe(
      [
        "Plan *v2*",
        "Bold red marked",
        "- one",
        "  - nested",
        "3. three",
        "quoted",
        "x = 1",
        "y = 2",
        "",
        "line",
        "next",
        "",
      ].join("\n"),
    );
  });

  it("returns an empty string for an empty document", () => {
    expect(documentToPlainText({ type: "doc", content: [{ type: "paragraph" }] })).toBe("");
  });
});

describe("documentToMarkdown", () => {
  it("serializes structure and escapes Markdown characters in text", () => {
    const markdown = documentToMarkdown(sample);
    expect(markdown).toContain("# Plan \\*v2\\*\n");
    expect(markdown).toContain("**Bold** red ==marked==");
    expect(markdown).toContain("- one\n  - nested");
    expect(markdown).toContain("3. three");
    expect(markdown).toContain("> quoted");
    expect(markdown).toContain("```\nx = 1\ny = 2\n```");
    expect(markdown.endsWith("\n")).toBe(true);
  });

  it("escapes HTML typed as text", () => {
    const markdown = documentToMarkdown({
      type: "doc",
      content: [paragraph(text("<img src=x onerror=alert(1)>"))],
    } as TiptapDocument);
    expect(markdown).not.toContain("<img");
  });
});

describe("export permissions", () => {
  it("lets owners and editors copy or download, and only owners delete", () => {
    expect([canCopyOrExport("owner"), canCopyOrExport("editor"), canCopyOrExport("viewer")]).toEqual([
      true,
      true,
      false,
    ]);
    expect([canDelete("owner"), canDelete("editor"), canDelete("viewer")]).toEqual([true, false, false]);
  });

  it("accepts only .txt and .md", () => {
    expect([isExportFormat("txt"), isExportFormat("md"), isExportFormat("html"), isExportFormat("")]).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
});
