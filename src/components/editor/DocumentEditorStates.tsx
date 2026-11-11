import Link from "next/link";
import { ArrowLeft, FileQuestion, type LucideIcon } from "lucide-react";

export function DocumentEditorSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading document"
      className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8"
    >
      <div className="flex items-center justify-between">
        <span className="h-5 w-36 rounded bg-line" />
        <span className="h-4 w-28 rounded bg-line" />
      </div>
      <span className="mt-6 block h-7 w-64 max-w-full rounded bg-line" />
      <span className="mt-6 block h-[42px] rounded-xl border border-line bg-surface" />
      <div className="mx-auto mt-5 flex min-h-[60vh] max-w-[816px] flex-col gap-3 rounded-xl border border-line bg-white px-6 py-10 sm:px-16 sm:py-14">
        <span className="h-4 w-3/4 rounded bg-line/70" />
        <span className="h-4 w-full rounded bg-line/70" />
        <span className="h-4 w-5/6 rounded bg-line/70" />
      </div>
    </div>
  );
}

type DocumentMessageProps = {
  icon?: LucideIcon;
  title: string;
  description: string;
};

export function DocumentMessage({
  icon: Icon = FileQuestion,
  title,
  description,
}: DocumentMessageProps) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center px-4 py-20 text-center">
      <div
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-xl border border-line bg-surface text-ink-subtle"
      >
        <Icon className="size-5" />
      </div>
      <h1 className="mt-4 text-lg font-semibold text-ink">{title}</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{description}</p>
      <Link
        href="/"
        className="mt-6 inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink shadow-sm hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to Documents
      </Link>
    </div>
  );
}
