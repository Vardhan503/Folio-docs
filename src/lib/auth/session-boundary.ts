/** Supabase SSR session cookies: `sb-<ref>-auth-token`, its `.0`/`.1` chunks, and the PKCE verifier. */
export function isSupabaseAuthCookie(name: string): boolean {
  return /^sb-.+-auth-token(?:\.\d+|-code-verifier)?$/.test(name);
}

/**
 * Whether this browser document must be reloaded because the signed-in user
 * changed. `previous` is the user last rendered in this document (undefined
 * before the first render, null for a signed-out page); `next` is the user
 * being rendered now.
 *
 * Going from signed out to signed in is safe: nothing private was rendered
 * before. Any change away from a signed-in user is not, because Next.js keeps
 * previously visited pages (and their data) mounted but hidden.
 */
export function shouldResetForSession(
  previous: string | null | undefined,
  next: string | null,
): boolean {
  return typeof previous === "string" && previous !== next;
}
