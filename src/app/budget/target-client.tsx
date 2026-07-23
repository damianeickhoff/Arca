"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AmountInput } from "@/components/ui/amount-input";
import { formatEur, currencySymbol } from "@/lib/format";
import { Icon } from "@/components/icon";
import { ListItemRow } from "@/components/list-item-row";
import {
  IconAlertTriangleFilled as AlertTriangle,
  IconCheckFilled as Check,
  IconDotsVerticalFilled as EllipsisVertical,
  IconX as X,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export interface TargetRow {
  categoryId: number;
  categoryName: string;
  color: string | null;
  icon: string | null;
  actual: number;
  target: number | null;
  rollover?: number;
  effectiveTarget?: number | null;
  isOverridden: boolean;
  hasDefault: boolean;
}

const DEFAULT_MONTH = "0000-00";

export function BudgetTargetsClient({ rows, month }: { rows: TargetRow[]; month: string }) {
  const router = useRouter();
  const [targets, setTargets] = useState<Record<number, string>>(
    Object.fromEntries(rows.filter((r) => r.target != null).map((r) => [r.categoryId, String(r.target!)]))
  );
  const [savingDefault, setSavingDefault] = useState(false);

  async function save(categoryId: number, value: string, targetMonth = month) {
    const amount = parseFloat(value);
    if (!value || isNaN(amount) || amount < 0) {
      await fetch("/api/budget-targets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, month: targetMonth }),
      });
    } else {
      await fetch("/api/budget-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, month: targetMonth, targetAmount: amount }),
      });
    }
  }

  async function saveAndRefresh(categoryId: number, value: string) {
    await save(categoryId, value);
    router.refresh();
  }

  async function resetOverride(categoryId: number) {
    await fetch("/api/budget-targets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, month }),
    });
    router.refresh();
  }

  async function saveAllAsDefault() {
    setSavingDefault(true);
    await Promise.all(
      rows.map((row) => {
        const value = targets[row.categoryId] ?? "";
        const amount = parseFloat(value);
        const method = !value || isNaN(amount) || amount <= 0 ? "DELETE" : "POST";
        return fetch("/api/budget-targets", {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            method === "POST"
              ? { categoryId: row.categoryId, month: DEFAULT_MONTH, targetAmount: amount }
              : { categoryId: row.categoryId, month: DEFAULT_MONTH }
          ),
        });
      })
    );
    setSavingDefault(false);
    router.refresh();
  }

  return (
    <div className="divide-y">
      {/* Header */}
      <div className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_auto_auto] gap-3 px-1 pb-2 text-xs font-medium text-foreground items-center">
        <span>Category</span>
        <div className="flex items-center gap-2 justify-end">
          <button
            type="button"
            onClick={saveAllAsDefault}
            disabled={savingDefault}
            className="text-xs font-medium text-foreground/50 hover:text-foreground transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
          >
            {savingDefault ? "Saving…" : "Save as default"}
          </button>
          <span className="w-20 text-right">Goal / month</span>
        </div>
        <span className="hidden md:block w-20 text-right">Spent</span>
        <span className="hidden md:block w-20 text-right">Difference</span>
      </div>

      {rows.map((row) => {
        const rawTarget = parseFloat(targets[row.categoryId] ?? "") || null;
        const rollover = row.rollover ?? 0;
        const target = rawTarget !== null ? rawTarget + rollover : null;
        const diff = target !== null ? target - row.actual : null;
        const over = diff !== null && diff < 0;
        const pct = target !== null && target > 0 ? Math.min(100, (row.actual / target) * 100) : null;
        const rawPct = target !== null && target > 0 ? (row.actual / target) * 100 : null;
        const nearBudget = rawPct !== null && rawPct >= 80 && !over;
        const usingDefault = !row.isOverridden && row.hasDefault;

        return (
          <div key={row.categoryId} className="py-2.5 space-y-1.5">
            <div className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_auto_auto] gap-3 items-center text-sm">
              <div className="flex items-center gap-5 min-w-0">
                <Icon iconKey={row.icon} color={row.color} round size="xxl" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-medium truncate leading-tight">{row.categoryName}</span>
                    {(over || nearBudget) && (
                      <AlertTriangle className={`size-3 shrink-0 ${over ? "text-red-500" : "text-amber-500"}`} />
                    )}
                    {usingDefault && (
                      <span className="text-xs font-medium text-foreground/35 bg-foreground/6 rounded px-1 py-0.5 leading-none">default</span>
                    )}
                  </div>
                  <p className="text-xs text-foreground/60 tabular-nums mt-0.5 md:hidden">{formatEur(row.actual)}</p>
                  {rollover > 0 && (
                    <p className="text-[11px] text-emerald-600 tabular-nums mt-0.5">+{formatEur(rollover)} rolled over</p>
                  )}
                </div>
              </div>

              <div className="w-28 flex items-center gap-1 justify-end">
                {row.isOverridden && (
                  <button
                    type="button"
                    onClick={() => resetOverride(row.categoryId)}
                    title="Delete month override, back to default"
                    className="text-foreground/30 hover:text-foreground/60 transition-colors cursor-pointer"
                  >
                    <X className="size-3" />
                  </button>
                )}
                <span className="text-xs text-foreground">{currencySymbol()}</span>
                <AmountInput
                  className={cn("w-20 h-7 text-xs text-right", usingDefault && "text-foreground/50")}
                  placeholder="—"
                  value={targets[row.categoryId] ?? ""}
                  onChange={(e) => setTargets((t) => ({ ...t, [row.categoryId]: e.target.value }))}
                  onBlur={(e) => saveAndRefresh(row.categoryId, e.target.value)}
                />
              </div>

              <span className="hidden md:block w-20 text-right font-medium tabular-nums">{formatEur(row.actual)}</span>

              <span className={`hidden md:block w-20 text-right text-xs font-medium tabular-nums ${diff === null ? "text-foreground" : over ? "text-red-500" : "text-green-600"}`}>
                {diff === null ? "—" : over ? formatEur(-Math.abs(diff)) : formatEur(diff, true)}
              </span>
            </div>

            {pct !== null && (
              <div className="h-1 rounded-full bg-muted overflow-hidden ml-4">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: over ? "var(--danger)" : nearBudget ? "var(--warning)" : "var(--success)" }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Mobile budget-per-category card — icon ring fills with the spent share of the budget.
 * The top-right corner toggle switches every row's budget amount into an editable field at once. */
export function BudgetCategoriesMobile({ rows, month }: { rows: TargetRow[]; month: string }) {
  const router = useRouter();
  const [settingMode, setSettingMode] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const [draft, setDraft] = useState<Record<number, string>>(
    Object.fromEntries(rows.filter((r) => r.target != null).map((r) => [r.categoryId, String(r.target!)]))
  );

  async function save(categoryId: number, value: string, targetMonth = month) {
    const amount = parseFloat(value);
    if (!value || isNaN(amount) || amount < 0) {
      await fetch("/api/budget-targets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, month: targetMonth }),
      });
    } else {
      await fetch("/api/budget-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, month: targetMonth, targetAmount: amount }),
      });
    }
  }

  async function saveAndRefresh(categoryId: number, value: string) {
    await save(categoryId, value);
    router.refresh();
  }

  async function saveAllAsDefault() {
    setSavingDefault(true);
    await Promise.all(rows.map((row) => save(row.categoryId, draft[row.categoryId] ?? "", DEFAULT_MONTH)));
    setSavingDefault(false);
    router.refresh();
  }

  return (
    <div className="rounded-2xl bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-lg mb-1">Budget per category</h2>
          <p className="text-sm text-foreground/60">Expenses per month</p>
        </div>
        <div className="flex items-center gap-2">
          {settingMode && (
            <button
              type="button"
              onClick={saveAllAsDefault}
              disabled={savingDefault}
              className="text-xs font-medium bg-foreground/3 p-3 rounded-sm text-foreground/60 hover:text-foreground transition-colors cursor-pointer disabled:opacity-40"
            >
              {savingDefault ? "Saving…" : "Set as default"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setSettingMode((v) => !v)}
            aria-label={settingMode ? "Done setting up" : "Set up budgets"}
            className={cn(
              "flex items-center justify-center size-10 rounded-full shrink-0 transition-colors",
              settingMode ? "bg-foreground text-white cursor-pointer" : "bg-foreground/3 text-foreground cursor-pointer",
            )}
          >
            {settingMode ? <Check className="size-5" /> : <EllipsisVertical className="size-5" />}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const rollover = row.rollover ?? 0;
          const target = row.effectiveTarget ?? row.target;
          const left = target != null ? target - row.actual : null;
          const over = left !== null && left < 0;
          const spentPct = target != null && target > 0
            ? Math.max(0, Math.min(100, (row.actual / target) * 100))
            : 0;
          const ringColor = over ? "#ef4444" : (row.color ?? "var(--primary)");
          const hasTarget = target != null && target > 0;

          return (
            <ListItemRow
              key={row.categoryId}
              className="rounded-xl bg-foreground/2"
              icon={
                <div className="relative shrink-0 size-14">
                  {hasTarget && (
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{ background: `conic-gradient(${ringColor} ${spentPct * 3.6}deg, color-mix(in srgb, var(--foreground) 0%, transparent) 0deg)` }}
                    />
                  )}
                  <div className={cn("absolute rounded-full bg-[#fafafa] flex items-center justify-center overflow-hidden", hasTarget ? "inset-[2px]" : "inset-0")}>
                    <Icon iconKey={row.icon} color={row.color} size="xxl" round />
                  </div>
                </div>
              }
              name={
                <span className="flex items-center gap-1.5">
                  {row.categoryName}
                  {!row.isOverridden && row.hasDefault && (
                    <span className="text-[10px] font-medium text-foreground/35 bg-foreground/6 rounded px-1 py-0.5 leading-none shrink-0">default</span>
                  )}
                </span>
              }
              subtitle={
                target == null
                  ? "No budget set"
                  : over
                    ? <span className="text-red-500 font-medium">{formatEur(Math.abs(left!))} over budget</span>
                    : rollover > 0
                      ? <span className="text-emerald-600">{formatEur(left!)} left (+{formatEur(rollover)} rolled over)</span>
                      : <>{formatEur(left!)} left to spend</>
              }
              right={
                <div className="text-right shrink-0">
                  {settingMode ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-foreground">{currencySymbol()}</span>
                      <AmountInput
                        className="w-18 h-7 text-xs text-right border-none focus-visible:ring-1 focus-visible:ring-foreground placeholder:text-foreground/80 text-foreground"
                        placeholder="—"
                        value={draft[row.categoryId] ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, [row.categoryId]: e.target.value }))}
                        onBlur={(e) => saveAndRefresh(row.categoryId, e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      />
                    </div>
                  ) : (
                    <>
                      <p className={cn("font-semibold text-lg tabular-nums", !row.isOverridden && row.hasDefault && "text-foreground/50")}>{target != null ? formatEur(target) : "—"}</p>
                      <p className="text-base tabular-nums text-foreground/60">
                        {target != null && target > 0 ? `${Math.round((row.actual / target) * 100)}%` : "—"}
                      </p>
                    </>
                  )}
                </div>
              }
            />
          );
        })}
      </div>
    </div>
  );
}
