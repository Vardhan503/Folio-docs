"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthError } from "@supabase/supabase-js";
import { isSupabaseAuthCookie } from "@/lib/auth/session-boundary";
import {
  hasErrors,
  validateCredentials,
  type CredentialFieldErrors,
} from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

export type SignInState = {
  email: string;
  fieldErrors: CredentialFieldErrors;
  formError: string | null;
};

export async function signIn(
  _previousState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const fieldErrors = validateCredentials(email, password);
  if (hasErrors(fieldErrors)) {
    return { email, fieldErrors, formError: null };
  }

  let error: AuthError | null;
  try {
    const supabase = await createClient();
    ({ error } = await supabase.auth.signInWithPassword({ email, password }));
  } catch {
    return {
      email,
      fieldErrors: {},
      formError:
        "We couldn't reach the sign-in service. Check your connection and try again.",
    };
  }

  if (error) {
    return { email, fieldErrors: {}, formError: describeAuthError(error) };
  }

  redirect("/");
}

/**
 * Ends the session on the server. The caller must then do a full page load
 * (see AccountMenu): a client-side redirect would keep the previous user's
 * pages alive in the router's hidden <Activity> boundaries.
 */
export async function signOut(): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (!error) return;
    console.error("Sign-out failed", { code: error.code, status: error.status });
  } catch {
    console.error("Sign-out failed", { code: "network_error" });
  }

  // Supabase keeps the session if the sign-out request itself failed, so
  // remove the auth cookies directly: this device must end up signed out.
  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll()) {
    if (isSupabaseAuthCookie(name)) cookieStore.delete(name);
  }
}

function describeAuthError(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      return "Incorrect email or password.";
    case "email_not_confirmed":
      return "This account's email address hasn't been confirmed yet.";
    case "user_banned":
      return "This account has been disabled. Contact your administrator.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many sign-in attempts. Wait a moment and try again.";
    default:
      if (error.status && error.status >= 500) {
        return "The sign-in service is unavailable right now. Try again shortly.";
      }
      return "We couldn't sign you in. Check your details and try again.";
  }
}
