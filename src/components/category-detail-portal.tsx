"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  IconChevronLeft,
  IconDotsVertical,
  IconPencil,
  IconTag,
  IconEyeOff,
  IconEye,
  IconPencilFilled,
  IconTagFilled,
  IconEyeFilled,
} from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/icon";
import { ListItemRow } from "@/components/list-item-row";
import { NumericKeypad } from "@/components/numeric-keypad";
import { AnimatedAmountDisplay } from "@/components/animated-amount-display";
import { acquireNavHidden } from "@/lib/nav-visibility";
import { formatEur } from "@/lib/format";
import { CategoryPeriodPicker, resolveCategoryPeriod, periodDescriptor, type CategoryPeriod } from "@/components/category-period-picker";
import { CategorySpendChart } from "@/components/category-spend-chart";
import { CategoryInsightCards } from "@/components/category-insight-cards";
import { CategorySettingsClient } from "@/components/settings/categories/category-settings-client";
import { bucketUnitFor } from "@/lib/category-period-bucket";
import { periodElapsedPct, type FinancialMonthConfig } from "@/lib/date-range";
import type { CategoryDetail } from "@/lib/category-detail";
import type { Category, CategoryRule, Bank } from "@/db/schema";

export interface CategorySpendingCard {
  categoryId: number;
  categoryName: string;
  color: string | null;
  icon: string | null;
}

const springOut = "cubic-bezier(0.32, 0.72, 0, 1)";
const springIn = "cubic-bezier(0.16, 1, 0.3, 1)";

function daysBetween(from: string, to: string) {
  return Math.max(1, Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000) + 1);
}

/** Digit-entry reducer + numpad — same mechanic as BudgetPortal's category quick-edit
 * (src/components/budget-portal.tsx), reproduced here since it's not exported there. */
function nextAmountValue(cur: string, k: string): string {
  if (k === "back") return cur.length <= 1 ? "0" : cur.slice(0, -1);
  if (k === ",") return cur.includes(",") ? cur : `${cur},`;
  const next = cur === "0" ? k : cur + k;
  return next.replace(/^0+(?=\d)/, "");
}

const NUMPAD_DIGIT_CLASS = "h-14 rounded-xl bg-card text-2xl font-medium flex items-center justify-center active:bg-foreground/10 transition-colors";

function Numpad({ onKey }: { onKey: (k: string) => void }) {
  return (
    <div className="px-4">
      <NumericKeypad onKey={onKey} digitClassName={NUMPAD_DIGIT_CLASS} />
    </div>
  );
}

function groupByDate(rows: CategoryDetail["transactions"]) {
  const groups: { date: string; total: number; rows: CategoryDetail["transactions"] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.date === row.date) {
      last.rows.push(row);
      last.total += row.amount;
    } else {
      groups.push({ date: row.date, total: row.amount, rows: [row] });
    }
  }
  return groups;
}

export function CategoryDetailPortal({
  category,
  financialMonth,
  budgetPeriod,
  onClose,
  direction = "expense",
}: {
  category: CategorySpendingCard | null;
  financialMonth: FinancialMonthConfig;
  budgetPeriod: { from: string; to: string };
  onClose: () => void;
  /** "income" skips everything that only makes sense for a budgeted expense
   * category — the insight cards, the suggested-limit callout, and the
   * edit-budget / hide-from-spending-row menu items — while reusing the same
   * header, chart, and transaction list. */
  direction?: "income" | "expense";
}) {
  const router = useRouter();
  const isIncome = direction === "income";
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const refDays = daysBetween(budgetPeriod.from, budgetPeriod.to);
  const [period, setPeriod] = useState<CategoryPeriod>(() => resolveCategoryPeriod("budget", financialMonth, budgetPeriod));
  const [detail, setDetail] = useState<CategoryDetail | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [editBudgetOpen, setEditBudgetOpen] = useState(false);
  const [editBudgetAmount, setEditBudgetAmount] = useState("0");
  const [savingBudget, setSavingBudget] = useState(false);

  const [editCategoryOpen, setEditCategoryOpen] = useState(false);
  const [editCategoryData, setEditCategoryData] = useState<{ category: Category; rules: CategoryRule[]; banks: Bank[]; categories: Category[] } | null>(null);
  const [loadingEditCategory, setLoadingEditCategory] = useState(false);

  const open = category != null;

  // A different category opening always resets back to the default period.
  useEffect(() => {
    if (category) setPeriod(resolveCategoryPeriod("budget", financialMonth, budgetPeriod));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category?.categoryId]);

  const rangeDays = daysBetween(period.from, period.to);
  const avgUnit = bucketUnitFor(period.preset, rangeDays);

  useEffect(() => {
    if (!category) return;
    let cancelled = false;
    fetch(`/api/categories/${category.categoryId}/detail?from=${period.from}&to=${period.to}&refDays=${refDays}&unit=${avgUnit}&direction=${direction}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setDetail(d); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category?.categoryId, period.from, period.to, refDays, avgUnit, refreshKey]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Hide the mobile bottom nav while this full-screen portal is open — otherwise
  // it floats above the portal's content since the nav sits at a higher z-index.
  useEffect(() => {
    if (!open) return;
    return acquireNavHidden();
  }, [open]);

  function close() {
    onClose();
    setEditBudgetOpen(false);
    setEditCategoryOpen(false);
    setDetail(null);
  }

  function openEditBudget() {
    setEditBudgetAmount(detail?.budget && detail.budget > 0 ? String(Math.round(detail.budget)) : "0");
    setEditBudgetOpen(true);
  }

  async function saveBudget(amountOverride?: number) {
    if (!category) return;
    const val = amountOverride ?? (parseFloat(editBudgetAmount.replace(",", ".")) || 0);
    setSavingBudget(true);
    await fetch("/api/budget-targets", {
      method: val > 0 ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        val > 0
          ? { categoryId: category.categoryId, month: "0000-00", targetAmount: val }
          : { categoryId: category.categoryId, month: "0000-00" },
      ),
    });
    setSavingBudget(false);
    setEditBudgetOpen(false);
    setRefreshKey((k) => k + 1);
    router.refresh();
  }

  async function openEditCategory() {
    if (!category) return;
    setLoadingEditCategory(true);
    setEditCategoryOpen(true);
    const [allCategories, rules, banks] = await Promise.all([
      fetch("/api/categories").then((r) => r.json() as Promise<Category[]>),
      fetch(`/api/category-rules?categoryId=${category.categoryId}`).then((r) => r.json() as Promise<CategoryRule[]>),
      fetch("/api/banks").then((r) => r.json() as Promise<Bank[]>),
    ]);
    const cat = allCategories.find((c) => c.id === category.categoryId) ?? null;
    if (cat) setEditCategoryData({ category: cat, rules, banks, categories: allCategories });
    setLoadingEditCategory(false);
  }

  function closeEditCategory() {
    setEditCategoryOpen(false);
    setEditCategoryData(null);
    setRefreshKey((k) => k + 1);
    router.refresh();
  }

  async function toggleExcludeFromSpendingRow() {
    if (!category || !detail) return;
    await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: category.categoryId, excludeFromSpendingRow: !detail.excludeFromSpendingRow }),
    });
    setRefreshKey((k) => k + 1);
    router.refresh();
  }

  const verb = isIncome ? "Received" : "Spent";
  const spentThisPeriodLabel = period.preset === "custom" ? verb : `${verb} in ${period.label.toLowerCase() === "budget period" ? "this period" : period.label.toLowerCase()}`;

  return (
    <>
      {mounted &&
        createPortal(
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-x-0 bottom-0 bg-[var(--dialog-background)]"
              style={{
                top: 0,
                zIndex: 45,
                opacity: open ? 1 : 0,
                pointerEvents: "none",
                transition: open ? "opacity 480ms cubic-bezier(0.25, 0, 0.15, 1)" : "opacity 320ms ease",
              }}
            />

            {/* Content */}
            <div
              className="fixed inset-x-0 bottom-0 flex flex-col overflow-hidden"
              style={{
                top: 0,
                zIndex: 45,
                opacity: open ? 1 : 0,
                transform: open ? "translateY(0)" : "translateY(24px)",
                transition: open
                  ? `opacity 400ms ease 180ms, transform 500ms ${springIn} 160ms`
                  : `opacity 220ms ease, transform 260ms ${springOut}`,
                pointerEvents: open ? "auto" : "none",
              }}
            >
              {category?.color && (
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-90 pointer-events-none"
                  style={{ background: `linear-gradient(to bottom, ${category.color}33, transparent)` }}
                />
              )}

              {/* Header */}
              <div className="relative shrink-0 grid grid-cols-[auto_1fr_auto] items-center gap-2 px-4 mb-9" style={{ paddingTop: "calc(0.75rem + var(--sat))" }}>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Back"
                  className="size-11 rounded-full bg-white dark:bg-white/7 backdrop-blur-xs flex items-center justify-center active:scale-[0.97] transition-transform"
                >
                  <IconChevronLeft className="size-5" />
                </button>
                <h1 className="text-lg text-foreground text-center truncate">{category?.categoryName}</h1>
                <div className="flex items-center justify-end gap-2">
                  {category && (
                    <CategoryPeriodPicker
                      value={period}
                      onChange={setPeriod}
                      financialMonth={financialMonth}
                      budgetPeriod={budgetPeriod}
                    />
                  )}
                  {/* modal={false}: this portal already owns its own body-scroll lock (see
                      the `open` effect above) — a modal menu's own scroll-lock/focus-trap
                      acquisition races that lock (base-ui's is timeout-deferred), which can
                      leave scrolling stuck for a moment after the menu closes. Same fix as
                      category-picker.tsx / transaction-filter-bar.tsx. */}
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger className="size-11 rounded-full bg-white dark:bg-white/7 flex items-center justify-center active:scale-95 transition-transform">
                      <IconDotsVertical className="size-5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {!isIncome && (
                        <DropdownMenuItem onClick={openEditBudget}>
                          <IconPencilFilled className="size-4 mr-2" /> Edit budget
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={openEditCategory}>
                        <IconTagFilled className="size-4 mr-2" /> Edit category
                      </DropdownMenuItem>
                      {!isIncome && detail && (
                        <DropdownMenuItem onClick={toggleExcludeFromSpendingRow}>
                          {detail.excludeFromSpendingRow ? (
                            <><IconEyeFilled className="size-4 mr-2" /> Show in spending row</>
                          ) : (
                            <><IconEyeOff className="size-4 mr-2" /> Hide from spending row</>
                          )}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Body */}
              <div className="relative flex-1 overflow-y-auto overflow-x-hidden" style={{ WebkitOverflowScrolling: "touch" }}>
                {category && detail && (
                  <div className="pb-[calc(2rem+var(--sab))]">
                    <div className="flex items-start justify-between px-4">
                      <div>
                        <p className="text-lg text-foreground/60">{spentThisPeriodLabel}</p>
                        <p
                          className="text-4xl font-semibold tabular-nums tracking-tight mt-1"
                          style={isIncome ? { color: "var(--color-income)" } : undefined}
                        >
                          {isIncome ? "+" : ""}{formatEur(detail.spent)}
                        </p>
                      </div>
                      <Icon iconKey={category.icon} color={category.color} size="xxl" round />
                    </div>

                    <div className="mt-4 mx-4">
                      <CategorySpendChart
                        key={`${category.categoryId}-${period.from}-${period.to}`}
                        data={detail.chart}
                        budget={detail.budget}
                        color={category.color}
                      />
                    </div>

                    {/* Suggested limit — only when there's no budget yet and enough spend
                        history to project a pace from (detail.forecast, the same figure
                        the Forecast insight card shows). */}
                    {!isIncome && !(detail.budget && detail.budget > 0) && detail.forecast != null && detail.forecast > 0 && (
                      <div className="mt-4 mb-3 mx-4 rounded-3xl text-bold bg-[var(--dialog-content-background)] p-5">
                        <p className="text-md font-medium text-foreground/60 text-center">Suggested category limit</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-center">{formatEur(Math.round(detail.forecast))}</p>
                        <p className="mt-1 text-sm text-foreground/60 text-center">Projected from your current spending pace</p>
                        <button
                          type="button"
                          onClick={() => saveBudget(Math.round(detail.forecast!))}
                          disabled={savingBudget}
                          className="mt-3 w-full h-11 rounded-full bg-foreground text-background dark:bg-white/13 text-sm dark:text-foreground active:scale-[0.98] transition-transform disabled:opacity-50"
                        >
                          {savingBudget ? "Saving…" : "Use suggested limit"}
                        </button>
                      </div>
                    )}

                    {!isIncome && (
                      <div className="mt-2">
                        <CategoryInsightCards detail={detail} color={category.color} periodElapsedPct={periodElapsedPct(period.from, period.to)} periodLabel={periodDescriptor(period.preset)} />
                      </div>
                    )}

                    {detail.transactions.length > 0 && (
                      <div className="mt-6 space-y-1">
                        {groupByDate(detail.transactions).map((g) => (
                          <div key={g.date}>
                            <div className="flex items-center justify-between px-6 py-2">
                              <p className="text-sm font-medium text-foreground/60">
                                {new Date(`${g.date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                              </p>
                              <p className="text-sm font-medium text-foreground/60 tabular-nums">{formatEur(g.total)}</p>
                            </div>
                            <div className="rounded-xl bg-[var(--dialog-content-background)] mx-3 overflow-hidden">
                              {g.rows.map((t) => (
                                <ListItemRow
                                  key={t.id}
                                  icon={<Icon iconKey={category.icon} color={category.color} size="lg" round />}
                                  name={t.name}
                                  subtitle={t.account ?? undefined}
                                  right={<span className="font-semibold text-base tabular-nums">{formatEur(t.amount)}</span>}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Edit budget — numpad overlay, stacked above the detail portal ── */}
            {editBudgetOpen && category && (
              <div className="fixed inset-0 z-[46] bg-background flex flex-col" style={{ paddingTop: "var(--sat)" }}>
                <div className="flex items-center justify-between px-4 h-14 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditBudgetOpen(false)}
                    aria-label="Close"
                    className="glass-icon-btn size-10"
                  >
                    <IconChevronLeft className="size-5" />
                  </button>
                  <div className="flex items-center gap-2 min-w-0 max-w-[55%]">
                    <Icon iconKey={category.icon} color={category.color} size="sm" round />
                    <h1 className="font-bold text-lg truncate">{category.categoryName}</h1>
                  </div>
                  <div className="size-10" />
                </div>

                <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                  <p className="text-foreground/60 mb-4">Set a budget for this category</p>
                  <div className="text-6xl font-semibold tracking-tight tabular-nums">
                    <AnimatedAmountDisplay value={editBudgetAmount} prefixClassName="text-foreground/40 mr-1" />
                  </div>
                </div>

                <Numpad onKey={(k) => setEditBudgetAmount((cur) => nextAmountValue(cur, k))} />

                <div className="px-4 pt-3 pb-[calc(0.75rem+var(--sab))]">
                  <button
                    type="button"
                    onClick={() => saveBudget()}
                    disabled={savingBudget}
                    className="w-full h-14 rounded-full bg-foreground text-background font-semibold text-base active:scale-[0.98] transition-transform disabled:opacity-50"
                  >
                    {savingBudget ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            )}

            {/* ── Edit category — reuses CategorySettingsClient's embedded mode ── */}
            {editCategoryOpen && (
              <div className="fixed inset-0 z-[46] bg-background overflow-y-auto">
                {loadingEditCategory || !editCategoryData ? (
                  <div className="flex items-center justify-center h-full text-foreground/50 text-sm">Loading…</div>
                ) : (
                  <CategorySettingsClient
                    category={editCategoryData.category}
                    rules={editCategoryData.rules}
                    banks={editCategoryData.banks}
                    categories={editCategoryData.categories}
                    onClose={closeEditCategory}
                  />
                )}
              </div>
            )}
          </>,
          document.body,
        )}
    </>
  );
}
