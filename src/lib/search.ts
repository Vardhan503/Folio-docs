export const MAX_SEARCH_LENGTH = 120;

/** Lowercases and strips accents so "resume" matches "Résumé". */
export function normalizeForSearch(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim();
}

/**
 * Case- and accent-insensitive title filter over documents the user has
 * already been authorized to load. An empty query returns the list unchanged.
 */
export function filterByTitle<T extends { title: string }>(documents: T[], query: string): T[] {
  const needle = normalizeForSearch(query.slice(0, MAX_SEARCH_LENGTH));
  if (!needle) return documents;
  return documents.filter((document) => normalizeForSearch(document.title).includes(needle));
}

export type SearchState = {
  /** Pathname of the page the query was typed on. */
  scope: string;
  query: string;
};

/** A query only applies to the page it was typed on; other pages stay unfiltered. */
export function queryForScope(state: SearchState, scope: string): string {
  return state.scope === scope ? state.query : "";
}

/** The dashboard a search typed on `pathname` applies to. */
export function searchTargetFor(pathname: string): "/" | "/shared" {
  return pathname === "/shared" ? "/shared" : "/";
}

export function searchPlaceholderFor(pathname: string): string {
  if (pathname === "/shared") return "Search shared documents";
  if (pathname === "/") return "Search your documents";
  return "Search My Documents";
}
