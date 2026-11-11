import { describe, expect, it } from "vitest";
import {
  MAX_SEARCH_LENGTH,
  filterByTitle,
  normalizeForSearch,
  queryForScope,
  searchPlaceholderFor,
  searchTargetFor,
} from "@/lib/search";

const docs = [
  { id: "1", title: "Project Plan" },
  { id: "2", title: "Meeting notes" },
  { id: "3", title: "Résumé draft" },
  { id: "4", title: "project-plan (copy)" },
];

describe("filterByTitle", () => {
  it("returns the same list for an empty or blank query", () => {
    expect(filterByTitle(docs, "")).toBe(docs);
    expect(filterByTitle(docs, "   ")).toBe(docs);
  });

  it("matches case-insensitively anywhere in the title", () => {
    expect(filterByTitle(docs, "PROJECT").map((d) => d.id)).toEqual(["1", "4"]);
    expect(filterByTitle(docs, "notes").map((d) => d.id)).toEqual(["2"]);
  });

  it("ignores accents and surrounding whitespace", () => {
    expect(filterByTitle(docs, "  resume ").map((d) => d.id)).toEqual(["3"]);
    expect(filterByTitle(docs, "RÉSUMÉ").map((d) => d.id)).toEqual(["3"]);
  });

  it("returns nothing when no title matches", () => {
    expect(filterByTitle(docs, "budget")).toEqual([]);
  });

  it("treats regex characters literally", () => {
    expect(filterByTitle(docs, "(copy)").map((d) => d.id)).toEqual(["4"]);
    expect(filterByTitle(docs, ".*")).toEqual([]);
  });

  it("only searches the list it is given, so it can't reveal other documents", () => {
    const visible = [docs[1]];
    expect(filterByTitle(visible, "project")).toEqual([]);
  });

  it("caps very long queries", () => {
    const long = "p".repeat(MAX_SEARCH_LENGTH + 50);
    expect(() => filterByTitle(docs, long)).not.toThrow();
  });
});

describe("normalizeForSearch", () => {
  it("lowercases, trims and strips combining marks", () => {
    expect(normalizeForSearch("  Ünïcödé ")).toBe("unicode");
  });
});

describe("search scope", () => {
  it("applies a query only to the page it was typed on", () => {
    const state = { scope: "/", query: "plan" };
    expect(queryForScope(state, "/")).toBe("plan");
    expect(queryForScope(state, "/shared")).toBe("");
  });

  it("sends searches from document pages to My Documents", () => {
    expect(searchTargetFor("/documents/abc")).toBe("/");
    expect(searchTargetFor("/shared")).toBe("/shared");
    expect(searchTargetFor("/")).toBe("/");
  });

  it("describes what each page searches", () => {
    expect(searchPlaceholderFor("/")).toBe("Search your documents");
    expect(searchPlaceholderFor("/shared")).toBe("Search shared documents");
    expect(searchPlaceholderFor("/documents/abc")).toBe("Search My Documents");
  });
});
