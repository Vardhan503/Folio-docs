"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { useSearch } from "@/components/search/SearchProvider";
import {
  MAX_SEARCH_LENGTH,
  queryForScope,
  searchPlaceholderFor,
  searchTargetFor,
} from "@/lib/search";

const inputClass =
  "h-9 w-full rounded-lg border border-line bg-canvas pr-9 pl-9 text-sm text-ink placeholder:text-ink-subtle [&::-webkit-search-cancel-button]:appearance-none";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Filters the current dashboard by title. On a document page, Enter searches
 * My Documents. Press "/" anywhere (outside text fields) to focus it.
 */
export function HeaderSearch() {
  const pathname = usePathname();
  const router = useRouter();
  const { state, setSearch } = useSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const query = queryForScope(state, pathname);
  const isDashboard = pathname === "/" || pathname === "/shared";

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target) || document.querySelector("dialog[open]")) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function update(next: string) {
    setSearch({ scope: pathname, query: next.slice(0, MAX_SEARCH_LENGTH) });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (query) update("");
      else event.currentTarget.blur();
    } else if (event.key === "Enter" && !isDashboard && query.trim()) {
      event.preventDefault();
      const target = searchTargetFor(pathname);
      setSearch({ scope: target, query });
      router.push(target);
    }
  }

  return (
    <div className="relative" role="search">
      <label htmlFor="document-search" className="sr-only">
        Search documents by title
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle"
      />
      <input
        ref={inputRef}
        id="document-search"
        type="search"
        value={query}
        onChange={(event) => update(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={searchPlaceholderFor(pathname)}
        maxLength={MAX_SEARCH_LENGTH}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        aria-keyshortcuts="/"
        aria-describedby={isDashboard ? undefined : "document-search-hint"}
        className={`${inputClass} focus-visible:border-line-strong focus-visible:bg-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent`}
      />
      {isDashboard ? null : (
        <span id="document-search-hint" className="sr-only">
          Press Enter to search My Documents.
        </span>
      )}
      {query ? (
        <button
          type="button"
          onClick={() => {
            update("");
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute top-1/2 right-1.5 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:bg-black/[0.05] hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      ) : (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded-md border border-line bg-surface px-1.5 py-0.5 font-sans text-[11px] font-medium text-ink-subtle sm:block"
        >
          /
        </kbd>
      )}
    </div>
  );
}

/** Same footprint as HeaderSearch while the route is resolving. */
export function HeaderSearchFallback() {
  return (
    <div className="relative">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle"
      />
      <input
        type="search"
        disabled
        aria-label="Search documents by title"
        placeholder="Search documents"
        className={inputClass}
      />
    </div>
  );
}
