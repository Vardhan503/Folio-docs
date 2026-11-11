export type DataErrorCode =
  | "invalid_input"
  | "not_found"
  | "forbidden"
  | "conflict"
  | "unauthenticated"
  | "server_error";

export type DataResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: DataErrorCode };

type PostgrestLikeError = { code?: string; message?: string };

export function success<T>(data: T): DataResult<T> {
  return { ok: true, data };
}

export function rejected<T>(code: DataErrorCode, error: string): DataResult<T> {
  return { ok: false, code, error };
}

/** Logs a database error without request data, and returns a safe message for the UI. */
export function failure<T>(
  context: string,
  error: PostgrestLikeError,
  userMessage: string,
): DataResult<T> {
  console.error(`[data] ${context} failed`, {
    code: error.code,
    message: error.message,
  });
  return { ok: false, code: "server_error", error: userMessage };
}
