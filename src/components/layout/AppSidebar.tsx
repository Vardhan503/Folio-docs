"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolioLogo } from "@/components/layout/FolioLogo";
import { isNavItemActive, primaryNavItems } from "@/lib/navigation";

type AppSidebarProps = {
  /** Called after a navigation link is activated, e.g. to close the mobile drawer. */
  onNavigate?: () => void;
};

export function AppSidebar({ onNavigate }: AppSidebarProps) {
  return (
    <div className="flex h-full flex-col gap-6 px-3 py-4">
      <div className="px-1">
        <FolioLogo onNavigate={onNavigate} />
      </div>

      <nav aria-label="Primary" className="flex flex-col gap-1">
        <p className="px-3 pb-1 text-[11px] font-medium tracking-wider text-ink-subtle uppercase">
          Documents
        </p>
        {/* usePathname suspends on dynamic routes like /documents/[id] during prerendering. */}
        <Suspense fallback={<NavList pathname={null} onNavigate={onNavigate} />}>
          <ActiveNavList onNavigate={onNavigate} />
        </Suspense>
      </nav>

      <div className="mt-auto rounded-xl border border-line bg-canvas px-3.5 py-3">
        <p className="text-xs font-medium text-ink">Early preview</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          Real-time co-editing isn&apos;t available yet.
        </p>
      </div>
    </div>
  );
}

function ActiveNavList({ onNavigate }: AppSidebarProps) {
  const pathname = usePathname();
  return <NavList pathname={pathname} onNavigate={onNavigate} />;
}

type NavListProps = AppSidebarProps & {
  pathname: string | null;
};

function NavList({ pathname, onNavigate }: NavListProps) {
  return (
    <ul className="flex flex-col gap-0.5">
      {primaryNavItems.map((item) => {
        const active =
          pathname !== null && isNavItemActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                active
                  ? "bg-accent-soft text-accent"
                  : "text-ink-muted hover:bg-black/[0.04] hover:text-ink"
              }`}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
