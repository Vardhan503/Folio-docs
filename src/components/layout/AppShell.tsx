"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";

type AppShellProps = {
  workspaceName: string;
  children: ReactNode;
};

export function AppShell({ workspaceName, children }: AppShellProps) {
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const openNavigation = useCallback(() => setIsNavigationOpen(true), []);
  const closeNavigation = useCallback(() => {
    setIsNavigationOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isNavigationOpen) return;

    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeNavigation();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isNavigationOpen, closeNavigation]);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:outline-2 focus:outline-accent"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-line bg-surface lg:block">
        <AppSidebar />
      </aside>

      {isNavigationOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            aria-hidden="true"
            onClick={closeNavigation}
            className="absolute inset-0 bg-ink/30"
          />
          <div
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface shadow-xl"
          >
            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeNavigation}
              aria-label="Close navigation"
              className="absolute top-4 right-3 inline-flex size-8 items-center justify-center rounded-lg text-ink-muted hover:bg-black/[0.04] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
            <AppSidebar onNavigate={() => setIsNavigationOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          workspaceName={workspaceName}
          onOpenNavigation={openNavigation}
          isNavigationOpen={isNavigationOpen}
          menuButtonRef={menuButtonRef}
        />
        <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
