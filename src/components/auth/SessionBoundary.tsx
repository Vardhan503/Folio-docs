"use client";

import { useEffect } from "react";
import {
  SESSION_SYNC_CHANNEL,
  isSessionSyncEvent,
  shouldResetForSession,
} from "@/lib/auth/session-boundary";

// Module state lives as long as the browser document, like the router's cache.
let renderedUserId: string | null | undefined;

/**
 * Reloads the page when the signed-in user changes within one browser
 * document: an expired session redirected to /login client-side, or another
 * tab signed in as someone else. A full load is the only way to drop the
 * hidden pages and client state Next.js keeps for earlier routes.
 *
 * Also listens for a cross-tab "signed-out" ping (no private data in the
 * message) so other open tabs leave for /login without waiting for a request.
 */
export function SessionBoundary({ userId }: { userId: string | null }) {
  useEffect(() => {
    if (shouldResetForSession(renderedUserId, userId)) {
      renderedUserId = undefined;
      window.location.reload();
      return;
    }
    renderedUserId = userId;
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    // A page restored from the browser's back/forward cache skips the server,
    // so check the session again by loading it for real.
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) window.location.reload();
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [userId]);

  useEffect(() => {
    if (!userId || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(SESSION_SYNC_CHANNEL);
    channel.onmessage = (event: MessageEvent) => {
      if (!isSessionSyncEvent(event.data?.type)) return;
      renderedUserId = undefined;
      window.location.replace("/login");
    };
    return () => channel.close();
  }, [userId]);

  return null;
}
