import { SplitEur } from "@/components/split-eur";
import { formatEur } from "@/lib/format";

const BUCKETS = [
  { key: "nodig" as const, label: "Needs", color: "var(--color-nodig)" },
  { key: "willen" as const, label: "Wants", color: "var(--color-willen)" },
  { key: "sparen" as const, label: "Savings & Debts", color: "var(--color-sparen)" },
];

export function IncomeCard({
  income,
  strategy,
}: {
  income: number;
  strategy: { nodig: number; willen: number; sparen: number };
}) {
  return (
    <div className="rounded-2xl bg-card p-5">
      <h2 className="font-semibold text-base mb-4">My income</h2>

      <p className="text-sm text-foreground/60 mb-1">Total income this month</p>
      <p className="text-4xl font-medium tabular-nums tracking-tight">
        <SplitEur formatted={formatEur(income)} />
      </p>

      <div className="grid grid-cols-3 gap-3 pt-4 mt-3">
        {BUCKETS.map((bucket) => (
          <div key={bucket.key} className="min-w-0 pl-2 border-l-2" style={{ borderColor: bucket.color }}>
            <p className="text-sm text-foreground/60 truncate">{bucket.label}</p>
            <p className="text-base font-semibold tabular-nums truncate">
              <SplitEur formatted={formatEur(income * (strategy[bucket.key] / 100))} />
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
