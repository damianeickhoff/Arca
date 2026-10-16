"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { ClearSwitch } from "@/components/clear/switch";
import { SettingsNotice } from "@/components/settings/settings-ui";
import { setOverdraftModeAction } from "@/app/actions/budget-settings";
import type { OverdraftMode } from "@/lib/app-settings";

/**
 * Whether unused overdraft room counts as money you can spend (see getOverdraftMode).
 * Shown on the Accounts panel once any bank account has an overdraft limit.
 */
export function OverdraftModeSwitch({ initialMode }: { initialMode: OverdraftMode }) {
  const t = useTranslations("accountForms.overdraftMode");
  const id = useId();
  const [mode, setMode] = useState<OverdraftMode>(initialMode);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function change(spendable: boolean) {
    if (pending) return;
    const previous = mode;
    const next: OverdraftMode = spendable ? "spendable" : "buffer";
    setPending(true);
    setFailed(false);
    setMode(next); // optimistic — the action's revalidatePath refreshes the forecast and Home
    const result = await setOverdraftModeAction(next).catch(() => ({ error: "failed" }));
    setPending(false);
    if (result?.error) {
      setMode(previous);
      setFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4 rounded-clear-tile bg-clear-tile px-4 py-3.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span id={`${id}-label`} className="text-[15px] font-bold">{t("title")}</span>
          <span className="text-[13px] text-clear-muted">{t("hint")}</span>
        </div>
        <ClearSwitch checked={mode === "spendable"} onCheckedChange={change} labelledBy={`${id}-label`} disabled={pending} />
      </div>
      {failed && <SettingsNotice>{t("saveError")}</SettingsNotice>}
    </div>
  );
}
