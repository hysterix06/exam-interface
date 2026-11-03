import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { canAccess, homeFor, isPublicPath, isRole } from "@/lib/auth/roles";

// Refreshes the Supabase session cookie on every request and does an
// optimistic role check from the JWT. This is a UX redirect, not the security
// boundary: every page and server action re-checks with requireRole().
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

  if (role && (pathname === "/" || isPublicPath(pathname))) {
    return redirectTo(homeFor(role));
  }
  if (!canAccess(role, pathname)) {
    return redirectTo(role ? homeFor(role) : "/login");
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
