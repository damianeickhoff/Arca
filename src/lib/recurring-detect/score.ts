import type { DetectedFrequency } from "./types";
import type { AmountResult } from "./amount";
import { MAX_GAP_SPREAD } from "./rhythm";

// Confidence, 0–1: how many periods the series covers, how tight its rhythm is and how
// steady its amount. A curated merchant (RECURRING_MERCHANTS) adds a boost; it never
// stands in for the tests themselves, and never adds an item on its own: every candidate
// is a suggestion the user reviews.

/** Occurrences at which the "how many periods" part is full. */
const FULL_RUN: Record<DetectedFrequency, number> = {
  weekly: 8,
  four_weekly: 6,
  monthly: 6,
  quarterly: 4,
  yearly: 3,
};

/** Lifts a curated merchant's suggestion so it sorts first in the review. */
export const CURATED_BOOST = 0.15;

export type ConfidenceLevel = "high" | "medium" | "low";

export function scoreSeries(input: {
  frequency: DetectedFrequency;
  occurrences: number;
  spread: number;
  missed: number;
  amount: AmountResult;
  curated: boolean;
}): number {
  const run = Math.min(1, input.occurrences / FULL_RUN[input.frequency]);
  const rhythm = Math.max(0, 1 - input.spread / MAX_GAP_SPREAD);
  const amount = input.amount.kind === "variable" ? 0.6 : input.amount.priceChanged ? 0.8 : 1;
  const score = 0.45 * run + 0.25 * rhythm + 0.3 * amount - 0.1 * input.missed + (input.curated ? CURATED_BOOST : 0);
  return Math.round(Math.min(1, Math.max(0, score)) * 100) / 100;
}

export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.6) return "medium";
  return "low";
}
