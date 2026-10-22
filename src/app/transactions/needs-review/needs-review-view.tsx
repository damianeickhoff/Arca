"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconArrowRight, IconCalendar, IconCategory, IconCheck, IconFilter2, IconInfoCircle, IconListDetails, IconSparkles, IconTransfer } from "@tabler/icons-react";
import type { Category, Goal } from "@/db/schema";
import { Icon } from "@/components/icon";
import { Amount } from "@/components/clear/amount";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { ClearChip } from "@/components/clear/chip";
import { ClearProgress } from "@/components/clear/progress";
import { ClearSwitch } from "@/components/clear/switch";
import { IconTile } from "@/components/clear/icon-tile";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { MoneyText } from "@/components/clear/money";
import { CategoryPickerSheet } from "@/components/category-picker";
import { useSaveRule } from "@/components/rule-actions";
import { ContextualTip } from "@/components/contextual-tip";
import { AnchoredTip } from "@/components/anchored-tip";
import { TeachRuleStrip, type TeachMoment } from "@/components/teach-rule-strip";
import { refreshLayoutAction } from "@/app/actions/refresh-layout";
import { suggestCategoriesAction } from "@/app/actions/ai";
import { AI_CATEGORY_BATCH } from "@/lib/ai-shared";
import type { CategorySuggestions } from "@/lib/category-suggestions";
import { resolveDisplayName } from "@/lib/friendly-names";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TransactionPanelSheet } from "@/app/transactions/_activity/transaction-panel-sheet";
import { TransactionBulkBar } from "@/app/transactions/transaction-bulk-bar";
import type { TransactionDetail } from "@/app/transactions/transaction-types";
import { SubpageHeading } from "../subpage-heading";

// Rendering every queue row is what gets slow with a big backlog, not the (single,
// indexed) query — so the queue shows rows in batches instead of paging the data,
// which the sidebar's "N need a category" badge also relies on for an exact count.
const PAGE_SIZE = 60;
/** A merchant with at least this many transactions waiting gets a "Worth teaching" row. */
const TEACH_MIN = 5;
const TEACH_ROWS = 3;

/** Money out negative, money in positive; a reimbursement counts at its full amount. */
function signedValue(row: TransactionDetail) {
  const value = Math.abs(row.isReimbursement ? row.amount : row.correctedAmount ?? row.amount);
  return row.direction === "expense" && !row.isReimbursement ? -value : value;
}

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${url} failed`);
  return res;
}

/** Whether a key press belongs to something else on the page (a field, a menu, a dialog). */
function keyIsTaken(e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  const el = e.target as HTMLElement | null;
  if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return true;
  return !!document.querySelector('[data-vaul-drawer][data-state="open"], [role="menu"], [role="dialog"]');
}

/**
 * Activity › Needs a category. The transactions without a category, one at a time: the
 * current one with its suggested categories, an optional rule for similar ones and
 * Save and next (Enter) / Skip (S); every category is one tap further, in the shared
 * category picker. Beside it the queue — tap a row to jump to it, or Select several for
 * the bulk actions — and why this matters. Phones stack the cards.
 */
export function NeedsReviewView({
  rows,
  categories,
  savingsGoals,
  aiReady,
}: {
  rows: TransactionDetail[];
  categories: Category[];
  savingsGoals: Goal[];
  /** AI is switched on and its provider set up (Settings › AI): show "Ask AI". */
  aiReady: boolean;
}) {
  const t = useTranslations("needsReview");
  const tPicker = useTranslations("categoryPicker");
  const locale = useLocale();
  const router = useRouter();
  const ruleLabelId = useId();

  // Rows sorted here leave the queue at once; the server refresh catches up after.
  const [sorted, setSorted] = useState<Set<number>>(new Set());
  const queue = rows.filter((r) => !sorted.has(r.id));
  const [currentId, setCurrentId] = useState<number | null>(null);
  const current = queue.find((r) => r.id === currentId) ?? queue[0] ?? null;
  const index = current ? queue.indexOf(current) : -1;
  // Progress counts what was sorted on this visit: a sorted row leaves the queue and the
  // next one moves to the front, so its place in the queue alone would read "1 of …"
  // forever while the total shrank. Done + place in the queue = how far along you are.
  const [done, setDone] = useState(0);
  const position = done + index + 1;
  const total = done + queue.length;

  const [info, setInfo] = useState<{ id: number; data: CategorySuggestions } | null>(null);
  const [picked, setPicked] = useState<{ id: number; categoryId: number } | null>(null);
  const [ruleOn, setRuleOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // The row just filed without a rule: offer to file its merchant that way always.
  const [teach, setTeach] = useState<TeachMoment | null>(null);
  // The newest transaction of a "Worth teaching" merchant whose category is picked;
  // kept after closing for the exit animation.
  const [teachRow, setTeachRow] = useState<TransactionDetail | null>(null);
  const [teachPickerOpen, setTeachPickerOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Set<number> | null>(null);
  const selectMode = selected !== null;
  // The AI's picks, by transaction id. One "Ask AI" covers the current row and the next
  // ones in the queue, so moving on shows their picks without another request.
  const [aiPicks, setAiPicks] = useState<Record<number, number>>({});
  const [aiAsked, setAiAsked] = useState<Set<number>>(new Set());
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const currentKey = current?.id ?? null;
  useEffect(() => {
    if (currentKey == null) return;
    let cancelled = false;
    send("/api/category-suggestions", "POST", { ids: [currentKey] })
      .then((r) => r.json())
      .then((data: CategorySuggestions) => {
        if (!cancelled) setInfo({ id: currentKey, data });
      })
      .catch(() => {
        // No suggestions and no rule — the full category list still works.
      });
    return () => {
      cancelled = true;
    };
  }, [currentKey]);

  const data = current && info?.id === current.id ? info.data : null;
  const aiPick = current ? categories.find((c) => c.id === aiPicks[current.id]) ?? null : null;
  const localSuggested = (data?.suggested ?? []).map((id) => categories.find((c) => c.id === id)).filter((c): c is Category => !!c);
  // The AI's pick joins the suggestions (marked) unless your rules and history already offer it.
  const suggested = aiPick && !localSuggested.some((c) => c.id === aiPick.id) ? [...localSuggested, aiPick] : localSuggested;
  // The top suggestion is staged until another one is picked.
  const stagedId = current ? (picked?.id === current.id ? picked.categoryId : suggested[0]?.id ?? null) : null;

  async function askAi() {
    if (!current || aiBusy) return;
    const ids = [current, ...queue.slice(index + 1), ...queue.slice(0, Math.max(0, index))]
      .map((r) => r.id)
      .filter((id) => !aiAsked.has(id))
      .slice(0, AI_CATEGORY_BATCH);
    if (ids.length === 0) return;
    setAiBusy(true);
    setAiError(null);
    const result = await suggestCategoriesAction(ids).catch(() => ({ error: "unavailable" as const }));
    setAiBusy(false);
    if ("error" in result) {
      setAiError(t.has(`ai.errors.${result.error}`) ? t(`ai.errors.${result.error}`) : t("ai.errors.unavailable"));
      return;
    }
    setAiAsked((prev) => new Set([...prev, ...ids]));
    setAiPicks((prev) => ({ ...prev, ...result.suggestions }));
  }
  const ruleAvailable = (data?.patterns.length ?? 0) > 0;
  const withRule = ruleAvailable && ruleOn && stagedId != null;
  const similarCount = data?.similarIds.length ?? 0;
  const patternNames = new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(data?.patterns ?? []);

  /** Takes `ids` out of the queue and moves on to the next row still in it. */
  function markSorted(ids: number[]) {
    const gone = new Set(ids);
    const after = queue.slice(index + 1).find((r) => !gone.has(r.id)) ?? queue.find((r) => !gone.has(r.id));
    // Only rows that were waiting count: a rule can also re-categorise ones already sorted.
    setDone((d) => d + queue.filter((r) => gone.has(r.id)).length);
    setSorted((prev) => new Set([...prev, ...ids]));
    setCurrentId(after?.id ?? null);
    setFailed(false);
  }

  async function refresh() {
    await refreshLayoutAction();
    router.refresh();
  }

  function skip() {
    if (queue.length < 2 || index < 0) return;
    setCurrentId(queue[(index + 1) % queue.length].id);
    setFailed(false);
  }

  const sendRule = useSaveRule();

  async function save() {
    if (!current || stagedId == null || busy) return;
    const ids = withRule && data ? [...new Set([current.id, ...data.similarIds])] : [current.id];
    setBusy(true);
    setFailed(false);
    try {
      await send("/api/transactions", "PATCH", { ids, categoryId: stagedId });
      if (withRule && data) {
        // The same rule the category picker's switch creates. One that already files
        // elsewhere asks before it moves; a Cancel leaves that rule out.
        let savedAny = false;
        for (const pattern of data.patterns) {
          const saved = await sendRule("POST", {
            categoryId: stagedId,
            namePattern: pattern,
            nameWildcard: true,
            nameWholeWord: false,
            direction: data.direction,
            bankId: null,
            amount: null,
            amountMin: null,
            amountMax: null,
          });
          if (saved === "failed") throw new Error("rule failed");
          if (saved !== "cancelled") savedAny = true;
        }
        if (savedAny) await send("/api/apply-rules", "POST", {});
      }
      setTeach(withRule || current.recurringItemId != null ? null : { transactionId: current.id, categoryId: stagedId });
      markSorted(ids);
      await refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function markTransfer() {
    if (!current || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await send("/api/transactions", "PATCH", { id: current.id, isManualTransfer: true });
      markSorted([current.id]);
      await refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  // Enter saves, S skips — outside fields, menus and open dialogs. Enter on another
  // button keeps doing what that button does.
  const canSave = stagedId != null && !busy;
  const keysOn = current != null && !selectMode;
  useEffect(() => {
    if (!keysOn) return;
    function onKey(e: KeyboardEvent) {
      if (keyIsTaken(e)) return;
      const el = e.target as HTMLElement | null;
      if (e.key === "Enter") {
        if (el && (el.tagName === "A" || (el.tagName === "BUTTON" && !el.dataset.suggestion))) return;
        if (!canSave) return;
        e.preventDefault();
        void save();
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        skip();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Busy merchants in the queue: no rule files them yet (else they would not be
  // waiting), so filing one and choosing Always in the teach strip sorts the rest.
  const byMerchant = new Map<number, TransactionDetail[]>();
  for (const r of queue) if (r.merchantId != null) byMerchant.set(r.merchantId, [...(byMerchant.get(r.merchantId) ?? []), r]);
  const worthTeaching = [...byMerchant.values()]
    .filter((rs) => rs.length >= TEACH_MIN)
    .sort((a, b) => b.length - a.length)
    .slice(0, TEACH_ROWS);

  const visible = queue.slice(0, visibleCount);
  const hasMore = queue.length > visible.length;
  const out = queue.filter((r) => signedValue(r) < 0).reduce((s, r) => s - signedValue(r), 0);
  const inn = queue.filter((r) => signedValue(r) > 0).reduce((s, r) => s + signedValue(r), 0);
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" });
  const longFmt = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" });
  const date = (d: string) => new Date(`${d}T12:00:00`);

  function toggleSelected(id: number) {
    setSelected((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-5 px-4 pt-[calc(var(--sat)+16px)] font-clear text-clear-ink lg:gap-7 lg:px-8 lg:pt-7 lg:pb-12">
      <SubpageHeading
        parentHref="/transactions"
        parentLabel={t("parent")}
        breadcrumbLabel={t("breadcrumb")}
        title={t("title")}
        subtitle={queue.length > 0 ? t("subtitle", { count: queue.length }) : t("subtitleDone")}
        actions={
          current && (
            <div
              role="group"
              aria-label={t("progressLabel", { index: position, total })}
              className="inline-flex h-[52px] items-center gap-3.5 rounded-full bg-clear-card pr-5 pl-2"
            >
              <span className="inline-flex h-9 items-center rounded-full bg-clear-primary px-3.5 text-sm font-extrabold tabular-nums text-clear-primary-ink">
                {t("progress", { index: position, total })}
              </span>
              <ClearProgress value={position / total} size="sm" className="w-24 sm:w-40" />
            </div>
          )
        }
      />

      {teach && <TeachRuleStrip teach={teach} categories={categories} onClose={() => setTeach(null)} onRuleCreated={() => void refresh()} />}

      {!teach && !selectMode && worthTeaching.length > 0 && (
        <section data-tip-anchor="reviewTeach" aria-labelledby="review-teach-title" className="flex flex-col gap-3.5 rounded-clear-card bg-clear-card p-5 lg:px-6">
          <div className="flex flex-col gap-1">
            <h2 id="review-teach-title" className="m-0 text-base font-bold">{t("teach.title")}</h2>
            <p className="m-0 text-[13px] text-clear-muted">{t("teach.body", { min: TEACH_MIN })}</p>
          </div>
          <ul className="m-0 grid list-none gap-2.5 p-0 sm:grid-cols-2 xl:grid-cols-3">
            {worthTeaching.map((rs) => {
              const first = rs[0];
              const name = first.merchantName ?? resolveDisplayName(first);
              return (
                <li key={first.merchantId} className="flex min-w-0 items-center gap-3 rounded-clear-tile bg-clear-tile py-2.5 pr-2.5 pl-3">
                  <Icon iconKey={first.merchantIcon ?? null} color={first.merchantColor ?? null} soft size="md" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-bold">{name}</span>
                    <span className="truncate text-[13px] text-clear-muted">{t("teach.waiting", { count: rs.length })}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setTeachRow(first);
                      setTeachPickerOpen(true);
                    }}
                    aria-haspopup="dialog"
                    aria-label={t("teach.fileLabel", { name })}
                    className={clearButtonVariants({ size: "sm" })}
                  >
                    {t("teach.file")}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {!current ? (
          <EmptyCard />
        ) : (
          <ClearCard aria-labelledby="review-current-title" className="gap-6 p-5 lg:col-span-2 lg:p-7">
            {/* The transaction */}
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-2.5">
                <h2 id="review-current-title" className="m-0 text-[13px] font-bold text-clear-ink-2">
                  {t("statement")}
                </h2>
                <span className="max-w-full self-start break-all rounded-clear-row bg-clear-tile px-4 py-3 text-sm font-bold tracking-[0.04em]">
                  {current.description}
                </span>
                {resolveDisplayName(current) !== current.description && (
                  <span className="text-[15px] font-bold">{resolveDisplayName(current)}</span>
                )}
                <span className="inline-flex items-center gap-2 text-sm text-clear-ink-2">
                  <IconCalendar size={16} stroke={2} aria-hidden />
                  <span className="first-letter:uppercase">{[longFmt.format(date(current.date)), current.bankName].filter(Boolean).join(" · ")}</span>
                </span>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <Amount value={signedValue(current)} sign="always" className={cn("text-[40px] leading-none lg:text-[48px]", signedValue(current) > 0 && "text-clear-positive")} />
                <ClearChip tone="peach" className="text-clear-ember-text" icon={<span aria-hidden className="size-2 rounded-full bg-clear-ember" />}>
                  {t("chip")}
                </ClearChip>
              </div>
            </div>

            {/* Suggested categories */}
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h3 id={`${ruleLabelId}-sugg`} className="m-0 text-base font-bold">
                  {t("suggested")}
                </h3>
                <span className="text-[13px] text-clear-muted">{suggested.length > 0 ? t("suggestedHelp") : t("noSuggestions")}</span>
              </div>
              <div role="group" aria-labelledby={`${ruleLabelId}-sugg`} className="flex flex-wrap gap-2.5">
                {suggested.map((c) => {
                  const on = stagedId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      data-suggestion="true"
                      aria-pressed={on}
                      onClick={() => setPicked({ id: current.id, categoryId: c.id })}
                      className={cn(
                        "inline-flex h-12 cursor-pointer items-center gap-2.5 rounded-full border-2 bg-clear-tile pr-[18px] pl-1.5 text-[15px] font-bold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-clear-ember/50",
                        on ? "border-clear-ink" : "border-transparent hover:bg-clear-line",
                      )}
                    >
                      <span aria-hidden className="inline-flex shrink-0 [&>*]:size-[34px]!">
                        <Icon iconKey={c.icon} color={c.color} soft round size="sm" glyphSize={16} />
                      </span>
                      {c.name}
                      {aiPick?.id === c.id && (
                        <span title={t("ai.picked")} className="inline-flex text-clear-ember-text">
                          <IconSparkles size={16} stroke={2.2} aria-hidden />
                          <span className="sr-only">{t("ai.picked")}</span>
                        </span>
                      )}
                      {on && <IconCheck size={16} stroke={3} aria-hidden />}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  aria-haspopup="dialog"
                  className={cn(clearButtonVariants({ variant: "secondary" }), "h-12 px-[18px]")}
                >
                  <IconCategory aria-hidden />
                  {t("allCategories")}
                </button>
                {aiReady && (
                  <button
                    type="button"
                    data-tip-anchor="aiCategories"
                    onClick={askAi}
                    disabled={aiBusy || aiAsked.has(current.id)}
                    className={cn(clearButtonVariants({ variant: "secondary" }), "h-12 px-[18px]")}
                  >
                    <IconSparkles aria-hidden />
                    {aiBusy ? t("ai.asking") : aiAsked.has(current.id) && !aiPick ? t("ai.noPick") : t("ai.ask")}
                  </button>
                )}
              </div>
              {aiError && (
                <p role="alert" className="m-0 text-[13px] font-semibold text-clear-negative">{aiError}</p>
              )}
            </div>

            {/* The rule */}
            {ruleAvailable && (
              <label className="flex cursor-pointer items-center gap-3.5 rounded-clear-tile bg-clear-tile px-4 py-3.5 lg:px-[18px]">
                <IconTile tone="sky" size="sm" className="size-8 rounded-full [&_svg]:size-4">
                  <IconFilter2 stroke={2.1} />
                </IconTile>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span id={ruleLabelId} className="text-[15px] font-bold">
                    {tPicker("rule.title")}
                  </span>
                  <span className="text-[13px] text-clear-ink-2">
                    {similarCount > 0 ? tPicker("rule.helpWithSimilar", { names: patternNames, count: similarCount }) : tPicker("rule.help", { names: patternNames })}
                  </span>
                </span>
                <ClearSwitch checked={withRule} onCheckedChange={setRuleOn} labelledBy={ruleLabelId} disabled={stagedId == null || busy} />
              </label>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2.5 border-t border-clear-ground pt-4">
              {failed ? (
                <p role="alert" className="m-0 min-w-0 flex-[1_1_200px] text-[13px] font-semibold text-clear-negative">
                  {t("failed")}
                </p>
              ) : (
                <span className="hidden min-w-0 flex-[1_1_200px] text-[13px] text-clear-muted lg:inline">{t("keys")}</span>
              )}
              <div className="flex flex-1 flex-wrap justify-end gap-2.5 lg:flex-none">
                <button type="button" onClick={() => setDetailOpen(true)} aria-haspopup="dialog" className={clearButtonVariants({ variant: "secondary" })}>
                  <IconListDetails aria-hidden />
                  {t("details")}
                </button>
                <button type="button" onClick={markTransfer} disabled={busy} className={clearButtonVariants({ variant: "secondary" })}>
                  <IconTransfer aria-hidden />
                  {t("markTransfer")}
                </button>
                {queue.length > 1 && (
                  <button type="button" onClick={skip} disabled={busy} className={clearButtonVariants({ variant: "secondary" })}>
                    {t("skip")}
                  </button>
                )}
                <button type="button" onClick={save} disabled={!canSave} className={clearButtonVariants()}>
                  {busy ? t("saving") : t("save")}
                  <IconArrowRight aria-hidden />
                </button>
              </div>
            </div>
          </ClearCard>
        )}

        {/* The queue and why it matters: one column from xl, side by side at lg. */}
        <div className={cn("flex min-w-0 flex-col gap-5 lg:col-span-2 lg:grid lg:grid-cols-2 lg:items-start xl:col-span-1 xl:flex", !current && "xl:col-span-3")}>
          {queue.length > 0 && (
            <ClearCard aria-labelledby="review-queue-title" className="gap-3.5">
              <ClearCardHeader
                title={<span id="review-queue-title">{t("queue.title")}</span>}
                subtitle={t("queue.count", { count: queue.length })}
                action={
                  queue.length > 1 && (
                    <button
                      type="button"
                      data-tip-anchor="needsReviewSelect"
                      onClick={() => setSelected(selectMode ? null : new Set())}
                      aria-pressed={selectMode}
                      className={clearButtonVariants({ variant: "secondary", size: "sm" })}
                    >
                      {selectMode ? t("queue.done") : t("queue.select")}
                    </button>
                  )
                }
              />
              <ol className="m-0 flex list-none flex-col gap-1 p-0">
                {visible.map((r, i) => {
                  const isCurrent = r.id === current?.id;
                  const isPicked = selected?.has(r.id) ?? false;
                  const value = signedValue(r);
                  const name = resolveDisplayName(r);
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => (selectMode ? toggleSelected(r.id) : setCurrentId(r.id))}
                        aria-current={!selectMode && isCurrent ? "step" : undefined}
                        aria-pressed={selectMode ? isPicked : undefined}
                        aria-label={selectMode ? t("queue.selectRow", { name }) : undefined}
                        className={cn(
                          "flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-clear-row px-3 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-clear-ember/50",
                          selectMode ? (isPicked ? "bg-clear-peach" : "hover:bg-clear-tile") : isCurrent ? "bg-clear-tile" : "hover:bg-clear-tile",
                        )}
                      >
                        {selectMode ? (
                          <span
                            aria-hidden
                            className={cn(
                              "inline-flex size-10 shrink-0 items-center justify-center rounded-clear-icon border-2",
                              isPicked ? "border-clear-ink bg-clear-primary text-clear-primary-ink" : "border-clear-line text-transparent",
                            )}
                          >
                            <IconCheck size={18} stroke={3} />
                          </span>
                        ) : (
                          <span
                            aria-hidden
                            className={cn(
                              "inline-flex size-10 shrink-0 items-center justify-center rounded-clear-icon text-sm font-extrabold tabular-nums",
                              isCurrent ? "bg-clear-ember text-clear-ember-ink" : "bg-clear-peach text-clear-ember-text",
                            )}
                          >
                            {i + 1}
                          </span>
                        )}
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-sm font-bold">{name}</span>
                          <span className="truncate text-[13px] text-clear-muted">
                            {[isCurrent && !selectMode ? t("queue.now") : null, dayFmt.format(date(r.date)), r.bankName].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <Amount value={value} sign="always" splitCents={false} className={cn("shrink-0 text-[15px]", value > 0 && "text-clear-positive")} />
                      </button>
                    </li>
                  );
                })}
              </ol>
              {hasMore && (
                <button type="button" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} className={cn(clearButtonVariants({ variant: "secondary", size: "sm" }), "self-center")}>
                  {t("queue.showMore", { count: Math.min(PAGE_SIZE, queue.length - visible.length) })}
                </button>
              )}
              <div className="flex flex-wrap justify-between gap-3 rounded-clear-tile bg-clear-tile px-3.5 py-3 text-[13px] text-clear-ink-2">
                <span>{t("queue.waiting")}</span>
                <span className="font-bold tabular-nums text-clear-ink">
                  <MoneyText>{t("queue.totals", { out: formatEur(out), in: formatEur(inn) })}</MoneyText>
                </span>
              </div>
            </ClearCard>
          )}

          <section aria-labelledby="review-why-title" className="flex items-start gap-3.5 rounded-clear-card bg-clear-sky px-6 py-[22px] text-clear-ink">
            <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-clear-card text-clear-sky-ink">
              <IconInfoCircle size={20} stroke={2} />
            </span>
            <div className="flex flex-col gap-1.5">
              <h2 id="review-why-title" className="m-0 text-base font-bold">{t("why.title")}</h2>
              <p className="m-0 text-sm leading-normal text-clear-sky-ink">{t("why.body")}</p>
            </div>
          </section>
        </div>
      </div>

      {current && (
        <>
          <CategoryPickerSheet
            categories={categories}
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            apply={{
              ids: [current.id],
              names: [resolveDisplayName(current)],
              onApplied: (categoryId, ids, ruleCreated) => {
                if (categoryId != null) {
                  setTeach(ruleCreated || current.recurringItemId != null ? null : { transactionId: current.id, categoryId });
                  markSorted(ids);
                }
                void refresh();
              },
            }}
          />
          <TransactionPanelSheet
            row={detailOpen ? current : null}
            categories={categories}
            savingsGoals={savingsGoals}
            onClose={() => setDetailOpen(false)}
            onCategorized={(_previous, _name, categoryId) => {
              // Categorised in the panel: it no longer needs review.
              if (categoryId != null) {
                setDetailOpen(false);
                markSorted([current.id]);
              }
              router.refresh();
            }}
          />
        </>
      )}

      {/* "Worth teaching": files the merchant's newest transaction, then the teach strip
          offers Always for the rest. */}
      {teachRow && (
        <CategoryPickerSheet
          categories={categories}
          open={teachPickerOpen}
          onOpenChange={setTeachPickerOpen}
          title={t("teach.pickTitle", { name: teachRow.merchantName ?? resolveDisplayName(teachRow) })}
          apply={{
            ids: [teachRow.id],
            names: [resolveDisplayName(teachRow)],
            onApplied: (categoryId, ids, ruleCreated) => {
              if (categoryId != null) {
                setTeach(ruleCreated ? null : { transactionId: teachRow.id, categoryId, merchantName: teachRow.merchantName });
                markSorted(ids);
              }
              setTeachPickerOpen(false);
              void refresh();
            },
          }}
        />
      )}

      {selectMode && selected.size > 0 && (
        <TransactionBulkBar
          selectedIds={[...selected]}
          categories={categories}
          allExcluded={queue.filter((r) => selected.has(r.id)).every((r) => !!r.excludeFromReports)}
          total={queue.length}
          allSelected={selected.size === queue.length}
          onSelectAll={() => setSelected((prev) => (prev && prev.size === queue.length ? new Set() : new Set(queue.map((r) => r.id))))}
          onDone={() => setSelected(null)}
        />
      )}

      {/* The one-at-a-time flow is new; so is selecting several from the queue. */}
      <ContextualTip id="needsReviewTriage" active={current != null} />
      <AnchoredTip id="needsReviewBulk" anchor="needsReviewSelect" active={!selectMode && queue.length > 1} />
      <AnchoredTip id="aiCategories" anchor="aiCategories" active={aiReady && current != null} />
      <AnchoredTip id="reviewTeach" anchor="reviewTeach" active={!teach && !selectMode && worthTeaching.length > 0} />
    </div>
  );
}

/** Nothing left to sort: a simple shape, one sentence and the way back. */
function EmptyCard() {
  const t = useTranslations("needsReview.empty");
  return (
    <ClearCard aria-labelledby="review-empty-title" className="items-center justify-center gap-6 px-6 py-12 text-center lg:col-span-2 xl:col-span-3">
      <svg width="260" height="200" viewBox="0 0 260 200" fill="none" aria-hidden className="h-auto w-full max-w-[260px]">
        <circle cx="130" cy="104" r="86" fill="var(--clr-mint)" />
        <rect x="62" y="58" width="136" height="30" rx="15" fill="var(--clr-card)" stroke="var(--clr-ink)" strokeWidth="2.5" />
        <rect x="62" y="100" width="136" height="30" rx="15" fill="var(--clr-card)" stroke="var(--clr-ink)" strokeWidth="2.5" />
        <rect x="62" y="142" width="136" height="30" rx="15" fill="var(--clr-card)" stroke="var(--clr-placeholder)" strokeWidth="2.2" strokeDasharray="5 4" />
        <circle cx="80" cy="73" r="7" fill="var(--clr-butter)" stroke="var(--clr-ink)" strokeWidth="2" />
        <circle cx="80" cy="115" r="7" fill="var(--clr-sky)" stroke="var(--clr-ink)" strokeWidth="2" />
        <path d="M96 73h52M96 115h40" stroke="var(--clr-line)" strokeWidth="5" strokeLinecap="round" />
        <circle cx="206" cy="48" r="20" fill="var(--clr-primary)" />
        <path d="M197 48l6 6 12-12" stroke="var(--clr-primary-ink)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="42" cy="140" r="6" fill="var(--clr-ember)" />
      </svg>
      <div className="flex flex-col items-center gap-2.5">
        <h2 id="review-empty-title" className="m-0 text-2xl font-extrabold tracking-[-0.02em]">{t("title")}</h2>
        <p className="m-0 max-w-[480px] text-base leading-normal text-clear-ink-2">{t("body")}</p>
      </div>
      <Link href="/transactions" className={clearButtonVariants({ size: "lg" })}>
        {t("back")}
      </Link>
    </ClearCard>
  );
}
