"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconAlertTriangle, IconArrowRight, IconCircleCheck, IconPencil, IconTag } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogFooter, ClearDialogFooterDock, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField } from "@/components/clear/field";
import { ClearChip } from "@/components/clear/chip";
import { ClearProgress } from "@/components/clear/progress";
import { ClearSwitch } from "@/components/clear/switch";
import { Segmented } from "@/components/clear/segmented";
import { Amount } from "@/components/clear/amount";
import { ListRow } from "@/components/clear/list-row";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { Icon } from "@/components/icon";
import { AnchoredTip } from "@/components/anchored-tip";
import { TransactionDetailByIdDialog } from "@/components/transaction-detail-by-id-dialog";
import { CategoryPeriodPicker, resolveCategoryPeriod, type CategoryPeriod } from "@/components/category-period-picker";
import { EditCategoryDialog as EditCategoryShell, EditCategoryForm } from "@/components/settings/categories/category-settings-client";
import { GroupDialog } from "@/components/settings/categories/group-dialog";
import { bucketUnitFor, type BucketUnit } from "@/lib/category-period-bucket";
import { currencySymbol, formatEur, formatEurWhole, normalizeBudgetType } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FinancialMonthConfig } from "@/lib/date-range";
import type { CategoryDetail } from "@/lib/category-detail";
import type { Category, CategoryRule, Bank } from "@/db/schema";
import { MoneyText, SvgMoneyText } from "@/components/clear/money";

export interface CategorySpendingCard {
  categoryId: number;
  categoryName: string;
  color: string | null;
  icon: string | null;
}

const DAY_MS = 86_400_000;

function daysBetween(from: string, to: string) {
  return Math.max(1, Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / DAY_MS) + 1);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * One category in full (Popup-CategoryDetail): what was spent against the budget and
 * the pace, the forecast and stats, the last six months (weeks, days) against the
 * budget or the running total this period, where the money went, the latest
 * transactions (each opens its transaction), the spending-overview toggle, and edit
 * budget / edit category. `direction="income"` keeps the same shape without the
 * budget parts. A centred modal on desktop, a bottom sheet on phones.
 */
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
   * category — the stats, the suggested budget, edit budget and the
   * spending-overview toggle — while reusing the same header, chart and lists. */
  direction?: "income" | "expense";
}) {
  const t = useTranslations("categoryDetail");
  const router = useRouter();

  // Keep the last category through the close animation.
  const [lastCategory, setLastCategory] = useState<CategorySpendingCard | null>(category);
  if (category && category !== lastCategory) setLastCategory(category);
  const shown = category ?? lastCategory;
  const open = category != null;

  // A different category opening always starts from the budget period.
  const [period, setPeriod] = useState<CategoryPeriod>(() => resolveCategoryPeriod("budget", financialMonth, budgetPeriod));
  const [periodFor, setPeriodFor] = useState<number | null>(category?.categoryId ?? null);
  // Tracked through null too, so reopening the same category also starts over.
  if ((category?.categoryId ?? null) !== periodFor) {
    setPeriodFor(category?.categoryId ?? null);
    if (category) setPeriod(resolveCategoryPeriod("budget", financialMonth, budgetPeriod));
  }

  const refDays = daysBetween(budgetPeriod.from, budgetPeriod.to);
  const unit = bucketUnitFor(period.preset, daysBetween(period.from, period.to));

  const [refreshKey, setRefreshKey] = useState(0);
  const requestKey = shown ? `${shown.categoryId}|${period.from}|${period.to}|${unit}|${direction}` : null;
  const [loaded, setLoaded] = useState<{ key: string; detail: CategoryDetail } | null>(null);
  // While a new period loads, the previous figures for the same category stay up.
  const detail = loaded && shown && loaded.detail.categoryId === shown.categoryId ? loaded.detail : null;
  const stale = loaded?.key !== requestKey;

  const categoryId = category?.categoryId ?? null;
  useEffect(() => {
    if (categoryId == null) return;
    let cancelled = false;
    const key = `${categoryId}|${period.from}|${period.to}|${unit}|${direction}`;
    fetch(`/api/categories/${categoryId}/detail?from=${period.from}&to=${period.to}&refDays=${refDays}&unit=${unit}&direction=${direction}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CategoryDetail | null) => { if (!cancelled && d) setLoaded({ key, detail: d }); })
      .catch(() => { /* the dialog stays on its loading state */ });
    return () => { cancelled = true; };
  }, [categoryId, period.from, period.to, refDays, unit, direction, refreshKey]);

  const [budgetOpen, setBudgetOpen] = useState(false);
  const [editCategoryOpen, setEditCategoryOpen] = useState(false);
  const [openTransactionId, setOpenTransactionId] = useState<number | null>(null);

  function refresh() {
    setRefreshKey((k) => k + 1);
    router.refresh();
  }

  async function saveBudget(amount: number) {
    if (!shown) return;
    await fetch("/api/budget-targets", {
      method: amount > 0 ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        amount > 0
          ? { categoryId: shown.categoryId, month: "0000-00", targetAmount: amount }
          : { categoryId: shown.categoryId, month: "0000-00" },
      ),
    });
    refresh();
  }

  async function toggleSpendingRow(show: boolean) {
    if (!shown) return;
    await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: shown.categoryId, excludeFromSpendingRow: !show }),
    });
    refresh();
  }

  const isIncome = direction === "income";
  const activityHref = shown
    ? `/transactions?category=${shown.categoryId}&from=${period.from}&to=${period.to}${isIncome ? "&direction=income" : ""}`
    : "/transactions";

  return (
    <>
      <AnchoredTip id="categoryMerchants" anchor="categoryMerchants" active={open && !!detail && detail.transactions.length > 0 && !budgetOpen && !editCategoryOpen && openTransactionId == null} />

      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent hideHeaderRow title={shown?.categoryName ?? t("title")} className="gap-[18px] pt-6">
          {shown && (
            <>
              <DetailBody
                category={shown}
                detail={detail}
                stale={stale}
                period={period}
                onPeriodChange={setPeriod}
                financialMonth={financialMonth}
                budgetPeriod={budgetPeriod}
                refDays={refDays}
                unit={unit}
                isIncome={isIncome}
                onUseSuggested={(amount) => saveBudget(amount)}
                onToggleSpendingRow={toggleSpendingRow}
                onOpenTransaction={setOpenTransactionId}
                onClose={onClose}
              />

              <ClearDialogFooterDock className="pb-1">
                <ClearDialogFooter
                  destructive={
                    <button type="button" onClick={() => setEditCategoryOpen(true)} className={clearButtonVariants({ variant: "ghost" })}>
                      <IconTag aria-hidden />
                      {detail?.isGroup ? t("editGroup") : t("editCategory")}
                    </button>
                  }
                >
                  {!isIncome && (
                    <button type="button" onClick={() => setBudgetOpen(true)} disabled={!detail} className={clearButtonVariants({ variant: "secondary" })}>
                      <IconPencil aria-hidden />
                      {t("editBudget")}
                    </button>
                  )}
                  <Link href={activityHref} onClick={onClose} className={clearButtonVariants()}>
                    {t("viewAll")}
                    <IconArrowRight aria-hidden />
                  </Link>
                </ClearDialogFooter>
              </ClearDialogFooterDock>

              <BudgetDialog
                open={budgetOpen}
                onOpenChange={setBudgetOpen}
                name={shown.categoryName}
                current={detail?.budgetTarget ?? null}
                weekly={refDays <= 9}
                onSave={saveBudget}
              />

              <EditCategoryDialog
                open={editCategoryOpen}
                categoryId={shown.categoryId}
                onClose={() => { setEditCategoryOpen(false); refresh(); }}
              />

              {/* Recategorising can move the transaction out of this category, so a
                  close refetches the detail. */}
              <TransactionDetailByIdDialog
                transactionId={openTransactionId}
                onClose={() => { setOpenTransactionId(null); setRefreshKey((k) => k + 1); }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

const BUDGET_TYPE_KEY: Record<string, "need" | "want" | "saving"> = { nodig: "need", willen: "want", sparen: "saving" };

function DetailBody({
  category,
  detail,
  stale,
  period,
  onPeriodChange,
  financialMonth,
  budgetPeriod,
  refDays,
  unit,
  isIncome,
  onUseSuggested,
  onToggleSpendingRow,
  onOpenTransaction,
  onClose,
}: {
  category: CategorySpendingCard;
  detail: CategoryDetail | null;
  stale: boolean;
  period: CategoryPeriod;
  onPeriodChange: (p: CategoryPeriod) => void;
  financialMonth: FinancialMonthConfig;
  budgetPeriod: { from: string; to: string };
  refDays: number;
  unit: BucketUnit;
  isIncome: boolean;
  onUseSuggested: (amount: number) => Promise<void>;
  onToggleSpendingRow: (show: boolean) => Promise<void>;
  onOpenTransaction: (id: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("categoryDetail");
  const weekly = refDays <= 9;

  const budgetTypeKey = detail?.budgetType ? BUDGET_TYPE_KEY[normalizeBudgetType(detail.budgetType)] : undefined;
  const subtitle = isIncome
    ? t("income")
    : [
        budgetTypeKey ? t(`budgetTypes.${budgetTypeKey}`) : null,
        detail?.budgetTarget ? t(weekly ? "budgetWeek" : "budgetMonth", { amount: formatEur(detail.budgetTarget) }) : null,
      ].filter(Boolean).join(" · ") || undefined;

  return (
    <>
      <ClearDialogHeader
        title={category.categoryName}
        subtitle={<MoneyText>{subtitle}</MoneyText>}
        icon={<Icon iconKey={category.icon} color={category.color} size="xl" soft />}
        onClose={onClose}
        closeLabel={t("close")}
      />

      <CategoryPeriodPicker value={period} onChange={onPeriodChange} financialMonth={financialMonth} budgetPeriod={budgetPeriod} />

      {!detail ? (
        <div role="status" aria-busy className="flex flex-col gap-3">
          <span className="sr-only">{t("loading")}</span>
          <div className="h-[52px] w-40 animate-pulse rounded-clear-tile bg-clear-tile" />
          <div className="h-3 animate-pulse rounded-full bg-clear-tile" />
          <div className="h-44 animate-pulse rounded-clear-tile bg-clear-tile" />
        </div>
      ) : (
        <div className={cn("flex flex-col gap-[18px] transition-opacity", stale && "opacity-60")} aria-busy={stale || undefined}>
          <Headline detail={detail} period={period} isIncome={isIncome} />

          {!isIncome && !(detail.budget && detail.budget > 0) && detail.forecast != null && detail.forecast > 0 && (
            <SuggestedBudget forecast={detail.forecast} rangeDays={daysBetween(detail.from, detail.to)} refDays={refDays} onUse={onUseSuggested} />
          )}

          {!isIncome && detail.transactions.length > 0 && <Stats detail={detail} />}

          <ChartTile detail={detail} unit={unit} refDays={refDays} isIncome={isIncome} name={category.categoryName} />

          {detail.transactions.length > 0 ? (
            <Breakdown detail={detail} category={category} isIncome={isIncome} onOpenTransaction={onOpenTransaction} />
          ) : (
            <p className="m-0 rounded-clear-tile bg-clear-tile px-4 py-5 text-center text-[15px] text-clear-muted">{t("empty")}</p>
          )}

          {!isIncome && (
            <div className="flex items-center justify-between gap-4 rounded-clear-tile border border-clear-line px-4 py-3">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span id="category-spending-row" className="text-[15px] font-bold">{t("spendingRow")}</span>
                <span className="text-[13px] text-clear-muted">{t("spendingRowHint", { name: category.categoryName })}</span>
              </span>
              <ClearSwitch
                checked={!detail.excludeFromSpendingRow}
                onCheckedChange={(v) => { void onToggleSpendingRow(v); }}
                labelledBy="category-spending-row"
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** The big figure, the budget bar with a "today" marker, and the pace line. */
function Headline({ detail, period, isIncome }: { detail: CategoryDetail; period: CategoryPeriod; isIncome: boolean }) {
  const t = useTranslations("categoryDetail");
  const locale = useLocale();
  const short = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const when = period.preset === "custom"
    ? t("period.when.custom", { from: short.format(new Date(`${period.from}T12:00:00`)), to: short.format(new Date(`${period.to}T12:00:00`)) })
    : t(`period.when.${period.preset}`);
  const budget = detail.budget && detail.budget > 0 ? detail.budget : null;
  const spent = detail.spent;
  const today = todayISO();
  const running = today >= detail.from && today <= detail.to;
  const days = daysBetween(detail.from, detail.to);
  const day = running ? daysBetween(detail.from, today) : null;
  const elapsed = day != null ? day / days : null;
  const evenPace = budget != null && elapsed != null ? budget * elapsed : null;

  const status = budget == null || isIncome
    ? null
    : spent > budget
      ? { tone: "rose" as const, text: t("status.over"), icon: <IconAlertTriangle stroke={2.2} aria-hidden /> }
      : spent / budget >= 0.85 || (evenPace != null && spent > evenPace * 1.1)
        ? { tone: "butter" as const, text: t("status.close"), icon: <IconAlertTriangle stroke={2.2} aria-hidden /> }
        : { tone: "mint" as const, text: t("status.onPace"), icon: <IconCircleCheck stroke={2.2} aria-hidden /> };

  const b = (chunks: React.ReactNode) => <b className="font-bold text-clear-ink">{chunks}</b>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Amount
            value={spent}
            sign={isIncome ? "always" : "none"}
            className={cn("text-[40px] sm:text-[52px]", isIncome && "text-clear-positive")}
          />
          <span className="text-[15px] text-clear-ink-2">
            <MoneyText>{budget != null && !isIncome
              ? spent > budget
                ? t.rich("ofBudgetOver", { budget: formatEur(budget), over: formatEur(spent - budget), b })
                : t.rich("ofBudget", { budget: formatEur(budget), left: formatEur(budget - spent), b })
              : t(isIncome ? "receivedIn" : "spentIn", { when })}</MoneyText>
          </span>
        </div>
        {status && <ClearChip tone={status.tone} icon={status.icon}>{status.text}</ClearChip>}
      </div>

      {budget != null && !isIncome && (
        <>
          <ClearProgress
            value={Math.min(1, spent / budget)}
            hatchRemainder
            marker={elapsed ?? undefined}
            fillClassName={spent > budget ? "bg-clear-negative-fill" : "bg-clear-positive-fill"}
          />
          {day != null && evenPace != null && (
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[13px] text-clear-muted">
              <span><MoneyText>{t("pace", { day, days, amount: formatEur(evenPace) })}</MoneyText></span>
              <span className="font-bold text-clear-ink-2">{t("daysLeft", { count: days - day })}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** No budget yet: offer the projected pace, scaled back to one budget period. */
function SuggestedBudget({ forecast, rangeDays, refDays, onUse }: { forecast: number; rangeDays: number; refDays: number; onUse: (amount: number) => Promise<void> }) {
  const t = useTranslations("categoryDetail");
  const [busy, setBusy] = useState(false);
  const amount = Math.round(forecast * (refDays / Math.max(1, rangeDays)));
  if (amount <= 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-clear-tile bg-clear-sky px-4 py-3.5 text-clear-sky-ink">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-bold text-clear-ink"><MoneyText>{t("suggested.title", { amount: formatEur(amount) })}</MoneyText></span>
        <span className="text-[13px]">{t("suggested.body")}</span>
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => { setBusy(true); await onUse(amount); setBusy(false); }}
        className={clearButtonVariants({ variant: "surface", size: "sm" })}
      >
        {busy ? t("saving") : t("suggested.use")}
      </button>
    </div>
  );
}

/** Forecast, average per week, biggest purchase and the busiest weekday. */
function Stats({ detail }: { detail: CategoryDetail }) {
  const t = useTranslations("categoryDetail.stats");
  const locale = useLocale();
  const budget = detail.budget && detail.budget > 0 ? detail.budget : null;
  const today = todayISO();
  const daysLeft = today > detail.to ? 0 : daysBetween(today < detail.from ? detail.from : today, detail.to);
  const daysElapsed = today < detail.from ? 1 : daysBetween(detail.from, today > detail.to ? detail.to : today);
  const weekday = detail.popularDay
    ? new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(2024, 0, 1 + detail.popularDay.weekday)) // 1 Jan 2024 was a Monday
    : null;

  const tiles: { label: string; value: React.ReactNode; foot?: React.ReactNode; tone?: "warn" }[] = [];
  if (detail.forecast != null) {
    const over = budget != null && detail.forecast > budget;
    tiles.push({
      label: t("forecast"),
      value: <Amount value={detail.forecast} sign="none" whole />,
      foot: budget != null
        ? (over ? t("forecastOver", { amount: formatEur(detail.forecast - budget) }) : t("perDayLeft", { amount: formatEur(Math.max(0, budget - detail.spent) / Math.max(1, daysLeft)) }))
        : t("pace", { amount: formatEur(detail.spent / Math.max(1, daysElapsed)) }),
      tone: over ? "warn" : undefined,
    });
  }
  if (detail.avgPerWeek != null) tiles.push({ label: t("perWeek"), value: <Amount value={detail.avgPerWeek} sign="none" whole /> });
  if (detail.biggestSpent != null) tiles.push({ label: t("biggest"), value: <Amount value={detail.biggestSpent} sign="none" whole /> });
  if (weekday) tiles.push({ label: t("busiestDay"), value: <span className="capitalize">{weekday}</span> });
  if (tiles.length === 0) return null;

  return (
    <div className={cn("grid gap-2.5", tiles.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : tiles.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {tiles.map((tile) => (
        <div key={tile.label} className={cn("flex min-w-0 flex-col gap-1 rounded-clear-tile px-3.5 py-3", tile.tone === "warn" ? "bg-clear-peach" : "bg-clear-tile")}>
          <span className="truncate text-[13px] font-bold text-clear-ink-2">{tile.label}</span>
          <span className="clear-amount truncate text-xl">{tile.value}</span>
          {tile.foot && <span className={cn("text-xs font-semibold", tile.tone === "warn" ? "text-clear-peach-ink" : "text-clear-muted")}><MoneyText>{tile.foot}</MoneyText></span>}
        </div>
      ))}
    </div>
  );
}

/** One bucket of the history chart's budget, from the stored per-period target. */
function bucketBudget(target: number, unit: BucketUnit, refDays: number) {
  if (unit === "day") return target / refDays;
  if (unit === "week") return (target * 7) / refDays;
  return refDays > 9 ? target : (target * 30.44) / refDays;
}

function ChartTile({ detail, unit, refDays, isIncome, name }: { detail: CategoryDetail; unit: BucketUnit; refDays: number; isIncome: boolean; name: string }) {
  const t = useTranslations("categoryDetail.chart");
  const [view, setView] = useState<"history" | "period">("history");
  const hasHistory = (detail.avgChart?.length ?? 0) > 0;
  const shownView = hasHistory ? view : "period";
  const budgetLine = !isIncome && detail.budgetTarget && detail.budgetTarget > 0
    ? shownView === "history" ? bucketBudget(detail.budgetTarget, unit, refDays) : detail.budget
    : null;

  return (
    <div className="flex flex-col gap-2 rounded-clear-tile bg-clear-tile p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {hasHistory ? (
          <Segmented
            label={t("viewLabel")}
            size="sm"
            value={shownView}
            onChange={setView}
            items={[
              { value: "history", label: t(`history.${unit}`) },
              { value: "period", label: t("thisPeriod") },
            ]}
          />
        ) : (
          <span className="text-[15px] font-bold">{t("thisPeriod")}</span>
        )}
        <span className="inline-flex gap-3.5 text-[13px] font-semibold text-clear-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("size-2.5 rounded-[3px]", isIncome ? "bg-clear-positive-fill" : "bg-clear-ember")} />
            {isIncome ? t("received") : t("spent")}
          </span>
          {budgetLine != null && (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="w-3.5 border-t-2 border-dashed border-clear-ink" />
              {t("budget")}
            </span>
          )}
        </span>
      </div>
      {shownView === "history" && detail.avgChart ? (
        <HistoryBars buckets={detail.avgChart} unit={unit} budget={budgetLine} isIncome={isIncome} name={name} />
      ) : (
        <PeriodLine detail={detail} budget={budgetLine} isIncome={isIncome} name={name} />
      )}
    </div>
  );
}

/** Six bars against the per-bucket budget; the bucket still running is hatched. */
function HistoryBars({ buckets, unit, budget, isIncome, name }: { buckets: { key: string; amount: number }[]; unit: BucketUnit; budget: number | null; isIncome: boolean; name: string }) {
  const t = useTranslations("categoryDetail.chart");
  const locale = useLocale();
  const hatchId = `cat-hatch-${useId().replace(/:/g, "")}`;
  const w = 512;
  const base = 108;
  const top = 22;
  const max = Math.max(1, budget ?? 0, ...buckets.map((b) => b.amount));
  const scale = (base - top) / max;
  const slot = w / buckets.length;
  const bw = Math.min(36, slot * 0.5);
  const fill = isIncome ? "var(--clr-positive-fill)" : "var(--clr-ember)";
  const today = todayISO();

  const label = (key: string) => {
    if (unit === "month") return new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(`${key}-15T12:00:00`));
    if (unit === "week") return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(`${key}T12:00:00`));
    return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(`${key}T12:00:00`));
  };
  const isCurrent = (key: string, i: number) =>
    i === buckets.length - 1 && (unit === "month" ? today.startsWith(key) : unit === "day" ? key === today : today >= key);

  const aria = t("historyAria", {
    name,
    list: buckets.map((b) => `${label(b.key)} ${formatEur(b.amount)}`).join(", "),
    budget: budget != null ? formatEur(budget) : "",
    hasBudget: budget != null ? "yes" : "no",
  });

  return (
    <svg viewBox={`0 0 ${w} 152`} role="img" aria-label={aria} className="block h-auto w-full">
      <defs>
        <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--clr-hatch-stripe)" />
          <rect width="3" height="6" fill={fill} />
        </pattern>
      </defs>
      <line x1={0} y1={base} x2={w} y2={base} stroke="var(--clr-line)" />
      {buckets.map((b, i) => {
        const x = i * slot + (slot - bw) / 2;
        const h = b.amount > 0 ? Math.max(4, b.amount * scale) : 0;
        const current = isCurrent(b.key, i);
        const over = budget != null && b.amount > budget;
        return (
          <g key={b.key}>
            {h > 0 && (
              <rect
                x={x}
                y={base - h}
                width={bw}
                height={h}
                rx={7}
                fill={current ? `url(#${hatchId})` : fill}
                stroke={current ? fill : undefined}
                strokeWidth={current ? 1.5 : undefined}
              />
            )}
            <text x={x + bw / 2} y={128} textAnchor="middle" fontSize={12} fontWeight={current ? 700 : 400} fill={current ? "var(--clr-ink)" : "var(--clr-muted)"}>
              {label(b.key)}
            </text>
            <text
              x={x + bw / 2}
              y={145}
              textAnchor="middle"
              fontSize={12}
              fontWeight={over || current ? 800 : 700}
              fill={over ? "var(--clr-negative)" : current ? "var(--clr-ink)" : "var(--clr-ink-2)"}
            >
              <SvgMoneyText>{formatEurWhole(b.amount)}</SvgMoneyText>
            </text>
          </g>
        );
      })}
      {budget != null && (
        <>
          <line x1={0} y1={base - budget * scale} x2={w} y2={base - budget * scale} stroke="var(--clr-ink)" strokeWidth={1.5} strokeDasharray="5 4" />
          <text x={w} y={Math.max(12, base - budget * scale - 6)} textAnchor="end" fontSize={12} fontWeight={700} fill="var(--clr-ink)">
            <SvgMoneyText>{t("budgetLine", { amount: formatEurWhole(budget) })}</SvgMoneyText>
          </text>
        </>
      )}
    </svg>
  );
}

/** The running total through the period (solid) continuing as a dashed projection,
 *  against the budget for the period. */
function PeriodLine({ detail, budget, isIncome, name }: { detail: CategoryDetail; budget: number | null; isIncome: boolean; name: string }) {
  const t = useTranslations("categoryDetail.chart");
  const locale = useLocale();
  const pts = detail.chart;
  const w = 512;
  const base = 116;
  const top = 18;
  const max = Math.max(1, budget ?? 0, ...pts.map((p) => Math.max(p.actual ?? 0, p.forecast ?? 0)));
  const x = (i: number) => (pts.length <= 1 ? w / 2 : (i / (pts.length - 1)) * w);
  const y = (v: number) => base - (v / max) * (base - top);
  const stroke = isIncome ? "var(--clr-positive-fill)" : "var(--clr-ember)";

  const actual = pts.map((p, i) => (p.actual != null ? [x(i), y(p.actual)] as const : null)).filter((p): p is readonly [number, number] => p != null);
  const forecast = pts.map((p, i) => (p.forecast != null ? [x(i), y(p.forecast)] as const : null)).filter((p): p is readonly [number, number] => p != null);
  const line = (ps: readonly (readonly [number, number])[]) => ps.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const area = actual.length > 1 ? `${line(actual)} L${actual[actual.length - 1][0].toFixed(1)},${base} L${actual[0][0].toFixed(1)},${base} Z` : null;

  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const first = pts[0]?.date;
  const last = pts[pts.length - 1]?.date;
  const projected = pts[pts.length - 1]?.forecast ?? null;
  const aria = t("periodAria", {
    name,
    spent: formatEur(detail.spent),
    projected: projected != null ? formatEur(projected) : "",
    hasProjection: projected != null ? "yes" : "no",
  });

  return (
    <svg viewBox={`0 0 ${w} 140`} role="img" aria-label={aria} className="block h-auto w-full overflow-visible">
      <line x1={0} y1={base} x2={w} y2={base} stroke="var(--clr-line)" />
      {area && <path d={area} fill={stroke} fillOpacity={0.14} />}
      {actual.length > 1 && <path d={line(actual)} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
      {forecast.length > 1 && <path d={line(forecast)} fill="none" stroke={stroke} strokeWidth={2} strokeDasharray="4 4" strokeLinecap="round" />}
      {budget != null && (
        <>
          <line x1={0} y1={y(budget)} x2={w} y2={y(budget)} stroke="var(--clr-ink)" strokeWidth={1.5} strokeDasharray="5 4" />
          <text x={w} y={Math.max(12, y(budget) - 6)} textAnchor="end" fontSize={12} fontWeight={700} fill="var(--clr-ink)">
            <SvgMoneyText>{t("budgetLine", { amount: formatEurWhole(budget) })}</SvgMoneyText>
          </text>
        </>
      )}
      {first && <text x={0} y={134} fontSize={12} fill="var(--clr-muted)">{fmt.format(new Date(`${first}T12:00:00`))}</text>}
      {last && last !== first && <text x={w} y={134} textAnchor="end" fontSize={12} fill="var(--clr-muted)">{fmt.format(new Date(`${last}T12:00:00`))}</text>}
    </svg>
  );
}

function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "").slice(0, 2)).toUpperCase();
}

/** Where the money went (grouped by the transactions' names) and the latest ones; the
 *  full list, grouped by day, expands underneath. */
function Breakdown({
  detail,
  category,
  isIncome,
  onOpenTransaction,
}: {
  detail: CategoryDetail;
  category: CategorySpendingCard;
  isIncome: boolean;
  onOpenTransaction: (id: number) => void;
}) {
  const t = useTranslations("categoryDetail");
  const locale = useLocale();
  const [showAll, setShowAll] = useState(false);
  const short = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const dateOf = (d: string) => short.format(new Date(`${d}T12:00:00`));

  const byName = new Map<string, { name: string; count: number; amount: number }>();
  const seen = new Set<string>();
  for (const tx of detail.transactions) {
    const key = tx.name.trim().toLowerCase();
    const g = byName.get(key) ?? { name: tx.name, count: 0, amount: 0 };
    g.amount += tx.amount;
    // A split transaction appears once per part; count it as one visit.
    const visit = `${key}|${tx.id}`;
    if (!seen.has(visit)) { seen.add(visit); g.count += 1; }
    byName.set(key, g);
  }
  const merchants = [...byName.values()].sort((a, b) => b.amount - a.amount).slice(0, 4);
  const visits = new Set(detail.transactions.map((tx) => tx.id)).size;
  const recent = detail.transactions.slice(0, 3);

  const groups: { date: string; total: number; rows: CategoryDetail["transactions"] }[] = [];
  for (const row of detail.transactions) {
    const last = groups[groups.length - 1];
    if (last && last.date === row.date) {
      last.rows.push(row);
      last.total += row.amount;
    } else {
      groups.push({ date: row.date, total: row.amount, rows: [row] });
    }
  }
  const money = (v: number) => <Amount value={isIncome ? Math.abs(v) : -Math.abs(v)} sign={isIncome ? "always" : "auto"} className="text-sm" />;

  const section = "flex min-w-0 flex-col gap-0.5 rounded-clear-tile bg-clear-tile px-3.5 pt-3.5 pb-2";
  const row = "flex min-h-[46px] w-full items-center gap-2.5 text-left";

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <section aria-labelledby="category-merchants" data-tip-anchor="categoryMerchants" className={section}>
          <div className="flex items-baseline justify-between gap-2 pb-1.5">
            <h3 id="category-merchants" className="m-0 text-[15px] font-bold">{isIncome ? t("sources") : t("merchants")}</h3>
            <span className="text-xs font-semibold text-clear-muted">{t("visits", { count: visits })}</span>
          </div>
          {merchants.map((m) => (
            <div key={m.name} className={row}>
              <span aria-hidden className="inline-flex size-[34px] shrink-0 items-center justify-center rounded-clear-icon bg-clear-card text-xs font-extrabold text-clear-ink-2">
                {initialsOf(m.name)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-bold">{m.name}</span>
                <span className="text-xs text-clear-muted">{t("visits", { count: m.count })}</span>
              </span>
              <Amount value={m.amount} sign="none" whole className="text-sm" />
            </div>
          ))}
        </section>

        <section aria-labelledby="category-recent" className={section}>
          <div className="flex items-baseline justify-between gap-2 pb-1.5">
            <h3 id="category-recent" className="m-0 text-[15px] font-bold">{t("recent")}</h3>
            <span className="text-xs font-semibold text-clear-muted">{t("recentCount", { count: recent.length })}</span>
          </div>
          {recent.map((tx, i) => (
            <button
              key={`${tx.id}-${i}`}
              type="button"
              onClick={() => onOpenTransaction(tx.id)}
              className={cn(row, "-mx-1.5 cursor-pointer rounded-clear-row px-1.5 transition-colors hover:bg-clear-card")}
            >
              <Icon iconKey={category.icon} color={category.color} size="sm" soft />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-bold">{tx.name}</span>
                <span className="truncate text-xs text-clear-muted">{[dateOf(tx.date), tx.account].filter(Boolean).join(" · ")}</span>
              </span>
              {money(tx.amount)}
            </button>
          ))}
          {detail.transactions.length > recent.length && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="mt-auto cursor-pointer self-start py-2 text-[13px] font-bold text-clear-ember-text hover:underline"
            >
              {showAll ? t("showLess") : t("showAll", { count: detail.transactions.length })}
            </button>
          )}
        </section>
      </div>

      {showAll && (
        <section aria-labelledby="category-all" className="flex flex-col gap-1">
          <h3 id="category-all" className="m-0 text-lg font-bold">{t("allTitle")}</h3>
          {groups.map((g) => (
            <div key={g.date} className="flex flex-col">
              <div className="flex items-center justify-between px-2 pt-3 pb-1 text-[13px] font-bold text-clear-muted">
                <span>{dateOf(g.date)}</span>
                <span className="tabular-nums"><MoneyText>{formatEur(g.total)}</MoneyText></span>
              </div>
              {/* Keyed by position, not id: these rows are split allocations, so one
                  transaction split across two sub-categories appears twice under a
                  rolled-up parent — both carrying the same transaction id. */}
              {g.rows.map((tx, i) => (
                <ListRow
                  key={`${tx.id}-${i}`}
                  icon={<Icon iconKey={category.icon} color={category.color} size="lg" soft />}
                  title={tx.name}
                  meta={tx.account ?? undefined}
                  trailing={money(tx.amount)}
                  onClick={() => onOpenTransaction(tx.id)}
                />
              ))}
            </div>
          ))}
        </section>
      )}
    </>
  );
}

/** Set or remove the category's budget for one budget period. */
function BudgetDialog({
  open,
  onOpenChange,
  name,
  current,
  weekly,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  current: number | null;
  weekly: boolean;
  onSave: (amount: number) => Promise<void>;
}) {
  const t = useTranslations("categoryDetail.budgetDialog");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideHeaderRow title={t("title", { name })} className="gap-4 pt-6">
        {/* Mounted per opening, so the field always starts from the saved budget. */}
        <BudgetForm name={name} current={current} weekly={weekly} onSave={onSave} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function BudgetForm({ name, current, weekly, onSave, onClose }: { name: string; current: number | null; weekly: boolean; onSave: (amount: number) => Promise<void>; onClose: () => void }) {
  const t = useTranslations("categoryDetail.budgetDialog");
  const [value, setValue] = useState(current && current > 0 ? String(Math.round(current * 100) / 100).replace(".", ",") : "");
  const [busy, setBusy] = useState(false);
  const parsed = value.trim() === "" ? 0 : parseFloat(value.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed >= 0;

  async function submit(amount: number) {
    if (busy) return;
    setBusy(true);
    await onSave(amount);
    setBusy(false);
    onClose();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (valid) submit(parsed); }}>
      <ClearDialogHeader title={t("title", { name })} subtitle={weekly ? t("perWeek") : t("perMonth")} onClose={onClose} closeLabel={t("close")} />
      <ClearField label={t("amount")} htmlFor="category-budget" hint={t("hint")}>
        <div className="flex h-12 items-center gap-1.5 rounded-clear-row border-[1.5px] border-transparent bg-clear-tile px-4 transition-colors focus-within:border-clear-ink">
          <span aria-hidden className="text-[15px] font-bold text-clear-muted">{currencySymbol()}</span>
          <input
            id="category-budget"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0"
            className="w-full min-w-0 flex-1 border-none bg-transparent p-0 font-clear text-[15px] font-extrabold tabular-nums text-clear-ink outline-none placeholder:font-semibold placeholder:text-clear-placeholder"
          />
        </div>
      </ClearField>
      <ClearDialogFooterDock className="pb-1">
        <ClearDialogFooter
          destructive={
            current && current > 0 ? (
              <button type="button" disabled={busy} onClick={() => submit(0)} className={clearButtonVariants({ variant: "danger" })}>
                {t("remove")}
              </button>
            ) : undefined
          }
        >
          <button type="button" onClick={onClose} className={clearButtonVariants({ variant: "secondary" })}>
            {t("cancel")}
          </button>
          <button type="submit" disabled={busy || !valid} className={clearButtonVariants()}>
            {busy ? t("saving") : t("save")}
          </button>
        </ClearDialogFooter>
      </ClearDialogFooterDock>
    </form>
  );
}

/** Edit category (or, for a group, Edit group) stacked on top, loading its data first. */
function EditCategoryDialog({ open, categoryId, onClose }: { open: boolean; categoryId: number; onClose: () => void }) {
  const t = useTranslations("categoryDetail");
  const [data, setData] = useState<{ category: Category; rules: CategoryRule[]; banks: Bank[]; categories: Category[] } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      fetch("/api/categories").then((r) => r.json() as Promise<Category[]>),
      fetch(`/api/category-rules?categoryId=${categoryId}`).then((r) => r.json() as Promise<CategoryRule[]>),
      fetch("/api/banks").then((r) => r.json() as Promise<Bank[]>),
    ])
      .then(([categories, rules, banks]) => {
        const category = categories.find((c) => c.id === categoryId);
        if (!cancelled && category) setData({ category, rules, banks, categories });
      })
      .catch(() => { /* stays on the loading line */ });
    return () => { cancelled = true; };
  }, [open, categoryId]);

  const loaded = data && data.category.id === categoryId ? data : null;
  if (loaded?.category.isGroup) {
    const count = loaded.categories.filter((c) => c.parentCategoryId === loaded.category.id).length;
    return <GroupDialog open={open} onClose={onClose} group={loaded.category} categoryCount={count} />;
  }
  return (
    <EditCategoryShell open={open} onClose={onClose}>
      {loaded ? (
        <EditCategoryForm category={loaded.category} rules={loaded.rules} banks={loaded.banks} categories={loaded.categories} onClose={onClose} />
      ) : (
        <p role="status" className="m-0 py-16 text-center text-[15px] text-clear-muted">{t("loading")}</p>
      )}
    </EditCategoryShell>
  );
}
