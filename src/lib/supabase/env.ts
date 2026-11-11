type SupabaseEnv = {
  url: string;
  publishableKey: string;
};

export function getSupabaseEnv(): SupabaseEnv {
  // Each variable must be referenced literally so Next.js can inline it into the browser bundle.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local (see .env.example).",
    );
  }

  return { url, publishableKey };
}
