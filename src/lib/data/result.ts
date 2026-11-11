export type DataResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type PostgrestLikeError = { code?: string; message?: string };

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
  return { ok: false, error: userMessage };
}
