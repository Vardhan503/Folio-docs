"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ChevronDown, Loader2, LogOut } from "lucide-react";
import type { AccountSummary } from "@/lib/account";

type AccountMenuProps = {
  account: AccountSummary;
  signOutAction: () => Promise<void>;
};

export function AccountMenu({ account, signOutAction }: AccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-label={`Account: ${account.displayName}`}
        className="flex items-center gap-2 rounded-full p-0.5 pr-1 hover:bg-black/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:pr-2"
      >
        <Avatar initials={account.initials} />
        <span className="hidden max-w-36 truncate text-sm font-medium text-ink md:block">
          {account.displayName}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="hidden size-3.5 text-ink-subtle sm:block"
        />
      </button>

      {isOpen ? (
        <div
          id={menuId}
          className="absolute top-full right-0 z-30 mt-2 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-lg"
        >
          <div className="flex items-center gap-3 px-2.5 py-2.5">
            <Avatar initials={account.initials} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">
                {account.displayName}
              </p>
              {account.email ? (
                <p className="truncate text-xs text-ink-muted">{account.email}</p>
              ) : null}
            </div>
          </div>
          <div className="my-1 border-t border-line" />
          <form
            action={async () => {
              try {
                await signOutAction();
              } finally {
                // A full page load, not router navigation: it discards the
                // router cache and the hidden pages it keeps for Back/Forward.
                window.location.replace("/login");
              }
            }}
          >
            <SignOutButton />
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent"
    >
      {initials}
    </span>
  );
}

function SignOutButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-muted hover:bg-black/[0.04] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? (
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      ) : (
        <LogOut aria-hidden="true" className="size-4" />
      )}
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

export function AccountMenuSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading account"
      className="flex shrink-0 items-center gap-2 p-0.5"
    >
      <span className="size-8 rounded-full bg-line" />
      <span className="hidden h-3 w-24 rounded bg-line md:block" />
    </div>
  );
}
