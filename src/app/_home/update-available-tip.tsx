"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ContextualTip } from "@/components/contextual-tip";
import { forgetTip } from "@/lib/tips";

const STORAGE_KEY = "arca:updateAvailableSeen";

/**
 * "Arca x.y.z is out": shown once per newer version on Home, only while the opt-in
 * update check is on and has found one. Same trick as the "was updated" card: the tip
 * id is forgotten whenever the version it announces changes.
 */
export function UpdateAvailableTip({ version }: { version: string }) {
  const t = useTranslations("home.updateAvailable");
  const [due, setDue] = useState(false);

  useEffect(() => {
    let last: string | null = null;
    try {
      last = localStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (last === version) return;
    forgetTip("updateAvailable");
    try {
      localStorage.setItem(STORAGE_KEY, version);
    } catch {
      // not remembered; the card shows again next time
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setDue(true);
  }, [version]);

  return <ContextualTip id="updateAvailable" active={due} title={t("title", { version })} body={t("body")} />;
}
