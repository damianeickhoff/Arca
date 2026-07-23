"use client";

import { MonthPicker } from "@/components/month-picker";

export function ComparisonPicker({ cmpA, cmpB }: { cmpA: string; cmpB: string }) {
  return (
    <div className="flex items-center gap-2 text-sm flex-wrap">
      <MonthPicker current={cmpA} variant="pill" paramName="cmpA" />
      <span className="text-muted-foreground text-xs">vs</span>
      <MonthPicker current={cmpB} variant="pill" paramName="cmpB" />
    </div>
  );
}
