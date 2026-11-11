"use client";

import { formatLastEdited } from "@/lib/format";
import { useIsClient } from "@/lib/use-is-client";

const localFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Renders a timestamp in the viewer's time zone. The server and the hydration
 * pass render a fixed UTC date so markup matches; local time replaces it after.
 */
export function LocalDateTime({ iso }: { iso: string }) {
  const isClient = useIsClient();

  return (
    <time dateTime={iso}>
      {isClient ? localFormatter.format(new Date(iso)) : formatLastEdited(iso)}
    </time>
  );
}
