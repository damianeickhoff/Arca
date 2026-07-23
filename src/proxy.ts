import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isPublicPath } from "@/lib/public-paths";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Forward the resolved pathname to server components so the root layout can apply the
  // real (DB-backed) session check against the shared public-path list. Setting it here
  // (and overwriting any client-supplied value) means the layout can trust it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  const forward = () => NextResponse.next({ request: { headers: requestHeaders } });

  if (isPublicPath(pathname)) {
    return forward();
  }

  const token = request.cookies.get("session_token")?.value;
  if (!token) {
    // API routes have no HTML page to redirect to — a fetch() following a 302 to
    // /login would just receive the login page's markup as a "successful" response.
    // Route handlers separately validate the cookie against the database (see
    // requireAuth() in src/lib/auth.ts); this only screens out the common case of no
    // cookie at all, since the proxy itself stays free of DB access.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // A cookie is present, but the proxy can't tell whether it's valid without DB access.
  // The root layout re-validates it against the database for page routes; API route
  // handlers do the same via requireAuth(). This is only the cheap first screen.
  return forward();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
