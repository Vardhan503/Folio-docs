import { getSchema } from "@tiptap/react";
import { describe, expect, it } from "vitest";
import { createEditorExtensions } from "@/components/editor/extensions";
import {
  MAX_CONTENT_BYTES,
  parseDocumentContent,
  validateDocumentContent,
} from "@/lib/documents/validation";

const schema = getSchema(createEditorExtensions());

/** Produces JSON exactly as `editor.getJSON()` does: ProseMirror's Node#toJSON. */
function toEditorJSON(json: unknown) {
  return schema.nodeFromJSON(json).toJSON() as Record<string, unknown>;
}

const representativeDocument = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Project plan" }] },
    { type: "paragraph" },
    { type: "paragraph", content: [{ type: "text", text: "Plain text." }] },
    {
      type: "paragraph",
      content: [
        { type: "text", marks: [{ type: "bold" }], text: "Bold" },
        { type: "text", text: ", " },
        { type: "text", marks: [{ type: "italic" }], text: "italic" },
        { type: "text", text: ", " },
        { type: "text", marks: [{ type: "underline" }], text: "underline" },
        { type: "text", marks: [{ type: "bold" }, { type: "italic" }], text: " both" },
      ],
    },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Tasks" }] },
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Draft" }] }] },
        { type: "listItem", content: [{ type: "paragraph" }] },
      ],
    },
    {
      type: "orderedList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Review" }] }] },
      ],
    },
  ],
};

describe("editor-generated content", () => {
  it("uses null-prototype attribute objects with null values, like the live editor", () => {
    const json = toEditorJSON(representativeDocument);
    const blocks = json.content as Array<Record<string, unknown>>;
    const heading = blocks[0];
    const orderedList = blocks[6];

    expect(Object.getPrototypeOf(heading.attrs)).toBeNull();
    expect(orderedList.attrs).toEqual({ start: 1, type: null });
    expect(blocks[1]).toEqual({ type: "paragraph", attrs: { textAlign: null } });
  });

  it("accepts editor JSON directly", () => {
    const json = toEditorJSON(representativeDocument);
    expect(validateDocumentContent(json).ok).toBe(true);
  });

  it("accepts editor JSON after the string round trip used by autosave", () => {
    const json = toEditorJSON(representativeDocument);
    const result = parseDocumentContent(JSON.stringify(json));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(JSON.parse(JSON.stringify(json)));
  });

  it("accepts the empty document a new editor produces", () => {
    const json = toEditorJSON({ type: "doc", content: [{ type: "paragraph" }] });
    expect(parseDocumentContent(JSON.stringify(json)).ok).toBe(true);
  });
});

describe("attribute rules", () => {
  function docWith(node: Record<string, unknown>) {
    return { type: "doc", content: [node] };
  }

  it("accepts nodes and marks with omitted attrs", () => {
    expect(
      validateDocumentContent(
        docWith({ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "bold" }] }] }),
      ).ok,
    ).toBe(true);
  });

  it("accepts null attrs and null attribute values", () => {
    expect(validateDocumentContent(docWith({ type: "paragraph", attrs: null })).ok).toBe(true);
    expect(
      validateDocumentContent(
        docWith({ type: "codeBlock", attrs: { language: null }, content: [{ type: "text", text: "x" }] }),
      ).ok,
    ).toBe(true);
    expect(
      validateDocumentContent(
        docWith({
          type: "paragraph",
          content: [{ type: "text", text: "x", marks: [{ type: "bold", attrs: null }] }],
        }),
      ).ok,
    ).toBe(true);
  });

  it("accepts null-prototype attribute objects", () => {
    const attrs = Object.assign(Object.create(null), { level: 2 });
    expect(validateDocumentContent(docWith({ type: "heading", attrs })).ok).toBe(true);
  });

  it.each([
    ["a string", "level-1"],
    ["an array", [1]],
    ["a number", 1],
    ["a boolean", true],
  ])("rejects node attrs that are %s", (_label, attrs) => {
    const result = validateDocumentContent(docWith({ type: "paragraph", attrs }));
    expect(result).toEqual({
      ok: false,
      error: "Document content is malformed: node attributes must be an object.",
    });
  });

  it("rejects mark attrs that aren't objects", () => {
    const result = validateDocumentContent(
      docWith({
        type: "paragraph",
        content: [{ type: "text", text: "x", marks: [{ type: "bold", attrs: ["x"] }] }],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("still requires a valid heading level", () => {
    expect(validateDocumentContent(docWith({ type: "heading", attrs: null })).ok).toBe(false);
    expect(validateDocumentContent(docWith({ type: "heading", attrs: { level: 4 } })).ok).toBe(false);
  });
});

describe("parseDocumentContent", () => {
  it.each([null, undefined, 42, { type: "doc", content: [] }])(
    "rejects content that isn't a JSON string (%j)",
    (input) => {
      expect(parseDocumentContent(input)).toEqual({
        ok: false,
        error: "Document content is not valid JSON.",
      });
    },
  );

  it("rejects malformed JSON", () => {
    expect(parseDocumentContent('{"type":"doc",').ok).toBe(false);
  });

  it("rejects valid JSON that isn't a document", () => {
    expect(parseDocumentContent('"<p>Hello</p>"').ok).toBe(false);
    expect(parseDocumentContent("[]").ok).toBe(false);
  });

  it("rejects oversized payloads before parsing them", () => {
    const oversized = `{"type":"doc","content":[],"pad":"${"x".repeat(MAX_CONTENT_BYTES)}"}`;
    const result = parseDocumentContent(oversized);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too large/);
  });

  it("still rejects unsupported nodes and marks", () => {
    expect(
      parseDocumentContent(JSON.stringify({ type: "doc", content: [{ type: "image" }] })).ok,
    ).toBe(false);
    expect(
      parseDocumentContent(
        JSON.stringify({
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link" }] }] },
          ],
        }),
      ).ok,
    ).toBe(false);
  });
});
