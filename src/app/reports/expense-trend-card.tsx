"use client";

import { useState } from "react";
import {
  NeedsWantsBarChart,
  NeedsWantsFilterControl,
  type NeedsWantsFilter,
} from "@/components/dashboard-charts";

export function ExpenseTrendCard({
  data,
  periodLabel,
}: {
  data: { month: string; nodig: number; willen: number }[];
  periodLabel: string;
}) {
  const [filter, setFilter] = useState<NeedsWantsFilter>("beide");

  return (
    <div className="rounded-2xl bg-card p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-sm pb-1">Expenses per period</h2>
          <p className="text-xs text-foreground/60 truncate">{periodLabel}</p>
        </div>
        <NeedsWantsFilterControl filter={filter} onChange={setFilter} />
      </div>
      <NeedsWantsBarChart data={data} filter={filter} />
    </div>
  );
}
