"use client";

import { PageTour } from "@/components/page-tour";
import { WhatsNewTip } from "@/app/_home/whats-new-tip";
import { UpdateAvailableTip } from "@/app/_home/update-available-tip";

/**
 * Home's guide: the version cards (after an update, or when a newer one is out, that is
 * the one thing worth saying) and the Home tour, the first time Home has transactions
 * to show. Only one is ever on screen (lib/tips.ts); the rest wait for a later visit.
 */
export function HomeTips({ whatsNew, updateAvailable, hasContent }: { whatsNew: { version: string; title: string }; updateAvailable: string | null; hasContent: boolean }) {
  return (
    <>
      <WhatsNewTip version={whatsNew.version} title={whatsNew.title} />
      {updateAvailable && <UpdateAvailableTip version={updateAvailable} />}
      <PageTour id="home" ready={hasContent} />
    </>
  );
}
