// Paths reachable without a valid session. Shared by the proxy (src/proxy.ts, a cheap
// cookie-presence screen) and the root layout (src/app/layout.tsx, which does the real
// DB-backed session validation) so the two never disagree about what's public.
//
// /uploads is public static asset storage (e.g. the admin-configurable auth background
// image). /offline is the service worker's cached fallback page. /sw.js and the manifest
// are fetched by the browser/OS itself (SW registration, "Add to Home Screen") without a
// session cookie. /api/onboarding is the first-run account-creation endpoint, called from
// the public /register page before any session exists.
export const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/api/onboarding",
  "/uploads",
  "/offline",
  "/sw.js",
  "/manifest.webmanifest",
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
