"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { IconReceipt, IconUsers } from "@tabler/icons-react";
import { OptionList } from "@/components/option-list";
import { SettingsNotice } from "@/components/settings/settings-ui";
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
  const tModes = useTranslations("settings.budgetModes");
  const id = useId();
  const [mode, setMode] = useState<SharedCostMode>(initialMode);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function change(next: SharedCostMode) {
    if (next === mode || pending) return;
    const previous = mode;
    setPending(true);
    setFailed(false);
    setMode(next); // optimistic — the action's revalidatePath refreshes the pages behind the dialog
    const result = await setSharedCostModeAction(next).catch(() => ({ error: "failed" }));
    setPending(false);
    if (result?.error) {
      setMode(previous);
      setFailed(true);
    }
  }

  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 px-4 pt-2 font-clear text-clear-ink">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 id={id} className="m-0 text-lg font-bold">{t("settingTitle")}</h3>
        <span className="text-sm text-clear-muted">{tModes("sharedSubtitle")}</span>
      </div>
      <OptionList
        layout="cards"
        labelledBy={id}
        options={[
          { value: "gross", label: t("settingGross"), description: t("settingGrossHint"), icon: <IconReceipt stroke={1.9} /> },
          { value: "net", label: t("settingNet"), description: t("settingNetHint"), icon: <IconUsers stroke={1.9} /> },
        ]}
        value={mode}
        onSelect={change}
        disabled={pending}
      />
      {failed && <SettingsNotice>{tModes("saveError")}</SettingsNotice>}
      <SettingsNotice tone="info">{t("settingFooter")}</SettingsNotice>
    </section>
  );
}
