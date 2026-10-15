"use client";

import { AnchoredTip } from "@/components/anchored-tip";

/**
 * One-time pointer tips for what is new on the Clear Home. Only one tip is ever on
 * screen (see lib/tips.ts), so they arrive one per visit, in this order, and each is
 * shown even to someone who turned tips off before it existed.
 */
export function HomeTips() {
  return (
    <>
      <AnchoredTip id="homeSafeToSpendSum" anchor="homeHero" />
      <AnchoredTip id="homeIncomeVsSpending" anchor="homeIncomeVsSpending" />
      <AnchoredTip id="homeMoneyFlow" anchor="homeMoneyFlow" />
      <AnchoredTip id="homeComingUp" anchor="homeComingUp" />
    </>
  );
}
