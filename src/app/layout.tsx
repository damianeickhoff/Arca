import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { MainContent } from "@/components/main-content";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { EdgeFades } from "@/components/edge-fades";
import { AppLockGate } from "@/components/app-lock-gate";
import { getCurrentUser } from "@/lib/auth";
import { getSidebarSubtitle, getAppLockConfig, getDefaultCurrency } from "@/lib/app-settings";
import { setCurrentCurrency } from "@/lib/format";
import { CurrencySync } from "@/components/currency-sync";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isPublicPath } from "@/lib/public-paths";
import { maybeRecordDailyNetWorthSnapshot } from "@/lib/net-worth-snapshots";
import { backfillBankAccountNumbers } from "@/lib/bank-account-numbers";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { RefreshOnReturn } from "@/components/refresh-on-return";
import { MotionProvider } from "@/components/motion-provider";
import { GooFilterDefs } from "@/components/ui/goo-filter-defs";
import { PageTransition } from "@/components/page-transition";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import "leaflet/dist/leaflet.css";
import { SettingsPortalProvider } from "@/lib/settings-portal-state";
import { FinishTransitionProvider } from "@/lib/finish-transition-state";
import { FinishTransitionOverlay } from "@/components/finish-transition-overlay";

const dmSans = DM_Sans({ variable: "--font-sans", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-heading", subsets: ["latin"], axes: ["opsz"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Arca",
  description: "No Penny left behind.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    // "black-translucent" makes the iOS status bar transparent in the installed (standalone)
    // PWA so page content renders *under* the notch/Dynamic Island — this is what lets the
    // dashboard's full-bleed gradient fill the safe-area band (paired with the --sat padding
    // in page.tsx / main-content.tsx). It forces white status-bar icons app-wide; the
    // top edge-fade (see <EdgeFades /> + globals.css) keeps them legible over light pages.
    // Ignored in a plain Safari tab (that bar is Safari's own chrome — handled by the per-route theme-color).
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Arca",
  },
};

// Matches --background exactly (not the brand purple) so the iOS status bar/toolbar
// never shows a visible color seam against the app's actual background — a branded
// accent color only blends where a page happens to have matching decoration right at
// the very top (e.g. the dashboard's blob), and clashes everywhere else (e.g. the
// mobile nav menu, which is plain white/near-black).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1211" },
  ],
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, sidebarSubtitle, appLock, locale, defaultCurrency] = await Promise.all([
    getCurrentUser(),
    getSidebarSubtitle(),
    getAppLockConfig(),
    getLocale(),
    getDefaultCurrency(),
  ]);
  // Sets the server's copy of the format.ts module so any formatEur() call during this
  // request's render (server components) uses the right symbol; see CurrencySync below
  // for the browser copy.
  setCurrentCurrency(defaultCurrency);

  // Real, DB-backed auth gate for page routes. The proxy (src/proxy.ts) only checks that a
  // session cookie is *present* — it stays free of DB access — so a present-but-invalid or
  // forged cookie would otherwise render an authenticated page (and its data) here.
  // getCurrentUser() above validates the session against the database; if it's not valid
  // and this isn't a public route, redirect to login. The pathname comes from the proxy via
  // the x-pathname header (set/overwritten there, so it can be trusted).
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (!user && !isPublicPath(pathname)) {
    const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
    redirect(`/login${next}`);
  }

  // A session exists once the onboarding wizard's password step creates the account,
  // long before the wizard is actually finished (see /api/onboarding/finish) — so a
  // user who navigates straight to another page mid-wizard (not just refreshing
  // /register) shouldn't land in the app either. /register itself is a public path,
  // so this doesn't loop.
  if (user && !user.onboardingComplete && !isPublicPath(pathname)) {
    redirect("/register");
  }

  // Fire-and-forget-ish: cheap select-first check after the first request of the day,
  // wrapped internally in try/catch so it can never break the layout render.
  if (user) {
    void maybeRecordDailyNetWorthSnapshot();
    void backfillBankAccountNumbers();
  }

  // src/config/categories.ts + src/config/brandIcons.ts sync runs synchronously in
  // src/db/index.ts (module init) — see src/lib/config-sync.ts for why it can't be
  // an awaited call here (layout/page render in parallel in Next, so it would still
  // race the page's own queries and the first render would show stale data).

  return (
    <html lang={locale} suppressHydrationWarning className={`${dmSans.variable} ${fraunces.variable} ${geistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{__html:`(function(){var t=localStorage.getItem('theme');if(t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}})()` }} />
      </head>
      <body className="min-h-dvh antialiased">
      <CurrencySync currency={defaultCurrency} />
      <GooFilterDefs />
      <NextIntlClientProvider>
        <SettingsPortalProvider>
          <FinishTransitionProvider>
            <MotionProvider>
              <AppLockGate
                enabled={appLock.enabled}
                hasWebAuthn={appLock.hasWebAuthn}
                webAuthnCredentialId={appLock.webAuthnCredentialId}
                pinLength={appLock.pinLength}
              >
                <div className="flex h-dvh">
                  <Nav user={user} subtitle={sidebarSubtitle} />
                  <MainContent>
                    <PageTransition>{children}</PageTransition>
                  </MainContent>
                </div>
                <MobileBottomNav />
                <EdgeFades />
              </AppLockGate>
              {/* Sibling of the page content (not nested inside it) so it survives the
                  /register → "/" client-side navigation — see finish-transition-state.tsx. */}
              <FinishTransitionOverlay />
            </MotionProvider>
          </FinishTransitionProvider>
        </SettingsPortalProvider>
      </NextIntlClientProvider>
        <ServiceWorkerRegister />
        <RefreshOnReturn />
      </body>
    </html>
  );
}
