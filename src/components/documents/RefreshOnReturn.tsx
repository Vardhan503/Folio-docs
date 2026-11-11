"use client";

import { useLayoutEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * When a preserved dashboard page is shown again (Back, or a link to the same
 * route), kick off `router.refresh()` inside a transition *before* paint.
 * Callers can treat the pending flag like a loading state so stale titles
 * aren't shown for a frame. Caching stays enabled.
 */
export function useRefreshOnReturn(): boolean {
  const router = useRouter();
  const hasMountedRef = useRef(false);
  const [isPending, startTransition] = useTransition();

  useLayoutEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  return isPending;
}
