import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { homeFor, isPublicPath, isRole } from "@/lib/auth/roles";

// Refreshes the Supabase session cookie on every request and sends signed-out
// visitors to /login. Roles are not checked here: the JWT role can be stale
// after an admin changes it, which would bounce between homes. Every page and
// server action authorizes with requireRole(), which reads the DB.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims() verifies the JWT; do not run code between client creation and
  // this call, or sessions can be dropped at random.
  const { data } = await supabase.auth.getClaims();
  const claimedRole = data?.claims?.app_metadata?.role;
  const role = isRole(claimedRole) ? claimedRole : null;
  const { pathname } = request.nextUrl;

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (pathname === "/login" && request.nextUrl.searchParams.has("inactive")) {
    await supabase.auth.signOut();
    return response;
  }
  if (role && pathname === "/login") return redirectTo(homeFor(role));
  if (!data?.claims?.sub && !isPublicPath(pathname)) return redirectTo("/login");
  return response;
}

export const config = {
  matcher: [
    // widgets/ are static pages embedded in the exam; a signed-in user must not be redirected away from them.
    "/((?!_next/static|_next/image|favicon.ico|widgets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
