"use client";

import { ImportCsvCard } from "@/components/import-csv-card";
import { MobileSubpageHeader } from "@/components/mobile-menu-ui";
import { ScrollStickyHeader } from "@/components/scroll-sticky-header";

export default function ImportPage() {
  return (
    <div className="lg:mt-0 min-h-screen">

      {/* Mobile header */}
      <div className="lg:hidden">
        <MobileSubpageHeader title="Import CSV" backHref="/" />
      </div>

      {/* Desktop sticky header */}
      <ScrollStickyHeader
        className="hidden lg:block sticky top-0 z-10 px-6 md:px-8 py-4"
        scrolledClassName="bg-white/40 dark:bg-white/5 backdrop-blur-xl border-b border-white/30 dark:border-white/10"
      >
        <div className="mt-6">
          <h1 className="text-3xl font-black tracking-tight text-foreground">
            Import CSV
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload a bank statement (tab-separated CSV)
          </p>
        </div>
      </ScrollStickyHeader>

      <div className="px-5 pb-5 md:px-6 md:pb-6 lg:px-8 lg:pb-8 pt-4 max-w-2xl">
        <ImportCsvCard />
      </div>
    </div>
  );
}