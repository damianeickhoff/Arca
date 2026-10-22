"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ContextualTip } from "@/components/contextual-tip";
import { forgetTip } from "@/lib/tips";

const STORAGE_KEY = "arca:whatsNewVersion";

/**
 * "Arca was updated": shown once per version on Home, the first time this device
 * sees a version it has not seen before, pointing at Settings › About for the notes.
 * The tip system remembers a tip id forever, so each new version forgets the id
 * first; the version last shown lives in its own localStorage key.
 */
export function WhatsNewTip({ version, title }: { version: string; title: string }) {
  const t = useTranslations("home.whatsNew");
  const [due, setDue] = useState(false);

  useEffect(() => {
    let last: string | null = null;
    try {
      last = localStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (last === version) return;
    // A first visit ever (no version stored) is not an update: just remember it.
    if (last === null) {
      try {
        localStorage.setItem(STORAGE_KEY, version);
      } catch {
        // not remembered; the card simply shows next time too
      }
      return;
    }
    forgetTip("whatsNew");
    try {
      localStorage.setItem(STORAGE_KEY, version);
    } catch {
      // see above
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setDue(true);
  }, [version]);

  return (
    <ContextualTip
      id="whatsNew"
      active={due}
      title={t("title", { version })}
      body={title ? t("body", { title }) : t("bodyNoTitle")}
    />
  );
}
