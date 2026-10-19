// Paths reachable without a valid session. Shared by the proxy (src/proxy.ts, a cheap
// cookie-presence screen) and the root layout (src/app/layout.tsx, which does the real
// DB-backed session validation) so the two never disagree about what's public.
//
// /uploads is public static asset storage (e.g. the admin-configurable auth background
// image). /offline is the service worker's cached fallback page. /sw.js and the manifest
// are fetched by the browser/OS itself (SW registration, "Add to Home Screen") without a
// session cookie, and so are /icon and /apple-icon (the manifest's icons, and the tab icon
// on the sign-in page). /api/onboarding is the first-run account-creation endpoint, called
// from the public /register page before any session exists. /api/bank/cron is the
// external bank-sync trigger; it checks its own BANK_SYNC_TOKEN instead of a session.
export const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/api/onboarding",
  "/api/bank/cron",
  "/uploads",
  "/offline",
  "/sw.js",
  "/manifest.webmanifest",
  "/icon",
  "/apple-icon",
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
