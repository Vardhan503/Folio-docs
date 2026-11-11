import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

/**
 * Returns the signed-in user from a verified access token, or redirects to
 * /login. Deduplicated per request.
 */
export const getCurrentUser = cache(async (): Promise<AuthenticatedUser> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) {
    redirect("/login");
  }

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  };
});
