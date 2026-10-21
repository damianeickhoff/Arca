"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ComparisonPicker } from "./comparison-picker";
import { MonthComparisonTable, type MonthStats } from "./month-comparison";

/**
 * "Compare two months" under Biggest movers: the two budget months side by side per
 * category, in a dialog. The months live in the URL (`cmpA`/`cmpB`, see
 * ComparisonPicker), so the server recomputes them while the dialog stays open.
 */
export function CompareMonthsDialog({
  cmpA,
  cmpB,
  subtitle,
  shortA,
  shortB,
  statsA,
  statsB,
  months,
  footnote,
}: {
  cmpA: string;
  cmpB: string;
  /** "September vs October so far", already translated. */
  subtitle: string;
  shortA: string;
  shortB: string;
  statsA: MonthStats;
  statsB: MonthStats;
  months: { value: string; label: string }[];
  footnote: string | null;
}) {
  const t = useTranslations("insights.trendsTab.movers");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="cursor-pointer text-[13px] font-semibold text-clear-ink no-underline hover:text-clear-ember-text hover:underline">
        {t("compare")}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent hideHeaderRow title={t("compareTitle")} className="gap-5 pt-7 font-clear text-clear-ink">
          <ClearDialogHeader title={t("compareTitle")} subtitle={subtitle} onClose={() => setOpen(false)} closeLabel={t("close")} />
          <div className="flex justify-end">
            <ComparisonPicker cmpA={cmpA} cmpB={cmpB} months={months} />
          </div>
          <MonthComparisonTable statsA={statsA} statsB={statsB} shortA={shortA} shortB={shortB} footnote={footnote} />
        </DialogContent>
      </Dialog>
    </>
  );
}
