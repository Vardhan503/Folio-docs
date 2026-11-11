import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseEnv } from "@/lib/supabase/env";

const LOGIN_PATH = "/login";
const HOME_PATH = "/";

/**
 * Refreshes the Supabase session cookie for this request and redirects based on
 * whether the request carries a verified user. Runs from `src/proxy.ts`.
 */
export async function updateSession(request: NextRequest) {
  const { url, publishableKey } = getSupabaseEnv();
  let response = NextResponse.next({ request });
  const responseHeaders: Record<string, string> = {};

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.assign(responseHeaders, headers);
      },
    },
  });

  // Do not run code between createServerClient and getClaims(): getClaims()
  // refreshes an expired session and verifies the access token's signature.
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims?.sub);

  const { pathname } = request.nextUrl;
  const isLoginRoute = pathname === LOGIN_PATH;

  if (!isAuthenticated && !isLoginRoute) {
    return redirectWithSession(request, LOGIN_PATH, response, responseHeaders);
  }

  if (isAuthenticated && isLoginRoute) {
    return redirectWithSession(request, HOME_PATH, response, responseHeaders);
  }

  applyHeaders(response, responseHeaders);
  return response;
}

function redirectWithSession(
  request: NextRequest,
  pathname: string,
  sessionResponse: NextResponse,
  headers: Record<string, string>,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";

  const redirect = NextResponse.redirect(url);
  sessionResponse.cookies
    .getAll()
    .forEach((cookie) => redirect.cookies.set(cookie));
  applyHeaders(redirect, headers);
  return redirect;
}

function applyHeaders(response: NextResponse, headers: Record<string, string>) {
  // Responses for signed-in users must never be stored by shared caches.
  response.headers.set("Cache-Control", "private, no-store");
  Object.entries(headers).forEach(([key, value]) =>
    response.headers.set(key, value),
  );
}
