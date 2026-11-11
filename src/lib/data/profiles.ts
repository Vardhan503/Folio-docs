import "server-only";
import { cache } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { failure, type DataResult } from "@/lib/data/result";
import type { ProfileRow } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export type CurrentProfile = Pick<ProfileRow, "id" | "email" | "display_name">;

/**
 * Loads the signed-in user's profile. `data` is null when the profile row is
 * missing, e.g. for a user created before the profile trigger existed.
 */
export const getCurrentProfile = cache(
  async (): Promise<DataResult<CurrentProfile | null>> => {
    const user = await getCurrentUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, display_name")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      return failure("getCurrentProfile", error, "We couldn't load your profile.");
    }

    return { ok: true, data };
  },
);
