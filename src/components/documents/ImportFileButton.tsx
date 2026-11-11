"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { AlertCircle, Loader2, Upload } from "lucide-react";
import {
  importDocumentAction,
  type ImportDocumentState,
} from "@/lib/documents/actions";
import {
  IMPORT_ACCEPT,
  decodeImportText,
  validateImportFile,
} from "@/lib/import/file-rules";

const initialState: ImportDocumentState = { error: null };

type ImportFileButtonProps = {
  /** Id of an element describing the supported formats. */
  describedBy?: string;
  align?: "start" | "center" | "end";
};

const alignClass = {
  start: "",
  center: "justify-center text-center",
  end: "md:justify-end md:text-right",
} as const;

/** Quick browser-side check so obvious problems show before uploading. The server re-checks everything. */
async function findFileProblem(file: File): Promise<string | null> {
  const checked = validateImportFile({ name: file.name, size: file.size });
  if (!checked.ok) return checked.error;
  // .docx is a binary archive; only the server can inspect it safely.
  if (checked.value.format === "docx") return null;
  try {
    const text = decodeImportText(new Uint8Array(await file.arrayBuffer()));
    return text.ok ? null : text.error;
  } catch {
    return "We couldn't read this file. Try choosing it again.";
  }
}

export function ImportFileButton({ describedBy, align = "end" }: ImportFileButtonProps) {
  const [state, formAction, isPending] = useActionState(
    importDocumentAction,
    initialState,
  );
  const [isChecking, setIsChecking] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Covers the gap between picking a file and the action starting.
  const busyRef = useRef(false);
  const errorId = useId();

  useEffect(() => {
    if (!isPending) busyRef.current = false;
  }, [isPending, state]);

  const isBusy = isPending || isChecking;
  const error = isBusy ? null : (clientError ?? state.error);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Clearing the input lets the same file be picked again after a failure.
    input.value = "";
    if (!file || busyRef.current) return;

    busyRef.current = true;
    setClientError(null);
    setFileName(file.name);
    setIsChecking(true);
    const problem = await findFileProblem(file);
    setIsChecking(false);

    if (problem) {
      setClientError(problem);
      busyRef.current = false;
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    startTransition(() => formAction(formData));
  }

  return (
    <div className="contents">
      <input
        ref={inputRef}
        type="file"
        accept={IMPORT_ACCEPT}
        onChange={handleFileChange}
        disabled={isBusy}
        hidden
        tabIndex={-1}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isBusy}
        aria-describedby={[describedBy, error ? errorId : null].filter(Boolean).join(" ") || undefined}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink shadow-sm hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-80"
      >
        {isBusy ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <Upload aria-hidden="true" className="size-4" />
        )}
        {isBusy ? "Importing…" : "Import File"}
      </button>
      <p
        role="status"
        className={isBusy && fileName ? `order-last min-w-0 basis-full truncate text-xs text-ink-muted ${alignClass[align]}` : "sr-only"}
      >
        {isBusy && fileName ? `Importing “${fileName}”…` : ""}
      </p>
      {error ? (
        <p
          id={errorId}
          role="alert"
          className={`order-last flex basis-full items-center gap-1.5 text-xs text-red-700 ${alignClass[align]}`}
        >
          <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
