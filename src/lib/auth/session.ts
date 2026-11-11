import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

/**
 * Returns the signed-in user from a verified access token, or null. Use this in
 * mutations that must report an expired session instead of redirecting.
 * Deduplicated per request.
 */
export const getOptionalUser = cache(
  async (): Promise<AuthenticatedUser | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;

    if (error || !claims?.sub) {
      return null;
    }

    return {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
    };
  },
);

/** Returns the signed-in user, or redirects to /login. */
export async function getCurrentUser(): Promise<AuthenticatedUser> {
  const user = await getOptionalUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
