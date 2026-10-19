"use client";

import { useEffect, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconPencil, IconSwitchHorizontal } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogFooter, ClearDialogFooterDock, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField, ClearInput } from "@/components/clear/field";
import { Amount } from "@/components/clear/amount";
import { ListRow } from "@/components/clear/list-row";
import { Segmented } from "@/components/clear/segmented";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { Icon } from "@/components/icon";
import { TransactionDetailByIdDialog } from "@/components/transaction-detail-by-id-dialog";
import { ContextualTip } from "@/components/contextual-tip";
import { AnchoredTip } from "@/components/anchored-tip";
import { brandColorForIconKey, detectBrandIcon } from "@/lib/brand-detect";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MerchantDetail } from "@/lib/merchant-detail";
import { MoneyText } from "@/components/clear/money";

/** Merchant icons are logos, so they always sit on a white chip — the same treatment
 * resolveTransactionIcon() gives logo-style icons everywhere else in the app. Lives
 * here because this profile is the canonical merchant surface. */
export const MERCHANT_ICON_BACKGROUND = "#ffffff";

/** The one place merchant icons are resolved, so a merchant looks identical in the
 * settings list, its profile, the editor and the transaction sheet: its own stored
 * icon, else a brand icon matching its name, else nothing — all-null renders <Icon>'s
 * neutral question-mark chip. Note the null color in that last case: a color without
 * an iconKey would make <Icon> draw a solid swatch instead.
 *
 * `color` is the logo's *own* primary color wherever the icon is a brand logo, taking
 * precedence over anything stored on the merchant. */
export function merchantIcon(m: { icon?: string | null; color?: string | null; name: string }) {
  if (m.icon) {
    return {
      iconKey: m.icon,
      color: brandColorForIconKey(m.icon) ?? m.color ?? null,
      background: MERCHANT_ICON_BACKGROUND,
    };
  }
  const brand = detectBrandIcon(m.name);
  if (brand) return { iconKey: brand.iconKey, color: brand.color, background: MERCHANT_ICON_BACKGROUND };
  return { iconKey: null, color: null, background: null };
}

/** Minimum a merchant reference needs to open this profile — the rest is fetched. */
export interface MerchantRef {
  id: number;
  name: string;
}

// The profile opens from sheets that stay open behind it (the transaction sheet, the
// Merchants settings editor at z-52), so it layers above them; what it opens itself
// (rename, a purchase's transaction sheet) layers above it in turn.
const LAYER = { sheetClassName: "z-[75]", overlayClassName: "z-[75]" } as const;
const ABOVE = { sheetClassName: "z-[78]", overlayClassName: "z-[78]" } as const;

/**
 * One merchant in full (Popup-MerchantProfile): the headline figures, the visits month
 * by month (or year by year), the details, which categories its purchases landed in
 * and the latest purchases — each opens its transaction. All-time rather than period
 * scoped: a merchant profile answers "how do I shop here", which a budget period would
 * only fragment. A centred modal on desktop, a bottom sheet on phones.
 */
export function MerchantDetailPortal({
  merchant,
  onClose,
  allowEdit = true,
  onChangeMerchant,
}: {
  merchant: MerchantRef | null;
  onClose: () => void;
  /** Supplied when this profile was opened from a single transaction: offers to point
   * that transaction at a different merchant. Absent everywhere else, since there'd be
   * no transaction to reassign. */
  onChangeMerchant?: () => void;
  /** Off where the caller already owns merchant editing (the Merchants settings
   * panel opens this profile *from* its editor) — a second editor on top of that one
   * would be redundant. */
  allowEdit?: boolean;
}) {
  const t = useTranslations("merchantProfile");

  // Keep the last merchant through the close animation — the caller nulls it the
  // instant the sheet starts closing.
  const [lastMerchant, setLastMerchant] = useState<MerchantRef | null>(merchant);
  if (merchant && merchant !== lastMerchant) setLastMerchant(merchant);
  const shown = merchant ?? lastMerchant;
  const open = merchant != null;

  // Keyed by merchant id, so a different merchant never shows the previous one's figures.
  const [loaded, setLoaded] = useState<{ id: number; detail: MerchantDetail } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const detail = loaded && shown && loaded.id === shown.id ? loaded.detail : null;

  const [renameOpen, setRenameOpen] = useState(false);
  // Kept as an id (not the row) so the sheet re-reads the transaction rather than
  // trusting this profile's trimmed copy.
  const [openTransactionId, setOpenTransactionId] = useState<number | null>(null);

  const merchantId = merchant?.id ?? null;
  useEffect(() => {
    if (merchantId == null) return;
    let cancelled = false;
    fetch(`/api/merchants/${merchantId}/detail`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MerchantDetail | null) => { if (!cancelled && d) setLoaded({ id: merchantId, detail: d }); })
      .catch(() => { /* the profile stays on its loading state */ });
    return () => { cancelled = true; };
  }, [merchantId, refreshKey]);

  const name = detail?.name ?? shown?.name ?? "";

  return (
    <>
      <ContextualTip id="merchant" active={open} />
      <AnchoredTip id="merchantVisits" anchor="merchantVisits" active={open && !!detail && detail.visitCount > 0 && !renameOpen && openTransactionId == null} />

      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent hideHeaderRow title={name || t("title")} className="gap-4 pt-6" {...LAYER}>
          {shown && (
            <>
              <ProfileBody
                name={name}
                detail={detail}
                allowEdit={allowEdit}
                onChangeMerchant={onChangeMerchant}
                onRename={() => setRenameOpen(true)}
                onOpenTransaction={setOpenTransactionId}
                onClose={onClose}
              />

              <ClearDialogFooterDock className="pb-1">
                <ClearDialogFooter>
                  <button type="button" onClick={onClose} className={clearButtonVariants()}>
                    {t("done")}
                  </button>
                </ClearDialogFooter>
              </ClearDialogFooterDock>

              <RenameDialog
                open={renameOpen}
                merchantId={shown.id}
                currentName={name}
                onOpenChange={setRenameOpen}
                onRenamed={() => setRefreshKey((k) => k + 1)}
              />

              {/* Editing from here can move the transaction out of this merchant, so a
                  close refetches the profile. */}
              <TransactionDetailByIdDialog
                transactionId={openTransactionId}
                onClose={() => { setOpenTransactionId(null); setRefreshKey((k) => k + 1); }}
                {...ABOVE}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProfileBody({
  name,
  detail,
  allowEdit,
  onChangeMerchant,
  onRename,
  onOpenTransaction,
  onClose,
}: {
  name: string;
  detail: MerchantDetail | null;
  allowEdit: boolean;
  onChangeMerchant?: () => void;
  onRename: () => void;
  onOpenTransaction: (id: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("merchantProfile");
  const locale = useLocale();
  const icon = detail ? merchantIcon(detail) : null;

  const longDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const day = (date: string) => longDate.format(new Date(`${date}T12:00:00`));
  const monthYear = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" });

  const top = detail?.categories[0];
  const subtitle = detail && detail.visitCount > 0
    ? [
        top ? t("subtitleMostly", { category: top.categoryId == null ? t("uncategorized") : top.categoryName }) : null,
        detail.firstVisit ? t("subtitleSince", { date: monthYear.format(new Date(`${detail.firstVisit}T12:00:00`)) }) : null,
      ].filter(Boolean).join(" · ")
    : undefined;

  return (
    <>
      <ClearDialogHeader
        title={name}
        subtitle={subtitle}
        icon={<Icon iconKey={icon?.iconKey} color={icon?.color} background={icon?.background} initials={initialsOf(name)} size="xxl" soft />}
        onClose={onClose}
        closeLabel={t("close")}
      />

      {(allowEdit || onChangeMerchant) && (
        <div className="flex flex-wrap gap-2">
          {allowEdit && (
            <button type="button" onClick={onRename} className={clearButtonVariants({ variant: "secondary", size: "sm" })}>
              <IconPencil aria-hidden />
              {t("rename")}
            </button>
          )}
          {onChangeMerchant && (
            <button type="button" onClick={onChangeMerchant} className={clearButtonVariants({ variant: "secondary", size: "sm" })}>
              <IconSwitchHorizontal aria-hidden />
              {t("changeMerchant")}
            </button>
          )}
        </div>
      )}

      {!detail ? (
        <div aria-busy className="flex flex-col gap-3" role="status">
          <span className="sr-only">{t("loading")}</span>
          <div className="grid grid-cols-3 gap-2.5">
            {[0, 1, 2].map((i) => <div key={i} className="h-[84px] animate-pulse rounded-clear-tile bg-clear-tile" />)}
          </div>
          <div className="h-24 animate-pulse rounded-clear-tile bg-clear-tile" />
        </div>
      ) : detail.visitCount === 0 ? (
        <p className="m-0 rounded-clear-tile bg-clear-tile px-4 py-6 text-center text-[15px] text-clear-muted">{t("empty")}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            <Figure label={t("totalSpent")} tone="peach">
              <Amount value={detail.totalSpent} sign="none" whole className="text-[22px] sm:text-[26px]" />
            </Figure>
            <Figure label={t("visits")}>
              <span className="clear-amount text-[22px] sm:text-[26px]">{detail.visitCount}</span>
            </Figure>
            <Figure label={t("average")}>
              <Amount value={detail.avgVisit ?? 0} sign="none" whole className="text-[22px] sm:text-[26px]" />
            </Figure>
          </div>

          <VisitsChart detail={detail} name={name} />

          <dl className="m-0 flex flex-col overflow-hidden rounded-clear-tile border border-clear-line">
            <Fact label={t("largest")} value={formatEur(detail.largestPurchase ?? 0)} />
            {detail.firstVisit && <Fact label={t("firstVisit")} value={day(detail.firstVisit)} />}
            {detail.lastVisit && <Fact label={t("lastVisitLabel")} value={day(detail.lastVisit)} />}
          </dl>

          {detail.categories.length > 0 && <CategoryMix slices={detail.categories} />}

          {detail.recent.length > 0 && (
            <section aria-labelledby="merchant-tx" className="flex flex-col">
              <div className="flex flex-wrap items-baseline justify-between gap-3 pb-1">
                <h3 id="merchant-tx" className="m-0 text-lg font-bold">{t("transactions")}</h3>
                <span className="text-[13px] text-clear-muted">
                  <MoneyText>{t("summary", { count: detail.visitCount, amount: formatEur(detail.totalSpent) })}</MoneyText>
                </span>
              </div>
              {detail.recent.map((v) => (
                <ListRow
                  key={v.id}
                  icon={<Icon iconKey={v.categoryIcon} color={v.categoryColor} size="lg" soft />}
                  title={new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${v.date}T12:00:00`))}
                  meta={[v.categoryName ?? t("uncategorized"), v.account].filter(Boolean).join(" · ")}
                  trailing={<Amount value={-Math.abs(v.amount)} className="text-[15px]" />}
                  onClick={() => onOpenTransaction(v.id)}
                />
              ))}
            </section>
          )}
        </>
      )}
    </>
  );
}

/** "Albert Heijn" → "AH": the tile shown for a merchant without a logo. */
function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "").slice(0, 2)).toUpperCase() || null;
}

function Figure({ label, tone, children }: { label: string; tone?: "peach"; children: React.ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 rounded-clear-tile px-4 py-3.5", tone === "peach" ? "bg-clear-peach" : "bg-clear-tile")}>
      <span className="truncate text-[13px] font-bold text-clear-ink-2">{label}</span>
      <span className="truncate">{children}</span>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-clear-ground px-4 last:border-b-0">
      <dt className="text-[15px] font-semibold text-clear-ink-2">{label}</dt>
      <dd className="m-0 text-right text-[15px] font-bold tabular-nums"><MoneyText>{value}</MoneyText></dd>
    </div>
  );
}

interface Bar {
  key: string;
  label: string;
  value: number;
  future: boolean;
  current: boolean;
}

/** Monthly spend per calendar month, from the cumulative monthly series the API sends. */
function monthlyTotals(chart: MerchantDetail["chart"]) {
  const out = new Map<string, number>();
  let prev = 0;
  for (const p of chart) {
    const cum = p.actual ?? prev;
    out.set(p.date.slice(0, 7), Math.max(0, cum - prev));
    prev = cum;
  }
  return out;
}

/**
 * The visit strip: one bar per month of the year of the last visit (months still to
 * come hatched), or one per year when the history spans several — switchable.
 */
function VisitsChart({ detail, name }: { detail: MerchantDetail; name: string }) {
  const t = useTranslations("merchantProfile");
  const locale = useLocale();
  const multiYear = detail.yearly.length > 1;
  const [view, setView] = useState<"months" | "years">("months");
  const now = new Date();
  const year = Number((detail.lastVisit ?? now.toISOString()).slice(0, 4));
  const monthName = new Intl.DateTimeFormat(locale, { month: "narrow" });
  const monthLong = new Intl.DateTimeFormat(locale, { month: "short" });

  const totals = monthlyTotals(detail.chart);
  const bars: Bar[] = view === "years" && multiYear
    ? detail.yearly.slice(-12).map((y) => ({
        key: y.year,
        label: y.year,
        value: y.amount,
        future: false,
        current: Number(y.year) === now.getFullYear(),
      }))
    : Array.from({ length: 12 }, (_, i) => {
        const key = `${year}-${String(i + 1).padStart(2, "0")}`;
        const isThisYear = year === now.getFullYear();
        return {
          key,
          label: monthName.format(new Date(year, i, 15)),
          value: totals.get(key) ?? 0,
          future: isThisYear && i > now.getMonth(),
          current: isThisYear && i === now.getMonth(),
        };
      });

  const spoken = bars
    .filter((b) => b.value > 0)
    .map((b) => `${view === "years" && multiYear ? b.label : monthLong.format(new Date(`${b.key}-15T12:00:00`))} ${formatEur(b.value)}`)
    .join(", ");
  const aria = view === "years" && multiYear
    ? t("chartAriaYears", { name, list: spoken || t("noVisits") })
    : t("chartAria", { name, year, list: spoken || t("noVisits") });

  return (
    <div data-tip-anchor="merchantVisits" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[15px] font-bold">{view === "years" && multiYear ? t("byYear") : t("byMonth", { year })}</span>
        {multiYear ? (
          <Segmented
            label={t("viewLabel")}
            surface="tile"
            size="sm"
            value={view}
            onChange={setView}
            items={[
              { value: "months", label: t("months") },
              { value: "years", label: t("years") },
            ]}
          />
        ) : (
          detail.lastVisit && (
            <span className="text-[13px] text-clear-muted">
              {t("lastVisit", { date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(`${detail.lastVisit}T12:00:00`)) })}
            </span>
          )
        )}
      </div>
      <StripChart bars={bars} label={aria} />
    </div>
  );
}

/** Rounded columns on a light track; empty future slots hatched, the current one labelled in ink. */
function StripChart({ bars, label }: { bars: Bar[]; label: string }) {
  const hatchId = `merchant-hatch-${useId().replace(/:/g, "")}`;
  const w = 504;
  const track = 44;
  const slot = w / bars.length;
  const bw = Math.min(22, slot * 0.55);
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <svg viewBox={`0 0 ${w} 72`} role="img" aria-label={label} className="block h-auto w-full">
      <defs>
        <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--clr-card)" />
          <rect width="3" height="6" fill="var(--clr-line)" />
        </pattern>
      </defs>
      {bars.map((b, i) => {
        const x = i * slot + (slot - bw) / 2;
        const h = b.value > 0 ? Math.max(6, (b.value / max) * track) : 0;
        return (
          <g key={b.key}>
            <rect
              x={x}
              y={4}
              width={bw}
              height={track}
              rx={7}
              fill={b.future ? `url(#${hatchId})` : "var(--clr-ground)"}
              stroke={b.future ? "var(--clr-line)" : undefined}
            />
            {h > 0 && <rect x={x} y={4 + track - h} width={bw} height={h} rx={7} fill="var(--clr-ember)" />}
            <text
              x={x + bw / 2}
              y={66}
              textAnchor="middle"
              fontSize={12}
              fontWeight={b.current ? 800 : 400}
              fill={b.current ? "var(--clr-ink)" : "var(--clr-muted)"}
            >
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Category mix as one stacked bar plus a legend — "95% groceries, 5% household" at a
 * glance, with the exact amounts underneath. */
function CategoryMix({ slices }: { slices: MerchantDetail["categories"] }) {
  const t = useTranslations("merchantProfile");
  return (
    <section aria-labelledby="merchant-categories" className="flex flex-col gap-3">
      <h3 id="merchant-categories" className="m-0 text-lg font-bold">{t("categories")}</h3>
      <div aria-hidden className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-clear-ground">
        {slices.map((s, i) => (
          <span
            key={s.categoryId ?? `none-${i}`}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${Math.max(1, s.pct)}%`, background: s.color ?? "var(--clr-placeholder)" }}
          />
        ))}
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {slices.map((s, i) => (
          <li key={s.categoryId ?? `none-${i}`} className="flex items-center gap-3">
            <Icon iconKey={s.icon} color={s.color} size="sm" soft />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-bold">{s.categoryId == null ? t("uncategorized") : s.categoryName}</span>
              <span className="text-[13px] tabular-nums text-clear-muted">
                <MoneyText>{t("categoryMeta", { count: s.visits, amount: formatEur(s.amount) })}</MoneyText>
              </span>
            </span>
            <span className="clear-amount shrink-0 text-sm">{Math.round(s.pct)}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Rename only — icon, colour and deletion live in the Merchants settings panel. The
 *  name is the one thing worth correcting in the moment (a bad auto-derived name is
 *  what you notice here). */
function RenameDialog({
  open,
  merchantId,
  currentName,
  onOpenChange,
  onRenamed,
}: {
  open: boolean;
  merchantId: number;
  currentName: string;
  onOpenChange: (open: boolean) => void;
  onRenamed: () => void;
}) {
  const t = useTranslations("merchantProfile");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideHeaderRow title={t("renameTitle")} className="gap-4 pt-6" {...ABOVE}>
        {/* Mounted per opening, so the field always starts from the current name. */}
        <RenameForm merchantId={merchantId} currentName={currentName} onClose={() => onOpenChange(false)} onRenamed={onRenamed} />
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({
  merchantId,
  currentName,
  onClose,
  onRenamed,
}: {
  merchantId: number;
  currentName: string;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const t = useTranslations("merchantProfile");
  const [value, setValue] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!value.trim() || saving) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/merchants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: merchantId, name: value.trim() }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(typeof body.error === "string" ? body.error : t("renameError"));
      return;
    }
    onRenamed();
    onClose();
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => { e.preventDefault(); save(); }}
    >
      <ClearDialogHeader title={t("renameTitle")} onClose={onClose} closeLabel={t("close")} />
      <ClearField label={t("renameLabel")} htmlFor="merchant-rename" hint={t("renameHint")} error={error}>
        <ClearInput id="merchant-rename" value={value} onChange={(e) => setValue(e.target.value)} autoFocus aria-invalid={error ? true : undefined} className="font-bold" />
      </ClearField>
      <ClearDialogFooterDock className="pb-1">
        <ClearDialogFooter>
          <button type="button" onClick={onClose} className={clearButtonVariants({ variant: "secondary" })}>
            {t("cancel")}
          </button>
          <button type="submit" disabled={saving || !value.trim()} className={clearButtonVariants()}>
            {saving ? t("saving") : t("save")}
          </button>
        </ClearDialogFooter>
      </ClearDialogFooterDock>
    </form>
  );
}
