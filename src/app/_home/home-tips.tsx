"use client";

import { AnchoredTip } from "@/components/anchored-tip";

/**
 * One-time pointer tips for each new Home section. Only one tip is ever on screen (see
 * lib/tips.ts), so they arrive one per visit, in this order, and each is shown even to
 * someone who turned tips off before the redesign existed.
 */
export function HomeTips() {
  return (
    <>
      <AnchoredTip id="homeSafeToSpend" anchor="homeHero" />
      <AnchoredTip id="homeQuickActions" anchor="homeQuickActions" />
      <AnchoredTip id="homeNudge" anchor="homeNudge" />
      <AnchoredTip id="homeComingUp" anchor="homeComingUp" />
      <AnchoredTip id="homeSpending" anchor="homeSpending" />
    </>
  );
}
