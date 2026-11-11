import { getSchema } from "@tiptap/react";
import { describe, expect, it } from "vitest";
import { createEditorExtensions } from "@/components/editor/extensions";
import {
  FONT_SIZES,
  HIGHLIGHT_COLORS,
  TEXT_ALIGNMENTS,
  TEXT_COLORS,
  normalizeFontSize,
  normalizeHighlightColor,
  normalizeTextColor,
  toHexColor,
} from "@/lib/documents/formatting";
import { parseDocumentContent, validateDocumentContent } from "@/lib/documents/validation";

const schema = getSchema(createEditorExtensions());

function toEditorJSON(json: unknown) {
  return schema.nodeFromJSON(json).toJSON() as Record<string, unknown>;
}

function docWith(node: Record<string, unknown>) {
  return { type: "doc", content: [node] };
}

function textWithMarks(marks: unknown[]) {
  return docWith({ type: "paragraph", content: [{ type: "text", text: "x", marks }] });
}

const formattedDocument = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1, textAlign: "center" },
      content: [{ type: "text", text: "Centered title" }],
    },
    {
      type: "paragraph",
      attrs: { textAlign: "justify" },
      content: [
        {
          type: "text",
          text: "Red large",
          marks: [{ type: "textStyle", attrs: { color: "#b91c1c", fontSize: "24px" } }],
        },
        { type: "text", text: " highlighted", marks: [{ type: "highlight", attrs: { color: "#fef08a" } }] },
        { type: "text", text: " struck", marks: [{ type: "strike" }, { type: "bold" }] },
      ],
    },
    {
      type: "blockquote",
      content: [{ type: "paragraph", attrs: { textAlign: "right" }, content: [{ type: "text", text: "Quote" }] }],
    },
  ],
};

describe("formatted editor content", () => {
  it("survives the editor schema and the autosave string round trip unchanged", () => {
    const json = toEditorJSON(formattedDocument);
    const result = parseDocumentContent(JSON.stringify(json));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const reloaded = toEditorJSON(result.value);
    expect(reloaded).toEqual(json);
    const paragraph = (reloaded.content as Array<Record<string, unknown>>)[1];
    expect(paragraph.attrs).toEqual({ textAlign: "justify" });
    expect(JSON.stringify(paragraph)).toContain('"color":"#b91c1c"');
    expect(JSON.stringify(paragraph)).toContain('"fontSize":"24px"');
  });

  it("accepts every palette color, font size, and alignment", () => {
    for (const { value } of TEXT_COLORS) {
      expect(validateDocumentContent(textWithMarks([{ type: "textStyle", attrs: { color: value } }])).ok).toBe(true);
    }
    for (const { value } of HIGHLIGHT_COLORS) {
      expect(validateDocumentContent(textWithMarks([{ type: "highlight", attrs: { color: value } }])).ok).toBe(true);
    }
    for (const size of FONT_SIZES) {
      expect(validateDocumentContent(textWithMarks([{ type: "textStyle", attrs: { fontSize: size } }])).ok).toBe(true);
    }
    for (const align of TEXT_ALIGNMENTS) {
      expect(validateDocumentContent(docWith({ type: "paragraph", attrs: { textAlign: align } })).ok).toBe(true);
      expect(
        validateDocumentContent(docWith({ type: "heading", attrs: { level: 2, textAlign: align } })).ok,
      ).toBe(true);
    }
  });

  it("accepts cleared formatting (null attributes) and highlight without a color", () => {
    expect(
      validateDocumentContent(textWithMarks([{ type: "textStyle", attrs: { color: null, fontSize: null } }])).ok,
    ).toBe(true);
    expect(validateDocumentContent(textWithMarks([{ type: "highlight", attrs: { color: null } }])).ok).toBe(true);
    expect(validateDocumentContent(textWithMarks([{ type: "highlight" }])).ok).toBe(true);
  });

  it("still accepts documents saved before alignment existed", () => {
    const legacy = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Old" }] },
        { type: "paragraph", content: [{ type: "text", text: "Bold", marks: [{ type: "bold" }] }] },
      ],
    };
    expect(validateDocumentContent(legacy).ok).toBe(true);
    expect(validateDocumentContent(toEditorJSON(legacy)).ok).toBe(true);
  });
});

describe("formatting whitelist", () => {
  it.each([
    ["an off-palette hex color", { color: "#123456" }],
    ["a CSS injection in color", { color: "red; background-image: url(https://evil.test/x)" }],
    ["a named color", { color: "red" }],
    ["an uppercase palette color", { color: "#B91C1C" }],
    ["an unbounded font size", { fontSize: "200px" }],
    ["a font size with extra CSS", { fontSize: "12px; position: fixed" }],
    ["a non-string font size", { fontSize: 12 }],
    ["an unknown style attribute", { fontFamily: "Comic Sans MS" }],
    ["a background color", { backgroundColor: "#fef08a" }],
  ])("rejects textStyle with %s", (_label, attrs) => {
    expect(validateDocumentContent(textWithMarks([{ type: "textStyle", attrs }])).ok).toBe(false);
  });

  it.each([
    ["an off-palette color", { color: "#000000" }],
    ["a CSS injection", { color: "#fef08a; color: red" }],
    ["an unknown attribute", { style: "x" }],
  ])("rejects highlight with %s", (_label, attrs) => {
    expect(validateDocumentContent(textWithMarks([{ type: "highlight", attrs }])).ok).toBe(false);
  });

  it("rejects unsupported alignments and alignment on blocks that can't be aligned", () => {
    expect(validateDocumentContent(docWith({ type: "paragraph", attrs: { textAlign: "start" } })).ok).toBe(false);
    expect(
      validateDocumentContent(docWith({ type: "paragraph", attrs: { textAlign: "center; color: red" } })).ok,
    ).toBe(false);
    expect(
      validateDocumentContent(docWith({ type: "bulletList", attrs: { textAlign: "center" }, content: [] })).ok,
    ).toBe(false);
  });

  it("still rejects marks the editor doesn't have", () => {
    expect(validateDocumentContent(textWithMarks([{ type: "link", attrs: { href: "https://x.test" } }])).ok).toBe(
      false,
    );
    expect(validateDocumentContent(textWithMarks([{ type: "fontFamily" }])).ok).toBe(false);
  });

  it("doesn't render off-palette values even if they reach the editor", () => {
    const node = schema.nodeFromJSON(
      textWithMarks([{ type: "textStyle", attrs: { color: "url(javascript:alert(1))", fontSize: "999px" } }]),
    );
    const mark = node.firstChild?.firstChild?.marks[0];
    expect(mark).toBeDefined();
    const rendered = mark!.type.spec.toDOM?.(mark!, true);
    expect(JSON.stringify(rendered)).not.toMatch(/javascript|999px/);
  });
});

describe("pasted formatting normalization", () => {
  it("converts CSS color syntaxes to hex", () => {
    expect(toHexColor("#ABC")).toBe("#aabbcc");
    expect(toHexColor(" #B91C1C ")).toBe("#b91c1c");
    expect(toHexColor("rgb(185, 28, 28)")).toBe("#b91c1c");
    expect(toHexColor("rgba(185, 28, 28, 1)")).toBe("#b91c1c");
    expect(toHexColor("rgba(185, 28, 28, 0.5)")).toBeNull();
    expect(toHexColor("rgb(300, 0, 0)")).toBeNull();
    expect(toHexColor("red")).toBeNull();
  });

  it("keeps palette colors and drops everything else", () => {
    expect(normalizeTextColor("rgb(29, 78, 216)")).toBe("#1d4ed8");
    expect(normalizeTextColor("rgb(1, 2, 3)")).toBeNull();
    expect(normalizeTextColor("")).toBeNull();
    expect(normalizeHighlightColor("#FEF08A")).toBe("#fef08a");
    expect(normalizeHighlightColor("yellow")).toBeNull();
  });

  it("keeps allowed font sizes and drops everything else", () => {
    expect(normalizeFontSize("18PX")).toBe("18px");
    expect(normalizeFontSize("13px")).toBeNull();
    expect(normalizeFontSize("1.5em")).toBeNull();
    expect(normalizeFontSize(undefined)).toBeNull();
  });
});
