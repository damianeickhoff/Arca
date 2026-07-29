"use client";

import { ContextualTip } from "@/components/contextual-tip";
import { ImportCsvCard } from "@/components/import-csv-card";
import { MobileSubpageHeader } from "@/components/mobile-menu-ui";
import { PageContainer } from "@/components/page-container";

export default function ImportPage() {
  return (
    <PageContainer className="px-0 min-h-screen">
      {/* On the page, not inside ImportCsvCard — the card is reused by the register
          wizard's import step, which does its own explaining. */}
      <ContextualTip id="csvImport" />
      <MobileSubpageHeader title="Import CSV" backHref="/" />

      <div className="px-5 pb-5 pt-4">
        <ImportCsvCard />
      </div>
    </PageContainer>
  );
}
