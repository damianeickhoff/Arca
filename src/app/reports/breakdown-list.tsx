"use client";

import { useState } from "react";
import { formatEur } from "@/lib/format";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { IconCategory2 as CategoryIcon, IconBuildingBank as AccountIcon } from "@tabler/icons-react";

interface CategoryRow { name: string; color: string | null; icon: string | null; total: number }
interface AccountRow { name: string; color: string | null; total: number }

// "Spending by category" / "Income by category" list — with a small Categories/Accounts
// segmented toggle (mirrors the reference design's filter pills) that switches the
// same list between a category breakdown and an account breakdown.
export function BreakdownList({
  title,
  categoryRows,
  accountRows,
  emptyLabel,
}: {
  title: string;
  categoryRows: CategoryRow[];
  accountRows: AccountRow[];
  emptyLabel: string;
}) {
  const [mode, setMode] = useState<"category" | "account">("category");
  const rows = mode === "category" ? categoryRows : accountRows;
  const visible = rows.slice(0, 5);

  return (
    <div className="rounded-2xl bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-2 gap-3">
        <p className="font-semibold text-sm">{title}</p>
        <div className="inline-flex items-center gap-0.5 rounded-full bg-foreground/6 p-0.5 shrink-0">
          {(["category", "account"] as const).map((m) => {
            const active = mode === m;
            const Icon2 = m === "category" ? CategoryIcon : AccountIcon;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "flex items-center justify-center size-7 rounded-full transition-colors",
                  active ? "bg-card text-foreground shadow-sm" : "text-foreground/40",
                )}
                aria-label={m === "category" ? "By category" : "By account"}
              >
                <Icon2 className="size-3.5" />
              </button>
            );
          })}
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-foreground/50 px-5 pb-4">{emptyLabel}</p>
      ) : (
        <div className="divide-y divide-border/40">
          {visible.map((row) => (
            <div key={row.name} className="flex items-center gap-3 px-5 py-3">
              {mode === "category" ? (
                <Icon iconKey={(row as CategoryRow).icon ?? null} color={row.color ?? undefined} size="sm" round />
              ) : (
                <span className="size-8 rounded-full shrink-0" style={{ backgroundColor: row.color ?? "var(--muted)" }} />
              )}
              <span className="flex-1 min-w-0 text-sm font-medium truncate">{row.name}</span>
              <span className="text-sm font-semibold tabular-nums shrink-0">{formatEur(row.total)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
