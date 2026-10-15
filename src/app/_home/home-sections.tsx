import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  IconAlertTriangle,
  IconChevronRight,
  IconFileUpload,
  IconPlus,
  IconScan,
  IconSun,
} from "@tabler/icons-react";
import { MarkPaidButton } from "@/app/mark-paid-button";
import { CategoryIcon } from "@/components/ui/category-icon";
import { SectionHead } from "@/components/ui/page-heading";
import { InkLineChart } from "@/components/ui/ink-line-chart";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WeekNudge } from "./home-data";

// The redesigned Home's sections. Server components: every figure arrives already
// computed by page.tsx from the existing dashboard calculations; these only lay it out.

const CARD = "rounded-card border border-line bg-surface shadow-card";

/** "€42" for whole amounts, "€42,18" otherwise — the compact form used in captions. */
function compactEur(n: number) {
  return formatEur(n).replace(/,00$/, "");
}

// ── Quick actions ─────────────────────────────────────────────────────────────

export async function QuickActions() {
  const t = await getTranslations("home.quick");
  const base =
    "flex h-[46px] items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 text-[13px] font-bold transition-transform active:scale-[0.97]";
  return (
    <div data-tip-anchor="homeQuickActions" className="grid grid-cols-[1.5fr_1fr_1fr] gap-2">
      <Link href="/import" className={cn(base, "bg-ink text-bg")}>
        <IconFileUpload size={18} stroke={1.8} />
        {t("importCsv")}
      </Link>
      <Link href="/transactions/add" className={cn(base, "border border-line bg-surface text-ink")}>
        <IconPlus size={18} stroke={1.8} />
        {t("add")}
      </Link>
      <Link href="/transactions/add?scan=1" className={cn(base, "border border-line bg-surface text-ink")}>
        <IconScan size={18} stroke={1.8} />
        {t("scan")}
      </Link>
    </div>
  );
}

// ── Nudge ─────────────────────────────────────────────────────────────────────

/**
 * One computed sentence on the accent-soft card. This week against a usual week when
 * there is enough history; otherwise what is still due this month; otherwise nothing.
 */
export async function NudgeCard({
  nudge,
  billsDue,
}: {
  nudge: WeekNudge | null;
  billsDue: { count: number; total: number };
}) {
  const t = await getTranslations("home.nudge");
  const b = (chunks: React.ReactNode) => <b className="font-bold text-ink">{chunks}</b>;

  let sentence: React.ReactNode = null;
  if (nudge && nudge.usualWeek > 0) {
    const diff = nudge.thisWeek - nudge.usualWeek;
    // Within 5% (or a couple of euros) of normal reads as "a usual week".
    if (Math.abs(diff) < Math.max(2, nudge.usualWeek * 0.05)) {
      sentence = t("same");
    } else if (diff < 0) {
      sentence = (
        <>
          {t.rich("less", { amount: compactEur(Math.round(-diff)), b })}
          {nudge.category && <> {t("lessCategory", { category: nudge.category })}</>}
        </>
      );
    } else {
      sentence = (
        <>
          {t.rich("more", { amount: compactEur(Math.round(diff)), b })}
          {nudge.category && <> {t("moreCategory", { category: nudge.category })}</>}
        </>
      );
    }
  } else if (billsDue.count > 0) {
    sentence = t.rich("bills", { count: billsDue.count, amount: compactEur(billsDue.total), b });
  }
  if (!sentence) return null;

  return (
    <div data-tip-anchor="homeNudge" className="flex items-center gap-2.5 rounded-banner bg-mustard-soft px-3.5 py-3">
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-mustard text-mustard-ink">
        <IconSun size={15} stroke={1.8} />
      </span>
      <p className="text-[13px] leading-[1.4] text-ink-2">{sentence}</p>
    </div>
  );
}

// ── Coming up ─────────────────────────────────────────────────────────────────

export interface ComingUpBill {
  id: number;
  name: string;
  amount: number | null;
  icon: string | null;
  iconColor: string | null;
  dueDate: string;
  overdue: boolean;
  isIncome: boolean;
}

/**
 * The next bills still to pay this financial month, with the existing mark-paid toggle.
 * `phoneLimit` rows show on phones; from lg every row up to `limit` shows.
 */
export async function ComingUp({
  bills,
  month,
  totalDue,
  today,
  phoneLimit = 3,
  limit = 8,
}: {
  bills: ComingUpBill[];
  month: string;
  totalDue: number;
  today: string;
  phoneLimit?: number;
  limit?: number;
}) {
  const t = await getTranslations("home.comingUp");
  const locale = await getLocale();
  const tomorrow = (() => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const when = (b: ComingUpBill) => {
    if (b.overdue) return t("overdue");
    if (b.dueDate === today) return t("today");
    if (b.dueDate === tomorrow) return t("tomorrow");
    return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).format(
      new Date(`${b.dueDate}T12:00:00`),
    );
  };

  return (
    <section data-tip-anchor="homeComingUp" className="flex flex-col gap-2.5">
      <SectionHead title={t("title")} link={totalDue > 0 ? t("due", { amount: compactEur(totalDue) }) : t("all")} href="/transactions/upcoming" />
      <div className={cn(CARD, "px-4 py-1 lg:px-[18px] lg:py-1.5")}>
        {bills.length === 0 ? (
          <p className="py-4 text-[13px] text-ink-3">{t("empty")}</p>
        ) : (
          bills.slice(0, limit).map((b, i) => (
            <div
              key={b.id}
              className={cn("min-h-[54px] items-center gap-3", i >= phoneLimit ? "hidden lg:flex" : "flex")}
            >
              <CategoryIcon icon={b.icon} color={b.iconColor} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold text-ink">{b.name}</span>
                <span className={cn("text-xs", b.overdue ? "text-negative" : "text-ink-3")}>{when(b)}</span>
              </span>
              <span className={cn("shrink-0 text-sm font-semibold tabular-nums", b.isIncome ? "text-positive" : "text-ink")}>
                {b.isIncome ? "+" : ""}
                {formatEur(b.amount ?? 0)}
              </span>
              <MarkPaidButton recurringItemId={b.id} month={month} paid={false} />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

// ── Spending ──────────────────────────────────────────────────────────────────

export interface SpendingRow {
  categoryId: number;
  categoryName: string;
  color: string | null;
  icon: string | null;
  spent: number;
  budget: number | null;
}

function pctOf(row: SpendingRow) {
  return row.budget != null && row.budget > 0 ? (row.spent / row.budget) * 100 : null;
}

/** Category rows with a thin bar against each category's budget (phones; desktop shows tiles). */
export async function SpendingList({ rows, limit = 4, className }: { rows: SpendingRow[]; limit?: number; className?: string }) {
  const t = await getTranslations("home.spending");
  return (
    <section data-tip-anchor="homeSpending" className={cn("flex flex-col gap-2.5", className)}>
      <SectionHead title={t("title")} link={t("all")} href="/budget" />
      <div className={cn(CARD, "px-4 py-1")}>
        {rows.length === 0 ? (
          <p className="py-4 text-[13px] text-ink-3">{t("empty")}</p>
        ) : (
          rows.slice(0, limit).map((row) => {
            const pct = pctOf(row);
            const warn = pct != null && pct >= 98;
            return (
              <div key={row.categoryId} className="flex min-h-[54px] items-center gap-3">
                <CategoryIcon icon={row.icon} color={row.color} />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-ink">{row.categoryName}</span>
                    <span className={cn("shrink-0 text-xs", warn ? "text-warning" : "text-ink-3")}>
                      <span className="text-[13px] font-semibold tabular-nums text-ink">{compactEur(row.spent)}</span>
                      {row.budget != null && row.budget > 0 && <> {t("of", { budget: compactEur(row.budget) })}</>}
                      {warn && <> · {pct! > 100 ? t("over") : t("nearly")}</>}
                    </span>
                  </span>
                  {pct != null && (
                    <span className="block h-[5px] overflow-hidden rounded-full bg-surface-2">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${Math.min(100, pct)}%`, background: warn ? "var(--arca-warning)" : row.color ?? "var(--arca-accent)" }}
                      />
                    </span>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function Ring({ pct, color, size = 32, stroke = 4 }: { pct: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--arca-surface-2)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${((c * Math.min(pct, 100)) / 100).toFixed(1)} ${c.toFixed(1)}`}
      />
    </svg>
  );
}

/** Desktop: the top four categories as tiles with a progress ring. */
export async function CategoryTiles({ rows, total, className }: { rows: SpendingRow[]; total: number; className?: string }) {
  const t = await getTranslations("home.spending");
  if (rows.length === 0) return null;
  return (
    <section data-tip-anchor="homeSpending" className={cn("flex-col gap-3", className)}>
      <SectionHead title={t("tilesTitle")} link={t("tilesAll", { count: total })} href="/budget" />
      <div className="grid grid-cols-4 gap-3.5">
        {rows.slice(0, 4).map((row) => {
          const pct = pctOf(row);
          const warn = pct != null && pct >= 98;
          const color = warn ? "var(--arca-warning)" : row.color ?? "var(--arca-accent)";
          return (
            <div key={row.categoryId} className={cn(CARD, "flex min-w-0 flex-col gap-3.5 p-4")}>
              <div className="flex items-center justify-between">
                <CategoryIcon icon={row.icon} color={row.color} />
                {pct != null && <Ring pct={pct} color={color} />}
              </div>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="amount truncate text-[22px] text-ink">{compactEur(row.spent)}</span>
                <span className="truncate text-xs text-ink-3">
                  {row.categoryName}
                  {pct != null &&
                    (warn ? (
                      <> · <span className="font-semibold text-warning">{Math.round(pct)}%</span></>
                    ) : (
                      <> · {t("left", { amount: compactEur(Math.max(0, (row.budget ?? 0) - row.spent)) })}</>
                    ))}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Cash flow ─────────────────────────────────────────────────────────────────

export async function CashFlowCard({ net, history, className }: { net: number; history: number[]; className?: string }) {
  const t = await getTranslations("home.cashFlow");
  return (
    <section className={cn(CARD, "flex-col gap-3.5 px-[22px] py-5", className)}>
      <SectionHead title={t("title")} link={t("link")} href="/reports" size="sm" />
      <div className="flex items-end gap-6">
        <div className="flex shrink-0 flex-col gap-1">
          <span className="mono-label">{t("net")}</span>
          <span className={cn("amount text-[28px]", net >= 0 ? "text-positive" : "text-negative")}>
            {net > 0 ? "+" : ""}
            {compactEur(net)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <InkLineChart values={history} gradientId="home-cashflow-fill" />
        </div>
      </div>
    </section>
  );
}

// ── Needs review ──────────────────────────────────────────────────────────────

export async function NeedsReviewLink({ count }: { count: number }) {
  if (count === 0) return null;
  const t = await getTranslations("home");
  return (
    <Link
      href="/transactions/needs-review"
      className="flex items-center gap-3 rounded-banner bg-warning-soft px-4 py-3.5 text-[13px] font-bold text-warning"
    >
      <IconAlertTriangle size={18} stroke={1.8} />
      {t("needsReview", { count })}
      <IconChevronRight size={16} stroke={1.8} className="ml-auto" />
    </Link>
  );
}
