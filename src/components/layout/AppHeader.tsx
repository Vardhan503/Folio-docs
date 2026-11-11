"use client";

import { Suspense, type ReactNode, type Ref } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { HeaderSearch, HeaderSearchFallback } from "@/components/search/HeaderSearch";
import { getPageTitle } from "@/lib/navigation";

type AppHeaderProps = {
  workspaceName: string;
  /** Account controls rendered at the end of the header. */
  account: ReactNode;
  onOpenNavigation: () => void;
  isNavigationOpen: boolean;
  menuButtonRef?: Ref<HTMLButtonElement>;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
};

export function AppHeader({
  workspaceName,
  account,
  onOpenNavigation,
  isNavigationOpen,
  menuButtonRef,
  isSidebarCollapsed,
  onToggleSidebar,
}: AppHeaderProps) {
  const SidebarIcon = isSidebarCollapsed ? PanelLeftOpen : PanelLeftClose;
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
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={isSidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          aria-expanded={!isSidebarCollapsed}
          aria-controls="desktop-sidebar"
          title={isSidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          className="-ml-1.5 hidden size-9 items-center justify-center rounded-lg text-ink-muted hover:bg-black/[0.04] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:inline-flex"
        >
          <SidebarIcon aria-hidden="true" className="size-5" />
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
          <Suspense fallback={<HeaderSearchFallback />}>
            <HeaderSearch />
          </Suspense>
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
