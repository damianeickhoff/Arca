"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconPencil, IconPlayerPause, IconPlayerPlay, IconTrash } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogFooter, ClearDialogFooterDock, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearChip } from "@/components/clear/chip";
import { Amount } from "@/components/clear/amount";
import { ListRow } from "@/components/clear/list-row";
import { ClearProgress } from "@/components/clear/progress";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { Icon } from "@/components/icon";
import { AnchoredTip } from "@/components/anchored-tip";
import { RecurringClient } from "./recurring-client";
import { RecurringCharges, useLinkedTransactions, type LinkedTx } from "./recurring-charges";
import { TransactionPanelSheet } from "@/app/transactions/_activity/transaction-panel-sheet";
import { formatEur, normalizeBudgetType } from "@/lib/format";
import { isValidISODate } from "@/lib/date-valid";
import { planPartNumber, type PlanProgress } from "@/lib/payment-plan";
import { parseAltMatchPatterns } from "@/lib/recurring-patterns";
import { UNCATEGORIZED_ICON, UNCATEGORIZED_COLOR } from "@/lib/auto-brand";
import type { RecurringItem, Category } from "@/db/schema";
import { MoneyText } from "@/components/clear/money";

const BUDGET_TYPE_KEY: Record<string, "needs" | "wants" | "savings"> = { nodig: "needs", willen: "wants", sparen: "savings" };

/** A payment plan's progress (see getPlanProgress); null while loading or for any other type. */
function usePlanProgress(item: RecurringItem): PlanProgress | null {
  const planId = item.type === "plan" ? item.id : null;
  const [loaded, setLoaded] = useState<{ id: number; progress: PlanProgress | null } | null>(null);
  useEffect(() => {
    if (planId == null) return;
    let cancelled = false;
    fetch(`/api/recurring/plan-progress?itemId=${planId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((progress: PlanProgress | null) => { if (!cancelled) setLoaded({ id: planId, progress }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [planId]);
  return loaded && loaded.id === planId ? loaded.progress : null;
}

/**
 * One recurring item in full, in the Popup-Recurring look: what it costs and whether
 * it runs, the last 12 charges with any price change, its details, and the linked
 * transactions (each opens its transaction). Pause/resume and delete act here; Edit
 * opens the recurring form stacked on top, so closing it returns here.
 */
export function RecurringDetailDialog({
  item,
  category,
  categories,
  dueDate,
  onClose,
}: {
  item: RecurringItem | null;
  category?: Category | null;
  categories: Category[];
  dueDate?: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("recurringDetail");
  // Keeps the body rendered through the close animation — the caller clears `item`
  // the instant the sheet starts closing. Compared by id, since `item` is used directly
  // while open.
  const [lastItem, setLastItem] = useState<RecurringItem | null>(null);
  if (item && item.id !== lastItem?.id) setLastItem(item);
  const shown = item ?? lastItem;

  return (
    <Dialog open={item != null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent hideHeaderRow title={shown ? shown.friendlyName || shown.name : t("title")} className="gap-4 pt-6">
        {/* Keyed by item id: the dialog is mounted once and re-pointed at whichever
            item is tapped. */}
        {shown && (
          <DetailBody
            key={shown.id}
            item={shown}
            open={item != null}
            category={category}
            categories={categories}
            dueDate={dueDate}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailBody({
  item,
  open,
  category,
  categories,
  dueDate,
  onClose,
}: {
  item: RecurringItem;
  open: boolean;
  category?: Category | null;
  categories: Category[];
  dueDate?: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("recurringDetail");
  const tForm = useTranslations("recurringForm");
  const tShared = useTranslations("sharedCost");
  const locale = useLocale();
  const router = useRouter();
  const confirm = useConfirm();
  const [active, setActive] = useState(item.active);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<LinkedTx | null>(null);
  const txs = useLinkedTransactions(item.id);
  const planProgress = usePlanProgress(item);

  // Saving "active" from the edit form (rather than the pause button, which sets local
  // state itself) changes item.active without remounting this body.
  const [prevItemActive, setPrevItemActive] = useState(item.active);
  if (item.active !== prevItemActive) {
    setPrevItemActive(item.active);
    setActive(item.active);
  }

  const longDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const fmt = (iso: string) => (isValidISODate(iso) ? longDate.format(new Date(`${iso}T12:00:00`)) : iso);

  async function togglePause() {
    const next = !active;
    setActive(next);
    setBusy(true);
    await fetch("/api/recurring", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, active: next }),
    });
    setBusy(false);
    router.refresh();
  }

  async function remove() {
    const ok = await confirm({
      title: tForm("confirmDelete", { name: item.name }),
      body: tForm("confirmDeleteBody"),
      confirmLabel: tForm("confirmDeleteLabel"),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    await fetch("/api/recurring", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id }),
    });
    setBusy(false);
    onClose();
    router.refresh();
  }

  const iconKey = category?.icon ?? UNCATEGORIZED_ICON;
  const iconColor = category?.icon ? category.color : UNCATEGORIZED_COLOR;
  const isFutureStart = !!item.startDate && item.startDate > new Date().toISOString().slice(0, 10);
  // Prefer the friendly bank name over the raw account number/IBAN.
  const derived = txs?.find((x) => x.bankName || x.account);
  const accountLabel = derived?.bankName ?? derived?.account ?? null;
  const typeLabel = tForm.has(`types.${item.type}`) ? tForm(`types.${item.type}`) : item.type;
  const freqLabel = tForm.has(`frequencies.${item.frequency}`) ? tForm(`frequencies.${item.frequency}`) : item.frequency;
  const budgetKey = item.budgetType ? BUDGET_TYPE_KEY[normalizeBudgetType(item.budgetType)] : undefined;
  const isIncome = item.type === "income";
  const signed = (v: number) => (isIncome ? Math.abs(v) : -Math.abs(v));
  const isPlan = item.type === "plan" && item.planTotal != null && item.planParts != null;
  const nextPart = dueDate ? planPartNumber(item, dueDate) : null;
  const altPatterns = parseAltMatchPatterns(item.altMatchPatterns);

  const details: { label: string; value: React.ReactNode }[] = [
    {
      label: t("category"),
      value: (
        <span className="inline-flex min-w-0 items-center gap-2">
          <Icon iconKey={iconKey} color={iconColor} size="xs" soft />
          <span className="truncate">{category?.name ?? t("uncategorized")}</span>
        </span>
      ),
    },
    ...(accountLabel ? [{ label: t("account"), value: accountLabel }] : []),
    ...(budgetKey && !isIncome ? [{ label: t("budgetType"), value: tForm(`budgetTypes.${budgetKey}`) }] : []),
    // Shared costs: the amount stays the gross charge (that's what leaves the account),
    // so spell out what actually lands on you.
    ...(item.sharedReimbursedAmount != null && item.amount != null
      ? [
          {
            label: tShared("row"),
            value: tShared("preview", {
              share: formatEur(Math.max(0, Math.round((item.amount - item.sharedReimbursedAmount) * 100) / 100)),
              total: formatEur(item.amount),
            }),
          },
          ...(item.sharedWithCount != null ? [{ label: tShared("peopleLabel"), value: String(item.sharedWithCount) }] : []),
        ]
      : []),
    ...(item.isReimbursement ? [{ label: tShared("row"), value: tShared("rowPayback") }] : []),
    ...(isPlan ? [{ label: t("planTotal"), value: t("planTotalValue", { total: formatEur(item.planTotal!), parts: item.planParts! }) }] : []),
    // Always shown when set — it's the recurrence's anchor. Flagged when it hasn't
    // arrived yet, since nothing is due before then.
    ...(item.startDate ? [{ label: t("startDate"), value: isFutureStart ? t("startsLater", { date: fmt(item.startDate) }) : fmt(item.startDate) }] : []),
    ...(item.dueDay != null ? [{ label: t("dueDay"), value: t("dueDayValue", { day: item.dueDay }) }] : []),
    ...(dueDate ? [{ label: t("next"), value: fmt(dueDate) }] : []),
    ...(item.endDate ? [{ label: t("endDate"), value: fmt(item.endDate) }] : []),
    // The extra names (a renamed payee) that also link charges to this item.
    ...(altPatterns.length ? [{ label: t("alsoMatches"), value: altPatterns.join(", ") }] : []),
    ...(item.notes ? [{ label: t("notes"), value: item.notes }] : []),
  ];

  return (
    <>
      <AnchoredTip id="recurringCharges" anchor="recurringCharges" active={open && !editOpen && selectedTx == null && (txs?.length ?? 0) >= 2} />

      <ClearDialogHeader
        title={item.friendlyName || item.name}
        subtitle={[typeLabel, freqLabel, item.friendlyName && item.friendlyName !== item.name ? item.name : null].filter(Boolean).join(" · ")}
        icon={<Icon iconKey={iconKey} color={iconColor} size="xl" soft />}
        onClose={onClose}
        closeLabel={t("close")}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          {item.amount != null ? (
            <Amount value={signed(item.amount)} sign={isIncome ? "always" : "auto"} className="text-[36px] sm:text-[42px]" />
          ) : (
            <span className="clear-amount text-[36px]">—</span>
          )}
          <span className="text-[15px] text-clear-ink-2">
            {active && dueDate
              ? nextPart && item.planParts
                ? t("planNextPart", { part: nextPart, parts: item.planParts, date: fmt(dueDate) })
                : t("nextOn", { date: fmt(dueDate) })
              : freqLabel}
          </span>
        </div>
        <ClearChip tone={active ? "mint" : "stone"}>
          <span aria-hidden className={active ? "size-2 rounded-full bg-clear-positive-fill" : "size-2 rounded-full bg-clear-placeholder"} />
          {active ? t("active") : t("paused")}
        </ClearChip>
      </div>

      {isPlan && (
        <div className="flex flex-col gap-2.5 rounded-clear-tile bg-clear-tile px-4 py-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-[15px] font-bold">
              {t("planPaid", { paid: planProgress?.paidParts ?? 0, parts: item.planParts! })}
            </span>
            <span className="text-[13px] text-clear-muted">
              <MoneyText>{t("planLeft", { left: formatEur(planProgress?.remaining ?? item.planTotal!), total: formatEur(item.planTotal!) })}</MoneyText>
            </span>
          </div>
          <ClearProgress value={item.planTotal! > 0 ? (planProgress?.paidAmount ?? 0) / item.planTotal! : 0} />
        </div>
      )}

      {txs && <RecurringCharges txs={txs} income={isIncome} frequency={item.frequency} />}

      <dl className="m-0 flex flex-col overflow-hidden rounded-clear-tile border border-clear-line">
        {details.map((d, i) => (
          <div key={`${d.label}-${i}`} className="flex min-h-[52px] items-center justify-between gap-3 border-b border-clear-ground px-4 py-2 last:border-b-0">
            <dt className="shrink-0 text-[15px] font-semibold text-clear-ink-2">{d.label}</dt>
            <dd className="m-0 min-w-0 truncate text-right text-[15px] font-bold"><MoneyText>{d.value}</MoneyText></dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="recurring-linked" className="flex flex-col">
        <div className="flex items-baseline justify-between gap-3 pb-1">
          <h3 id="recurring-linked" className="m-0 text-lg font-bold">{t("linked")}</h3>
          {txs && txs.length > 0 && <span className="text-[13px] text-clear-muted">{t("linkedCount", { count: txs.length })}</span>}
        </div>
        {txs === null ? (
          <p role="status" className="m-0 py-4 text-center text-[15px] text-clear-muted">{t("loading")}</p>
        ) : txs.length === 0 ? (
          <p className="m-0 rounded-clear-tile bg-clear-tile px-4 py-5 text-center text-[15px] text-clear-muted">{t("noLinked")}</p>
        ) : (
          txs.map((x) => (
            <ListRow
              key={x.id}
              icon={<Icon iconKey={iconKey} color={iconColor} size="lg" soft />}
              title={fmt(x.date)}
              meta={x.bankName ?? x.account ?? undefined}
              trailing={<Amount value={signed(x.correctedAmount ?? x.amount)} sign={isIncome ? "always" : "auto"} className="text-[15px]" />}
              onClick={() => setSelectedTx(x)}
            />
          ))
        )}
      </section>

      <ClearDialogFooterDock className="pb-1">
        <ClearDialogFooter
          destructive={
            <button type="button" onClick={remove} disabled={busy} className={clearButtonVariants({ variant: "danger" })}>
              <IconTrash aria-hidden />
              {t("delete")}
            </button>
          }
        >
          <button type="button" onClick={togglePause} disabled={busy} className={clearButtonVariants({ variant: "secondary" })}>
            {active ? <IconPlayerPause aria-hidden /> : <IconPlayerPlay aria-hidden />}
            {active ? t("pause") : t("resume")}
          </button>
          <button type="button" onClick={() => setEditOpen(true)} className={clearButtonVariants()}>
            <IconPencil aria-hidden />
            {t("edit")}
          </button>
        </ClearDialogFooter>
      </ClearDialogFooterDock>

      {/* Rendered inside this dialog's content so it's a nested sheet: closing it
          returns here instead of tearing down the detail dialog too. */}
      <RecurringClient action="edit" item={item} open={editOpen} onOpenChange={setEditOpen} />

      <TransactionPanelSheet
        row={selectedTx}
        categories={categories}
        onClose={() => setSelectedTx(null)}
        onCategorized={() => router.refresh()}
      />
    </>
  );
}
