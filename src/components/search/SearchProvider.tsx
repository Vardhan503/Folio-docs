"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { queryForScope, type SearchState } from "@/lib/search";

type SearchContextValue = {
  state: SearchState;
  setSearch: (state: SearchState) => void;
};

const SearchContext = createContext<SearchContextValue | null>(null);

/**
 * Holds the title search typed in the header. It lives in memory only, so a
 * full page load (sign-out, account switch) always starts with no query.
 */
export function SearchProvider({ children }: { children: ReactNode }) {
  const [state, setSearch] = useState<SearchState>({ scope: "", query: "" });
  const value = useMemo(() => ({ state, setSearch }), [state]);
  return <SearchContext value={value}>{children}</SearchContext>;
}

export function useSearch(): SearchContextValue {
  const context = useContext(SearchContext);
  if (!context) throw new Error("useSearch must be used inside SearchProvider");
  return context;
}

/** The query that applies to the page at `scope`. */
export function useSearchQuery(scope: string): string {
  return queryForScope(useSearch().state, scope);
}
