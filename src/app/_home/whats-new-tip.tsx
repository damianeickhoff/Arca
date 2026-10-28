"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ContextualTip } from "@/components/contextual-tip";
import { useGuide } from "@/lib/guide-context";

/**
 * "Arca was updated": shown once per version on Home, the first time this account sees
 * a version it has not seen before, pointing at Settings › About for the notes. The
 * account remembers the version the card last spoke about (lib/guide.ts
 * whatsNewVersion); a first visit ever only records the version, it shows no card.
 */
export function WhatsNewTip({ version, title }: { version: string; title: string }) {
  const t = useTranslations("home.whatsNew");
  const { state, update } = useGuide();
  const last = state?.whatsNewVersion;
  // Decided once, on arrival: recording the version when the card shows must not take
  // the card away again.
  const [due] = useState(() => last != null && last !== version);

  useEffect(() => {
    if (state && last == null) update({ kind: "version", which: "whatsNew", version });
  }, [state, last, version, update]);

  return (
    <ContextualTip
      id="whatsNew"
      active={due}
      onShown={() => update({ kind: "version", which: "whatsNew", version })}
      title={t("title", { version })}
      body={title ? t("body", { title }) : t("bodyNoTitle")}
    />
  );
}
