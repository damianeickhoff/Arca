"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { IconChevronLeft, IconDotsVertical, IconPencilFilled, IconSwitchHorizontal } from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Icon, parseImgKey } from "@/components/icon";
import { getDominantImageColor } from "@/lib/dominant-color";
import { ListItemRow } from "@/components/list-item-row";
import { CategorySpendChart } from "@/components/category-spend-chart";
import { brandColorForIconKey, detectBrandIcon } from "@/lib/brand-detect";
import { acquireNavHidden } from "@/lib/nav-visibility";
import { formatEur, formatDate } from "@/lib/format";
import type { MerchantDetail } from "@/lib/merchant-detail";

const springOut = "cubic-bezier(0.32, 0.72, 0, 1)";
const springIn = "cubic-bezier(0.16, 1, 0.3, 1)";
const NEUTRAL_BAR = "color-mix(in srgb, var(--foreground) 18%, transparent)";
/** Chart stroke for merchants with no logo to take a color from. Without it the chart
 * falls back to its own default (the red expense color), which reads as a warning. */
const NEUTRAL_LINE = "color-mix(in srgb, var(--foreground) 45%, transparent)";

/** Merchant icons are logos, so they always sit on a white chip — the same treatment
 * resolveTransactionIcon() gives logo-style icons everywhere else in the app. Lives
 * here because this portal is the canonical merchant surface. */
export const MERCHANT_ICON_BACKGROUND = "#ffffff";

/** The one place merchant icons are resolved, so a merchant looks identical in the
 * settings list, its profile, the editor and the transaction sheet: its own stored
 * icon, else a brand icon matching its name, else nothing — all-null renders <Icon>'s
 * neutral gray question-mark chip. Note the null color in that last case: a color
 * without an iconKey would make <Icon> draw a solid swatch instead.
 *
 * `color` is the logo's *own* primary color wherever the icon is a brand logo, taking
 * precedence over anything stored on the merchant — that's what drives the profile's
 * header wash and chart, so they track the logo rather than a stale saved value (an
 * icon picked in the editor doesn't write a color at all). */
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

/** Minimum a merchant reference needs to open this portal — the rest is fetched. */
export interface MerchantRef {
  id: number;
  name: string;
}

function cardClass() {
  return "rounded-2xl bg-[var(--dialog-content-background)] p-4 flex flex-col aspect-square shrink-0 w-40 snap-start";
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={cardClass()}>
      <p className="text-md font-medium text-foreground/60">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground tabular-nums truncate">{value}</p>
      {sub && <p className="mt-auto text-sm text-foreground/50 leading-snug">{sub}</p>}
    </div>
  );
}

/** Per-year spend bars. The label under each bar is the year; the tallest bar sets the
 * scale, and a year with no visits at all still gets a (minimum-height) bar so gaps in
 * the history read as gaps rather than being silently dropped. */
function YearlyTrend({ points, color }: { points: MerchantDetail["yearly"]; color: string | null }) {
  const max = Math.max(1, ...points.map((p) => p.amount));
  const barColor = color ?? "var(--foreground)";
  return (
    <div className="rounded-2xl bg-[var(--dialog-content-background)] p-4">
      <div className="flex items-end justify-between gap-2 h-32">
        {points.map((p) => (
          <div key={p.year} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full min-w-0">
            <span className="text-[10px] tabular-nums text-foreground/50 truncate">{formatEur(p.amount)}</span>
            <div
              className="w-full rounded-md"
              style={{
                height: `${Math.max(4, (p.amount / max) * 100)}%`,
                background: p.amount > 0 ? barColor : NEUTRAL_BAR,
                opacity: p.amount > 0 ? 0.85 : 1,
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between gap-2 mt-2">
        {points.map((p) => (
          <span key={p.year} className="flex-1 text-center text-xs text-foreground/50 tabular-nums">{p.year}</span>
        ))}
      </div>
    </div>
  );
}

/** Category mix as a single stacked bar plus a legend — "95% groceries, 5% household"
 * at a glance, with the exact amounts underneath. */
function CategoryMix({ slices }: { slices: MerchantDetail["categories"] }) {
  return (
    <div className="rounded-2xl bg-[var(--dialog-content-background)] p-4 space-y-3">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        {slices.map((s, i) => (
          <div
            key={s.categoryId ?? `none-${i}`}
            style={{ width: `${Math.max(1, s.pct)}%`, background: s.color ?? NEUTRAL_BAR }}
          />
        ))}
      </div>
      <div className="space-y-2">
        {slices.map((s, i) => (
          <div key={s.categoryId ?? `none-${i}`} className="flex items-center gap-2.5">
            <Icon iconKey={s.icon} color={s.color} size="sm" round />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{s.categoryName}</p>
              <p className="text-xs text-foreground/50 tabular-nums">
                {s.visits} {s.visits === 1 ? "visit" : "visits"} · {formatEur(s.amount)}
              </p>
            </div>
            <span className="text-sm font-semibold tabular-nums shrink-0">{Math.round(s.pct)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="px-1 pb-2 text-sm font-medium text-foreground/60">{children}</p>;
}

/** Full-screen merchant profile — the same presentation as CategoryDetailPortal
 * (backdrop + slide-in panel, bottom nav suppressed while open), scoped to one shop.
 * Stats are all-time rather than period-scoped: a merchant profile answers "how do I
 * shop here", which a budget period would only ever fragment. */
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
   * panel opens this profile *from* its editor) — nesting a second editor on top of
   * that one is both redundant and a focus-trap fight waiting to happen. */
  allowEdit?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [detail, setDetail] = useState<MerchantDetail | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Rename only. Icon, color and deletion live in the Merchants settings panel — this
  // profile is a read-only view of one shop, and the name is the one thing worth
  // correcting in the moment (a bad auto-derived name is what you notice here).
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  function openRename() {
    setRenameValue(detail?.name ?? merchant?.name ?? "");
    setRenameError(null);
    setRenameOpen(true);
  }

  async function saveRename() {
    if (!merchant || !renameValue.trim()) return;
    setRenaming(true);
    setRenameError(null);
    const res = await fetch("/api/merchants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: merchant.id, name: renameValue.trim() }),
    });
    setRenaming(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setRenameError(body.error ?? "Could not rename this merchant.");
      return;
    }
    setRenameOpen(false);
    setRefreshKey((k) => k + 1);
  }

  const open = merchant != null;

  useEffect(() => {
    if (!merchant) return;
    let cancelled = false;
    setDetail(null);
    fetch(`/api/merchants/${merchant.id}/detail`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setDetail(d); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchant?.id, refreshKey]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Same reason as CategoryDetailPortal: the mobile bottom nav sits at a higher
  // z-index and would otherwise float above this full-screen panel.
  useEffect(() => {
    if (!open) return;
    return acquireNavHidden();
  }, [open]);

  const resolvedIcon = useMemo(() => (detail ? merchantIcon(detail) : null), [detail]);

  // Uploaded-image icons carry no brand hex, so sample the image itself for the wash
  // and chart color — same treatment the transaction detail sheet gives img: icons.
  const [dominantColor, setDominantColor] = useState<string | null>(null);
  const imgIconKey = resolvedIcon?.iconKey?.startsWith("img:") ? resolvedIcon.iconKey : null;

  useEffect(() => {
    if (!imgIconKey) return;
    let cancelled = false;
    const { src } = parseImgKey(imgIconKey);
    getDominantImageColor(src).then((c) => { if (!cancelled) setDominantColor(c); });
    return () => { cancelled = true; };
  }, [imgIconKey]);

  const accent = resolvedIcon?.color ?? (imgIconKey ? dominantColor : null);

  function close() {
    onClose();
    setDetail(null);
    setRenameOpen(false);
  }

  const hasVisits = !!detail && detail.visitCount > 0;

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
                zIndex: 70,
                opacity: open ? 1 : 0,
                pointerEvents: "none",
                transition: open ? "opacity 480ms cubic-bezier(0.25, 0, 0.15, 1)" : "opacity 320ms ease",
              }}
            />

            {/* Content */}
            {/* data-dialog-keep-open: this portal can be opened *from* an open dialog
                (the transaction sheet), which stays open behind it. Without the marker
                every tap in here reads as an outside-interaction and dismisses it — see
                keepOpenOnOutside in components/ui/dialog.tsx. */}
            <div
              data-dialog-keep-open=""
              className="fixed inset-x-0 bottom-0 flex flex-col overflow-hidden"
              style={{
                top: 0,
                zIndex: 70,
                opacity: open ? 1 : 0,
                transform: open ? "translateY(0)" : "translateY(24px)",
                transition: open
                  ? `opacity 400ms ease 180ms, transform 500ms ${springIn} 160ms`
                  : `opacity 220ms ease, transform 260ms ${springOut}`,
                pointerEvents: open ? "auto" : "none",
              }}
            >
              {accent && (
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-90 pointer-events-none"
                  style={{ background: `linear-gradient(to bottom, ${accent}33, transparent)` }}
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
                <h1 className="text-lg text-foreground text-center truncate">{detail?.name ?? merchant?.name}</h1>
                <div className="flex items-center justify-end gap-2">
                  {/* modal={false}: this portal owns the body-scroll lock, same race as
                      the one documented in category-detail-portal.tsx. */}
                  {(allowEdit || onChangeMerchant) && (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger className="size-11 rounded-full bg-white dark:bg-white/7 flex items-center justify-center active:scale-95 transition-transform">
                      <IconDotsVertical className="size-5" />
                    </DropdownMenuTrigger>
                    {/* pointerEvents: a vaul sheet may be open behind this portal, and
                        vaul sets pointer-events:none on <body> while modal — anything
                        portalled to the body (this menu) has to opt back in. */}
                    <DropdownMenuContent align="end" data-dialog-keep-open="" style={{ pointerEvents: "auto" }}>
                      {allowEdit && (
                        <DropdownMenuItem onClick={openRename}>
                          <IconPencilFilled className="size-4 mr-2" /> Edit merchant name
                        </DropdownMenuItem>
                      )}
                      {onChangeMerchant && (
                        <DropdownMenuItem onClick={onChangeMerchant}>
                          <IconSwitchHorizontal className="size-4 mr-2" /> Change merchant
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  )}
                </div>
              </div>

              {/* Body */}
              <div className="relative flex-1 overflow-y-auto overflow-x-hidden" style={{ WebkitOverflowScrolling: "touch" }}>
                {detail && (
                  <div className="pb-[calc(2rem+var(--sab))]">
                    <div className="flex items-start justify-between px-4">
                      <div>
                        <p className="text-lg text-foreground/60">Total spent</p>
                        <p className="text-4xl font-semibold tabular-nums tracking-tight mt-1">{formatEur(detail.totalSpent)}</p>
                      </div>
                      <Icon
                        iconKey={resolvedIcon?.iconKey}
                        color={resolvedIcon?.color}
                        background={resolvedIcon?.background}
                        size="xxl"
                        round
                      />
                    </div>

                    {/* Cumulative spend over the merchant's whole history, in its own
                        brand color — same chart the category detail uses. */}
                    {detail.chart.length > 1 && (
                      <div className="mt-4 mx-4">
                        <CategorySpendChart
                          key={detail.merchantId}
                          data={detail.chart}
                          budget={null}
                          color={accent ?? NEUTRAL_LINE}
                          tickFormat="month"
                        />
                      </div>
                    )}

                    {hasVisits ? (
                      <>
                        {/* Headline stats. scroll-px-4 keeps snapped cards clear of the
                            edge, and the trailing spacer restores the right-hand gutter —
                            a scroll container's own padding-right collapses at the end of
                            the scroll, leaving the last card flush against the screen. */}
                        <div className="mt-5 flex gap-3 px-4 pb-1 overflow-x-auto snap-x snap-mandatory scroll-px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                          <StatCard
                            label="Avg. visit"
                            value={formatEur(detail.avgVisit ?? 0)}
                            sub={`over ${detail.visitCount} ${detail.visitCount === 1 ? "visit" : "visits"}`}
                          />
                          <StatCard
                            label="Largest purchase"
                            value={formatEur(detail.largestPurchase ?? 0)}
                          />
                          <StatCard
                            label="Visit count"
                            value={String(detail.visitCount)}
                            sub={detail.lastVisit ? `last on ${formatDate(detail.lastVisit)}` : undefined}
                          />
                          <StatCard
                            label="First visit"
                            value={detail.firstVisit ? formatDate(detail.firstVisit) : "—"}
                          />
                          <div aria-hidden className="shrink-0 w-0.5" />
                        </div>

                        {/* Trend over time — only meaningful once there's more than one year */}
                        {detail.yearly.length > 1 && (
                          <div className="mt-6 px-4">
                            <SectionTitle>Spending per year</SectionTitle>
                            <YearlyTrend points={detail.yearly} color={accent} />
                          </div>
                        )}

                        {detail.categories.length > 0 && (
                          <div className="mt-6 px-4">
                            <SectionTitle>Categories</SectionTitle>
                            <CategoryMix slices={detail.categories} />
                          </div>
                        )}

                        {detail.recent.length > 0 && (
                          <div className="mt-6 px-4">
                            <SectionTitle>Recent purchases</SectionTitle>
                            <div className="rounded-2xl bg-[var(--dialog-content-background)] overflow-hidden">
                              {detail.recent.map((t) => (
                                <ListItemRow
                                  key={t.id}
                                  icon={<Icon iconKey={t.categoryIcon} color={t.categoryColor} size="lg" round />}
                                  name={t.name}
                                  subtitle={formatDate(t.date)}
                                  right={<span className="font-semibold text-base tabular-nums">{formatEur(t.amount)}</span>}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="mt-8 px-6 text-center text-sm text-foreground/50">
                        No expenses recorded for this merchant yet.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Edit — a plain fixed overlay rather than <Dialog>, for the same reason
                CategoryDetailPortal stacks its own overlays by hand: a Dialog's content
                sits at z-50 and would render *behind* this portal. Deleting from here
                closes the whole portal, since its subject is gone. */}
            {/* Rename — a plain fixed overlay rather than <Dialog>, for the same reason
                CategoryDetailPortal stacks its own overlays by hand: a Dialog's content
                sits at z-50 and would render *behind* this portal. */}
            {renameOpen && (
              <div
                data-dialog-keep-open=""
                style={{ pointerEvents: "auto" }}
                className="fixed inset-0 z-[72] bg-foreground/20 backdrop-blur-lg flex items-end sm:items-center justify-center"
                onClick={() => setRenameOpen(false)}
              >
                <div
                  className="w-full sm:max-w-sm m-4 rounded-2xl bg-background p-5 space-y-3 text-sm"
                  style={{ marginBottom: "calc(1rem + var(--sab))" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="font-semibold text-base">Edit merchant name</p>
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    Renaming updates every transaction linked to this merchant.
                  </p>
                  {renameError && <p className="text-xs text-destructive">{renameError}</p>}
                  <Button onClick={saveRename} disabled={renaming || !renameValue.trim()} className="w-full">
                    {renaming ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            )}
          </>,
          document.body,
        )}
    </>
  );
}
