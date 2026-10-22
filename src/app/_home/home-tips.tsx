"use client";

import { AnchoredTip } from "@/components/anchored-tip";
import { WhatsNewTip } from "@/app/_home/whats-new-tip";

/**
 * One-time pointer tips for what is new on the Clear Home. Only one tip is ever on
 * screen (see lib/tips.ts), so they arrive one per visit, in this order, and each is
 * shown even to someone who turned tips off before it existed. The version card goes
 * first: after an update it is the one thing worth saying.
 */
export function HomeTips({ whatsNew }: { whatsNew: { version: string; title: string } }) {
  return (
    <>
      <WhatsNewTip version={whatsNew.version} title={whatsNew.title} />
      <AnchoredTip id="homeSafeToSpendSum" anchor="homeHero" />
      <AnchoredTip id="privacyEye" anchor="privacyEye" />
      <AnchoredTip id="homeIncomeVsSpending" anchor="homeIncomeVsSpending" />
      <AnchoredTip id="homeMoneyFlow" anchor="homeMoneyFlow" />
      <AnchoredTip id="homeNetWorth" anchor="homeNetWorth" />
      <AnchoredTip id="homeBudgetLink" anchor="homeBudgetLink" />
      <AnchoredTip id="homeComingUp" anchor="homeComingUp" />
    </>
  );
}
