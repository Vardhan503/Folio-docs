import { crc32, deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { validateDocumentContent } from "@/lib/documents/validation";
import { DOCX_ARCHIVE_LIMITS, DOCX_ERRORS, inspectDocxArchive } from "@/lib/import/docx-archive";
import { convertDocx } from "@/lib/import/docx";
import { CONVERSION_ERRORS } from "@/lib/import/convert";
import { IMPORT_ERRORS, MAX_DOCX_BYTES, validateImportFile } from "@/lib/import/file-rules";
import { prepareImport } from "@/lib/import/prepare-import";

type ZipEntry = {
  name: string;
  data: string | Uint8Array;
  method?: number;
  /** Overrides the uncompressed size written to the headers. */
  declaredSize?: number;
  flags?: number;
};

/** A minimal ZIP writer, so tests can also build archives with forged headers. */
function zip(entries: ZipEntry[]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const raw = Buffer.from(typeof entry.data === "string" ? Buffer.from(entry.data) : entry.data);
    const method = entry.method ?? 8;
    const body = method === 8 ? deflateRawSync(raw) : raw;
    const name = Buffer.from(entry.name);
    const size = entry.declaredSize ?? raw.length;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.flags ?? 0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(entry.flags ?? 0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, ...centrals, end]));
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function docxEntries(body: string): ZipEntry[] {
  return [
    {
      name: "[Content_Types].xml",
      data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    },
    {
      name: "_rels/.rels",
      data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    },
    {
      name: "word/_rels/document.xml.rels",
      data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:alert(1)" TargetMode="External"/></Relationships>',
    },
    {
      name: "word/numbering.xml",
      data: `<?xml version="1.0"?><w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`,
    },
    {
      name: "word/document.xml",
      data: `<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`,
    },
  ];
}

const docx = (body: string) => zip(docxEntries(body));

const p = (inner: string, props = "") => `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${inner}</w:p>`;
const r = (text: string, props = "") =>
  `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const styled = (style: string) => `<w:pStyle w:val="${style}"/>`;
const listItem = (text: string, numId: number, level = 0) =>
  p(r(text), `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr>`);
const text = (value: string, marks?: string[]) => ({
  type: "text",
  text: value,
  ...(marks ? { marks: marks.map((type) => ({ type })) } : {}),
});

describe("convertDocx", () => {
  it("keeps headings, inline formatting, lists, quotes, alignment, and tables", async () => {
    const result = await convertDocx(
      docx(
        [
          p(r("Quarterly plan"), styled("Title")),
          p(r("Goals"), styled("Heading2")),
          p(r("Deep heading"), styled("Heading3")),
          p(
            r("Bold", "<w:b/>") +
              r(" italic", "<w:i/>") +
              r(" under", '<w:u w:val="single"/>') +
              r(" gone", "<w:strike/>") +
              r(" plain"),
          ),
          p(r("Centered"), '<w:jc w:val="center"/>'),
          p(r("Justified"), '<w:jc w:val="both"/>'),
          listItem("First", 1),
          listItem("Nested", 1, 1),
          listItem("Second", 1),
          listItem("One", 2),
          listItem("Two", 2),
          p(r("Wise words"), styled("Quote")),
          p(r("More words"), styled("Quote")),
          '<w:tbl><w:tr><w:tc>' + p(r("A1")) + "</w:tc><w:tc>" + p(r("B1")) + "</w:tc></w:tr></w:tbl>",
          p(r("Line one") + "<w:r><w:br/></w:r>" + r("Line two")),
          p('<w:hyperlink r:id="rId3">' + r("click me") + "</w:hyperlink>"),
        ].join(""),
      ),
    );

    expect(result).toEqual({
      ok: true,
      value: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 1 }, content: [text("Quarterly plan")] },
          { type: "heading", attrs: { level: 2 }, content: [text("Goals")] },
          { type: "paragraph", content: [text("Deep heading")] },
          {
            type: "paragraph",
            content: [
              text("Bold", ["bold"]),
              text(" italic", ["italic"]),
              text(" under", ["underline"]),
              text(" gone", ["strike"]),
              text(" plain"),
            ],
          },
          { type: "paragraph", attrs: { textAlign: "center" }, content: [text("Centered")] },
          { type: "paragraph", attrs: { textAlign: "justify" }, content: [text("Justified")] },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  { type: "paragraph", content: [text("First")] },
                  {
                    type: "bulletList",
                    content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("Nested")] }] }],
                  },
                ],
              },
              { type: "listItem", content: [{ type: "paragraph", content: [text("Second")] }] },
            ],
          },
          {
            type: "orderedList",
            attrs: { start: 1, type: null },
            content: [
              { type: "listItem", content: [{ type: "paragraph", content: [text("One")] }] },
              { type: "listItem", content: [{ type: "paragraph", content: [text("Two")] }] },
            ],
          },
          {
            type: "blockquote",
            content: [
              { type: "paragraph", content: [text("Wise words")] },
              { type: "paragraph", content: [text("More words")] },
            ],
          },
          { type: "paragraph", content: [text("A1 | B1")] },
          {
            type: "paragraph",
            content: [text("Line one"), { type: "hardBreak" }, text("Line two")],
          },
          { type: "paragraph", content: [text("click me")] },
        ],
      },
    });
  });

  it("keeps markup-like text as literal text and never keeps links", async () => {
    const result = await convertDocx(
      docx(p(r("&lt;script&gt;alert(1)&lt;/script&gt; &lt;img src=x onerror=alert(1)&gt; **not bold**"))),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.content).toEqual([
      {
        type: "paragraph",
        content: [text("<script>alert(1)</script> <img src=x onerror=alert(1)> **not bold**")],
      },
    ]);
    expect(JSON.stringify(result.value)).not.toMatch(/javascript:|href|"link"/);
    expect(validateDocumentContent(result.value).ok).toBe(true);
  });

  it("drops font, color, size, and highlight formatting from Word", async () => {
    const result = await convertDocx(
      docx(p(r("Styled", '<w:color w:val="FF0000"/><w:sz w:val="48"/><w:highlight w:val="yellow"/><w:rFonts w:ascii="Comic Sans MS"/>'))),
    );
    expect(result).toEqual({
      ok: true,
      value: { type: "doc", content: [{ type: "paragraph", content: [text("Styled")] }] },
    });
  });

  it("rejects documents without text", async () => {
    expect(await convertDocx(docx(p("") + p("")))).toEqual({ ok: false, error: CONVERSION_ERRORS.noText });
  });

  it("rejects files that aren't archives, or aren't Word documents", async () => {
    expect(await convertDocx(new TextEncoder().encode("just some text"))).toEqual({
      ok: false,
      error: DOCX_ERRORS.damaged,
    });
    expect(await convertDocx(zip([{ name: "hello.txt", data: "hi" }]))).toEqual({
      ok: false,
      error: DOCX_ERRORS.damaged,
    });
  });

  it("rejects invalid document XML", async () => {
    const entries = docxEntries(p(r("ok")));
    entries[entries.length - 1] = { name: "word/document.xml", data: "<w:document><w:body><w:p>" };
    const result = await convertDocx(zip(entries));
    expect(result.ok).toBe(false);
  });
});

describe("inspectDocxArchive", () => {
  const valid = docxEntries(p(r("Hello")));

  it("accepts a normal document", () => {
    expect(inspectDocxArchive(zip(valid))).toEqual({ ok: true, value: { entries: valid.length } });
  });

  it("rejects truncated archives", () => {
    const bytes = zip(valid);
    expect(inspectDocxArchive(bytes.subarray(0, bytes.length - 30))).toEqual({
      ok: false,
      error: DOCX_ERRORS.damaged,
    });
    expect(inspectDocxArchive(bytes.subarray(0, 100))).toMatchObject({ ok: false });
  });

  it("rejects password-protected entries", () => {
    expect(inspectDocxArchive(zip([...valid, { name: "x.bin", data: "x", flags: 1 }]))).toEqual({
      ok: false,
      error: DOCX_ERRORS.encrypted,
    });
  });

  it("rejects unsupported compression methods", () => {
    expect(inspectDocxArchive(zip([...valid, { name: "x.bin", data: "x", method: 12 }]))).toEqual({
      ok: false,
      error: DOCX_ERRORS.damaged,
    });
  });

  it("rejects duplicate entry names", () => {
    expect(inspectDocxArchive(zip([...valid, valid[valid.length - 1]]))).toEqual({
      ok: false,
      error: DOCX_ERRORS.damaged,
    });
  });

  it("measures real sizes instead of trusting the headers", () => {
    const lying = { name: "word/media/a.bin", data: new Uint8Array(4096), declaredSize: 10 };
    expect(inspectDocxArchive(zip([...valid, lying]))).toEqual({ ok: false, error: DOCX_ERRORS.damaged });
  });

  it("rejects an entry that inflates past the per-entry limit, even if it claims to be small", () => {
    const bomb = {
      name: "word/media/bomb.bin",
      data: new Uint8Array(DOCX_ARCHIVE_LIMITS.maxEntryBytes + 1024),
      declaredSize: 1000,
    };
    const archive = zip([...valid, bomb]);
    expect(archive.length).toBeLessThan(MAX_DOCX_BYTES);
    expect(inspectDocxArchive(archive)).toEqual({ ok: false, error: DOCX_ERRORS.tooComplex });
  });

  it("rejects archives whose entries add up to more than the total limit", () => {
    const chunk = new Uint8Array(DOCX_ARCHIVE_LIMITS.maxEntryBytes - 1024);
    const parts = [0, 1, 2].map((index) => ({ name: `word/media/${index}.bin`, data: chunk }));
    const archive = zip([...valid, ...parts]);
    expect(archive.length).toBeLessThan(MAX_DOCX_BYTES);
    expect(inspectDocxArchive(archive)).toEqual({ ok: false, error: DOCX_ERRORS.tooComplex });
  });

  it("rejects archives with too many entries", () => {
    const many = Array.from({ length: DOCX_ARCHIVE_LIMITS.maxEntries }, (_, index) => ({
      name: `customXml/${index}.xml`,
      data: "",
      method: 0,
    }));
    expect(inspectDocxArchive(zip([...valid, ...many]))).toEqual({
      ok: false,
      error: DOCX_ERRORS.tooComplex,
    });
  });
});

describe("DOCX file rules", () => {
  it("accepts .docx up to its own limit", () => {
    expect(validateImportFile({ name: "Report.DOCX", size: MAX_DOCX_BYTES })).toEqual({
      ok: true,
      value: { title: "Report", format: "docx" },
    });
    expect(validateImportFile({ name: "Report.docx", size: MAX_DOCX_BYTES + 1 })).toEqual({
      ok: false,
      error: IMPORT_ERRORS.docxTooLarge,
    });
  });

  it("explains that older .doc files aren't supported", () => {
    expect(validateImportFile({ name: "old.doc", size: 10 })).toEqual({
      ok: false,
      error: IMPORT_ERRORS.legacyWord,
    });
  });

  it("imports an uploaded .docx end to end, titled from the file name", async () => {
    const file = new File([Buffer.from(docx(p(r("Hello from Word"))))], "Meeting notes.docx");
    expect(await prepareImport(file)).toEqual({
      ok: true,
      value: {
        title: "Meeting notes",
        content: { type: "doc", content: [{ type: "paragraph", content: [text("Hello from Word")] }] },
      },
    });
  });

  it("rejects a renamed text file", async () => {
    expect(await prepareImport(new File(["# Not Word"], "fake.docx"))).toEqual({
      ok: false,
      error: DOCX_ERRORS.damaged,
    });
  });

  it("converts the checked-in sample.docx fixture", async () => {
    const { readFileSync } = await import("node:fs");
    const bytes = new Uint8Array(readFileSync("sample.docx"));
    const result = await convertDocx(bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const json = JSON.stringify(result.value);
    expect(json).toContain("Goals");
    expect(json).toContain("\"type\":\"heading\"");
    expect(json).toContain("\"type\":\"bulletList\"");
    expect(json).toContain("\"type\":\"orderedList\"");
    expect(json).toContain("\"type\":\"blockquote\"");
    expect(json).toContain("\"type\":\"bold\"");
    expect(json).toContain('"text":" | "');
    expect(json).toContain('"text":"Editor | Sam"');
    expect(json).toContain('"textAlign":"center"');
    expect(json).not.toMatch(/https?:|onclick|<script/i);
  });
});
