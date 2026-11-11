"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, Check, X } from "lucide-react";

type Notice = { id: number; message: string; tone: "success" | "error" };

type NoticeContextValue = {
  notify: (message: string, tone?: Notice["tone"]) => void;
};

const NoticeContext = createContext<NoticeContextValue | null>(null);

const NOTICE_DURATION_MS = 6000;

/**
 * Short confirmations that outlive a navigation, such as "Deleted …" after
 * returning to the dashboard. The live region stays mounted so screen readers
 * announce each new message.
 */
export function NoticeProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);

  const notify = useCallback((message: string, tone: Notice["tone"] = "success") => {
    setNotice({ id: Date.now(), message, tone });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const Icon = notice?.tone === "error" ? AlertCircle : Check;

  return (
    <NoticeContext value={{ notify }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
      >
        {notice ? (
          <div
            key={notice.id}
            className={`pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-lg ${
              notice.tone === "error"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-line bg-ink text-white"
            }`}
          >
            <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0 break-words">{notice.message}</p>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss message"
              className="-my-1 -mr-2 inline-flex size-7 shrink-0 items-center justify-center rounded-lg opacity-80 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
        ) : null}
      </div>
    </NoticeContext>
  );
}

export function useNotice(): NoticeContextValue {
  const context = useContext(NoticeContext);
  if (!context) throw new Error("useNotice must be used inside NoticeProvider");
  return context;
}
