"use client";

import { BrandMark } from "@/components/brand-mark";

// Static fallback served by the service worker when a navigation fails offline.
// No data fetching here — this page must render with zero network access.
export default function OfflinePage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center">
      <BrandMark size="lg" />
      <div>
        <p className="text-lg font-semibold text-foreground">You&apos;re offline</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          Arca needs a connection to load your data. Check your network and try again.
        </p>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Retry
      </button>
    </div>
  );
}
