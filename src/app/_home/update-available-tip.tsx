"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ContextualTip } from "@/components/contextual-tip";
import { useGuide } from "@/lib/guide-context";

/**
 * "Arca x.y.z is out": shown once per newer version on Home, only while the opt-in
 * update check is on and has found one. The account remembers the version it last
 * announced (lib/guide.ts updateAvailableVersion).
 */
export function UpdateAvailableTip({ version }: { version: string }) {
  const t = useTranslations("home.updateAvailable");
  const { state, update } = useGuide();
  // Decided once, on arrival (see WhatsNewTip).
  const [due] = useState(() => state != null && state.updateAvailableVersion !== version);

  return (
    <ContextualTip
      id="updateAvailable"
      active={due}
      onShown={() => update({ kind: "version", which: "updateAvailable", version })}
      title={t("title", { version })}
      body={t("body")}
    />
  );
}
