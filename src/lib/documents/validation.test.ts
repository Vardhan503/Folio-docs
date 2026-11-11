import { describe, expect, it } from "vitest";
import {
  MAX_CONTENT_BYTES,
  MAX_TITLE_LENGTH,
  createEmptyDocument,
  isUuid,
  validateDocumentContent,
  validateTitle,
} from "@/lib/documents/validation";

describe("validateTitle", () => {
  it("accepts a normal title", () => {
    expect(validateTitle("Quarterly plan")).toEqual({
      ok: true,
      value: "Quarterly plan",
    });
  });

  it("trims leading and trailing whitespace", () => {
    expect(validateTitle("  Meeting notes \n")).toEqual({
      ok: true,
      value: "Meeting notes",
    });
  });

  it.each(["", "   ", "\n\t "])("rejects an empty or whitespace-only title (%j)", (title) => {
    const result = validateTitle(title);
    expect(result.ok).toBe(false);
  });

  it("accepts a title of exactly the maximum length", () => {
    const title = "a".repeat(MAX_TITLE_LENGTH);
    expect(validateTitle(title)).toEqual({ ok: true, value: title });
  });

  it("rejects a title longer than the maximum length", () => {
    const result = validateTitle("a".repeat(MAX_TITLE_LENGTH + 1));
    expect(result).toEqual({
      ok: false,
      error: `Title can be at most ${MAX_TITLE_LENGTH} characters.`,
    });
  });

  it("measures length after trimming", () => {
    const result = validateTitle(`  ${"a".repeat(MAX_TITLE_LENGTH)}  `);
    expect(result.ok).toBe(true);
  });

  it.each([null, undefined, 42, {}, ["title"]])("rejects non-string input (%j)", (input) => {
    expect(validateTitle(input).ok).toBe(false);
  });
});

describe("validateDocumentContent", () => {
  it("accepts the empty document created for new documents", () => {
    const doc = createEmptyDocument();
    expect(validateDocumentContent(doc)).toEqual({ ok: true, value: doc });
  });

  it("accepts a document using every supported toolbar format", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Section" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Bold", marks: [{ type: "bold" }] },
            { type: "text", text: " italic", marks: [{ type: "italic" }] },
            { type: "text", text: " underline", marks: [{ type: "underline" }] },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }],
            },
          ],
        },
        {
          type: "orderedList",
          attrs: { start: 1, type: null },
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "First" }] }],
            },
          ],
        },
      ],
    };

    expect(validateDocumentContent(doc).ok).toBe(true);
  });

  it.each([
    ["a string", "hello"],
    ["null", null],
    ["an array", [{ type: "doc", content: [] }]],
    ["a number", 7],
    ["undefined", undefined],
  ])("rejects content that is %s", (_label, input) => {
    expect(validateDocumentContent(input).ok).toBe(false);
  });

  it("rejects a root node that isn't a doc", () => {
    expect(validateDocumentContent({ type: "paragraph", content: [] }).ok).toBe(false);
  });

  it("rejects a doc without a content array", () => {
    expect(validateDocumentContent({ type: "doc" }).ok).toBe(false);
    expect(validateDocumentContent({ type: "doc", content: "text" }).ok).toBe(false);
  });

  it("rejects unsupported node types", () => {
    const result = validateDocumentContent({
      type: "doc",
      content: [{ type: "image", attrs: { src: "https://example.com/x.png" } }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects nested documents", () => {
    const result = validateDocumentContent({
      type: "doc",
      content: [{ type: "doc", content: [] }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects unsupported marks such as links", () => {
    const result = validateDocumentContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "click",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects heading levels the editor doesn't offer", () => {
    const result = validateDocumentContent({
      type: "doc",
      content: [{ type: "heading", attrs: { level: 3 }, content: [] }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects malformed text nodes", () => {
    const emptyText = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
    };
    const textOnParagraph = {
      type: "doc",
      content: [{ type: "paragraph", text: "raw" }],
    };
    expect(validateDocumentContent(emptyText).ok).toBe(false);
    expect(validateDocumentContent(textOnParagraph).ok).toBe(false);
  });

  it("rejects non-object attributes and marks", () => {
    expect(
      validateDocumentContent({
        type: "doc",
        content: [{ type: "paragraph", attrs: "bad" }],
      }).ok,
    ).toBe(false);
    expect(
      validateDocumentContent({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "x", marks: "bold" }] },
        ],
      }).ok,
    ).toBe(false);
  });

  it("rejects content nested too deeply", () => {
    let node: Record<string, unknown> = { type: "paragraph" };
    for (let i = 0; i < 60; i += 1) {
      node = { type: "blockquote", content: [node] };
    }
    expect(validateDocumentContent({ type: "doc", content: [node] }).ok).toBe(false);
  });

  it("rejects content larger than the size limit", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "x".repeat(MAX_CONTENT_BYTES) }],
        },
      ],
    };
    const result = validateDocumentContent(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too large/);
  });

  it("rejects circular structures without throwing", () => {
    const doc: Record<string, unknown> = { type: "doc", content: [] };
    (doc.content as unknown[]).push(doc);
    expect(validateDocumentContent(doc).ok).toBe(false);
  });
});

describe("isUuid", () => {
  it("accepts UUIDs", () => {
    expect(isUuid("3f1c2a1e-8b7d-4c2a-9e1f-0a1b2c3d4e5f")).toBe(true);
  });

  it.each(["", "not-a-uuid", "3f1c2a1e8b7d4c2a9e1f0a1b2c3d4e5f", "../etc/passwd", 123])(
    "rejects %j",
    (value) => {
      expect(isUuid(value)).toBe(false);
    },
  );
});
