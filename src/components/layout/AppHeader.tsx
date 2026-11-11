"use client";

import { Suspense, type ReactNode, type Ref } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, Menu, Search } from "lucide-react";
import { getPageTitle } from "@/lib/navigation";

type AppHeaderProps = {
  workspaceName: string;
  /** Account controls rendered at the end of the header. */
  account: ReactNode;
  onOpenNavigation: () => void;
  isNavigationOpen: boolean;
  menuButtonRef?: Ref<HTMLButtonElement>;
};

export function AppHeader({
  workspaceName,
  account,
  onOpenNavigation,
  isNavigationOpen,
  menuButtonRef,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3 sm:flex-nowrap sm:px-6 lg:px-8">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={onOpenNavigation}
          aria-label="Open navigation"
          aria-expanded={isNavigationOpen}
          aria-controls="mobile-navigation"
          className="-ml-1.5 inline-flex size-9 items-center justify-center rounded-lg text-ink-muted hover:bg-black/[0.04] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:hidden"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>

        <nav aria-label="Breadcrumb" className="min-w-0 flex-1 sm:flex-none">
          <ol className="flex min-w-0 items-center gap-1.5 text-sm">
            <li className="hidden truncate text-ink-muted sm:block">
              {workspaceName}
            </li>
            <li aria-hidden="true" className="hidden text-ink-subtle sm:block">
              <ChevronRight className="size-3.5" />
            </li>
            <li
              aria-current="page"
              className="truncate font-medium text-ink"
            >
              <Suspense fallback={null}>
                <PageTitle />
              </Suspense>
            </li>
          </ol>
        </nav>

        <div className="order-last basis-full sm:order-none sm:ml-auto sm:basis-auto sm:w-full sm:max-w-sm">
          <label htmlFor="document-search" className="sr-only">
            Search documents
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle"
            />
            <input
              id="document-search"
              type="search"
              disabled
              placeholder="Search documents"
              aria-describedby="document-search-status"
              className="h-9 w-full cursor-not-allowed rounded-lg border border-line bg-canvas pr-16 pl-9 text-sm text-ink placeholder:text-ink-subtle disabled:opacity-80"
            />
            <span
              id="document-search-status"
              className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink-subtle"
            >
              Soon
            </span>
          </div>
        </div>

        {account}
      </div>
    </header>
  );
}

function PageTitle() {
  const pathname = usePathname();
  return getPageTitle(pathname);
}
