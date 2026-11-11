"use client";

import { useActionState, useState, type FormEvent } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { signIn, type SignInState } from "@/lib/auth/actions";
import {
  hasErrors,
  validateCredentials,
  type CredentialFieldErrors,
} from "@/lib/auth/validation";

const initialState: SignInState = {
  email: "",
  fieldErrors: {},
  formError: null,
};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(signIn, initialState);
  const [clientErrors, setClientErrors] = useState<CredentialFieldErrors | null>(
    null,
  );

  const fieldErrors = clientErrors ?? state.fieldErrors;
  const formError = clientErrors || isPending ? null : state.formError;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const errors = validateCredentials(
      String(data.get("email") ?? "").trim(),
      String(data.get("password") ?? ""),
    );

    if (hasErrors(errors)) {
      event.preventDefault();
      setClientErrors(errors);
      return;
    }
    setClientErrors(null);
  }

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      noValidate
      aria-busy={isPending}
      className="flex flex-col gap-4"
    >
      {formError ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>{formError}</p>
        </div>
      ) : null}

      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        defaultValue={state.email}
        error={fieldErrors.email}
        readOnly={isPending}
      />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        error={fieldErrors.password}
        readOnly={isPending}
      />

      <button
        type="submit"
        disabled={isPending}
        className="mt-2 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white shadow-sm hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-80"
      >
        {isPending ? (
          <>
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </button>
    </form>
  );
}

type FieldProps = {
  id: "email" | "password";
  label: string;
  type: "email" | "password";
  autoComplete: string;
  defaultValue?: string;
  error?: string;
  readOnly: boolean;
};

function Field({
  id,
  label,
  type,
  autoComplete,
  defaultValue,
  error,
  readOnly,
}: FieldProps) {
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        // Remount with the server-returned email so it survives a failed attempt.
        key={defaultValue}
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required
        readOnly={readOnly}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`h-10 rounded-lg border bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-accent read-only:bg-canvas ${
          error ? "border-red-400" : "border-line-strong"
        }`}
      />
      {error ? (
        <p id={errorId} className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
