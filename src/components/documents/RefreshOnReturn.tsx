"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Next.js keeps visited pages mounted but hidden, and shows that copy again on
 * Back or a link to the same page. Effects re-run when it becomes visible, so
 * refetch then: titles, order, new imports, and share changes made since are
 * picked up without disabling the router cache.
 */
export function RefreshOnReturn() {
  const router = useRouter();
  const hasMountedRef = useRef(false);

  useEffect(() => {
    if (hasMountedRef.current) {
      router.refresh();
    } else {
      hasMountedRef.current = true;
    }
  }, [router]);

  return null;
}
