import Link from "next/link";

type FolioLogoProps = {
  onNavigate?: () => void;
  /** Set to false to render the logo without linking to the workspace. */
  linked?: boolean;
};

export function FolioLogo({ onNavigate, linked = true }: FolioLogoProps) {
  const content = (
    <>
      <span
        aria-hidden="true"
        className="relative flex size-8 items-center justify-center rounded-lg bg-accent text-white shadow-sm"
      >
        <svg viewBox="0 0 20 20" fill="none" className="size-4">
          <path
            d="M5 3.5h6.5L15 7v9.5H5z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M8 10h4M8 13h2.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-ink">
        Folio
      </span>
    </>
  );

  if (!linked) {
    return <div className="flex items-center gap-2.5 px-1 py-1">{content}</div>;
  }

  return (
    <Link
      href="/"
      onClick={onNavigate}
      className="flex items-center gap-2.5 rounded-lg px-1 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {content}
    </Link>
  );
}
