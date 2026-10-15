"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { OptionList } from "@/components/option-list";
import { setSharedCostModeAction } from "@/app/actions/budget-settings";
import type { SharedCostMode } from "@/lib/app-settings";

// Whether a bill someone pays you back for is reported at its full amount or at your own
// share — read app-wide by every spend surface (dashboard, budget, reports, trends,
// category detail, financial health). See getSharedCostMode in app-settings.ts.
//
// Deliberately does not touch cash flow, the forecast or the bill tracker: the full amount
// really does leave the account on the due date, and those screens exist to say so.
export function SharedCostCard({ initialMode }: { initialMode: SharedCostMode }) {
  const t = useTranslations("sharedCost");
  const [mode, setMode] = useState<SharedCostMode>(initialMode);
  const [pending, setPending] = useState(false);

  const options: { value: SharedCostMode; label: string; description: string }[] = [
    { value: "gross", label: t("settingGross"), description: t("settingGrossHint") },
    { value: "net", label: t("settingNet"), description: t("settingNetHint") },
  ];

  async function change(next: SharedCostMode) {
    if (next === mode || pending) return;
    const previous = mode;
    setPending(true);
    setMode(next); // optimistic — the action's revalidatePath refreshes the pages behind the dialog
    const result = await setSharedCostModeAction(next);
    setPending(false);
    if (result?.error) {
      setMode(previous);
    }
  }

  return (
    <div className="px-4 pt-4 space-y-3">
      <p className="px-2 text-sm font-medium">{t("settingTitle")}</p>
      <OptionList options={options} value={mode} onSelect={change} disabled={pending} />
      <p className="px-2 text-sm text-ink-3">{t("settingFooter")}</p>
    </div>
  );
}
