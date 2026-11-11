import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Optional actions or notes rendered below the description. */
  children?: ReactNode;
  size?: "default" | "compact";
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  size = "default",
}: EmptyStateProps) {
  const compact = size === "compact";

  return (
    <div
      className={`flex flex-col items-center text-center ${
        compact ? "px-6 py-10" : "px-6 py-14 sm:py-16"
      }`}
    >
      <div
        aria-hidden="true"
        className={`flex items-center justify-center rounded-xl border border-line bg-canvas text-ink-subtle ${
          compact ? "size-10" : "size-12"
        }`}
      >
        <Icon className={compact ? "size-4.5" : "size-5"} />
      </div>
      <h3
        className={`mt-4 font-semibold text-ink ${compact ? "text-sm" : "text-base"}`}
      >
        {title}
      </h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">
        {description}
      </p>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}
