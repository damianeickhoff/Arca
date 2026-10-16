"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { IconCircleCheck, IconCircleOff, IconTarget } from "@tabler/icons-react";
import { OptionList } from "@/components/option-list";
import { ClearChip } from "@/components/clear/chip";
import { SettingsNotice } from "@/components/settings/settings-ui";
import { setBudgetRecurringModeAction } from "@/app/actions/budget-settings";
import type { BudgetRecurringMode } from "@/lib/app-settings";

const MODES: { value: BudgetRecurringMode; icon: React.ComponentType<{ stroke?: number }> }[] = [
  { value: "always", icon: IconCircleCheck },
  { value: "budgeted", icon: IconTarget },
  { value: "exclude", icon: IconCircleOff },
];

// Controls how transactions matched to a recurring bill count toward category
// budgets — read app-wide by getBudgetOverview (budget page) and getDashboardData
// (dashboard "Spending by category"). See getBudgetRecurringMode in app-settings.ts.
export function BudgetRecurringCard({ initialMode }: { initialMode: BudgetRecurringMode }) {
  const t = useTranslations("settings.budgetModes");
  const id = useId();
  const [mode, setMode] = useState<BudgetRecurringMode>(initialMode);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function change(next: BudgetRecurringMode) {
    if (next === mode || pending) return;
    const previous = mode;
    setPending(true);
    setFailed(false);
    setMode(next); // optimistic — the action's revalidatePath refreshes the dashboard behind the dialog
    const result = await setBudgetRecurringModeAction(next).catch(() => ({ error: "failed" }));
    setPending(false);
    if (result?.error) {
      setMode(previous);
      setFailed(true);
    }
  }

  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 px-4 pt-2 font-clear text-clear-ink">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={id} className="m-0 text-lg font-bold">{t("billsTitle")}</h3>
          <span className="text-sm text-clear-muted">{t("billsSubtitle")}</span>
        </div>
        <ClearChip tone="mint" icon={<IconCircleCheck stroke={2.2} aria-hidden />}>{t("savesStraightAway")}</ClearChip>
      </div>
      <OptionList
        layout="cards"
        labelledBy={id}
        options={MODES.map(({ value, icon: Icon }) => ({
          value,
          label: t(`bills.${value}`),
          description: t(`bills.${value}Hint`),
          icon: <Icon stroke={1.9} />,
        }))}
        value={mode}
        onSelect={change}
        disabled={pending}
      />
      {failed && <SettingsNotice>{t("saveError")}</SettingsNotice>}
      <p className="m-0 text-sm text-clear-muted">{t("billsFooter")}</p>
    </section>
  );
}
