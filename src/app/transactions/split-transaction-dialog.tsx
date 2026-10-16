"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconAlertTriangle, IconCheck, IconChevronDown, IconInfoCircle, IconMinus, IconPlus, IconTag, IconUser, IconX } from "@tabler/icons-react";
import { AnchoredTip } from "@/components/anchored-tip";
import { Amount } from "@/components/clear/amount";
import { ClearSwitch } from "@/components/clear/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { Segmented } from "@/components/clear/segmented";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { CategoryPickerSheet } from "@/components/category-picker";
import { Icon } from "@/components/icon";
import type { Category } from "@/db/schema";
import { formatEur, currencySymbol } from "@/lib/format";
import { allocateByCounts, amountsMatch, roundToCents, type TransactionSplitRow } from "@/lib/transaction-splits";
import { cn } from "@/lib/utils";
import { MoneyText } from "@/components/clear/money";

type DraftSplit = {
  uid: string;
  categoryId: string;
  amount: string;
  count: string;
};

interface SplitTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionId: number;
  /** Already formatted: "Lotus · Sat 10 Oct · −€46,00". */
  subtitle: string;
  totalAmount: number;
  categories: Category[];
  initialSplits: TransactionSplitRow[];
}

/** "12.5" → "12,50": the inputs take a comma as the decimal separator. */
const toInput = (n: number) => n.toFixed(2).replace(".", ",");
const parseAmount = (v: string) => {
  const parsed = Number(v.replace(",", "."));
  return Number.isFinite(parsed) ? roundToCents(parsed) : 0;
};

/** The shared-cost section: others pay part of this expense back. */
type SharedDraft = { on: boolean; people: number; even: boolean; share: string };
type SharedSaved = { sharedWithCount: number | null; expectedReimbursement: number | null };

function sharedFromSaved(saved: SharedSaved, total: number): SharedDraft {
  if (saved.sharedWithCount == null) return { on: false, people: 2, even: true, share: toInput(total / 2) };
  const people = Math.max(2, saved.sharedWithCount);
  const mine = roundToCents(total - (saved.expectedReimbursement ?? 0));
  return { on: true, people, even: amountsMatch(mine, roundToCents(total / people)), share: toInput(mine) };
}

function createEqualAmountDrafts(totalAmount: number, parts = 2): DraftSplit[] {
  const amounts = allocateByCounts(totalAmount, Array.from({ length: parts }, () => 1));
  return amounts.map((amount) => ({ uid: crypto.randomUUID(), categoryId: "", amount: toInput(amount), count: "1" }));
}

/**
 * Split one payment across categories: by amount (each part its own figure, together
 * exactly the total) or by count (each part a share of the total by its count, rounded
 * so it always adds up). Saving with no parts left removes the split. The shared-cost
 * section marks the expense as one others pay part of back (people + your share).
 */
export function SplitTransactionDialog({
  open,
  onOpenChange,
  transactionId,
  subtitle,
  totalAmount,
  categories,
  initialSplits,
}: SplitTransactionDialogProps) {
  const t = useTranslations("transactions.split");
  const router = useRouter();
  const ids = useId();
  const [mode, setMode] = useState<"amount" | "count">("amount");
  const [splits, setSplits] = useState<DraftSplit[]>(() =>
    initialSplits.length > 0
      ? initialSplits.map((split) => ({ uid: String(split.id), categoryId: String(split.categoryId ?? ""), amount: toInput(split.amount), count: "1" }))
      : createEqualAmountDrafts(totalAmount),
  );
  const [picking, setPicking] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shared cost: loaded with the dialog, saved with the split (or on its own).
  const tShared = useTranslations("sharedCost");
  const [savedShared, setSavedShared] = useState<SharedSaved>({ sharedWithCount: null, expectedReimbursement: null });
  const [shared, setShared] = useState<SharedDraft>(() => sharedFromSaved(savedShared, totalAmount));
  const [sharedTouched, setSharedTouched] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/transactions/${transactionId}/shared-cost`)
      .then((r) => (r.ok ? (r.json() as Promise<SharedSaved>) : null))
      .then((saved) => {
        if (cancelled || !saved) return;
        setSavedShared(saved);
        setShared(sharedFromSaved(saved, totalAmount));
      })
      .catch(() => { /* the section starts off; saving it still works */ });
    return () => { cancelled = true; };
  }, [transactionId, totalAmount]);
  const editShared = (patch: Partial<SharedDraft>) => {
    setSharedTouched(true);
    setShared((current) => ({ ...current, ...patch }));
  };
  const evenShare = roundToCents(totalAmount / shared.people);
  const myShare = shared.even ? evenShare : parseAmount(shared.share);
  const sharedValid = !shared.on || (myShare > 0 && myShare < totalAmount + 0.005);
  const sharedPayload = shared.on
    ? { sharedWithCount: shared.people, expectedReimbursement: roundToCents(totalAmount - myShare) }
    : { sharedWithCount: null, expectedReimbursement: savedShared.sharedWithCount != null ? null : savedShared.expectedReimbursement };
  const sharedChanged =
    sharedTouched &&
    (sharedPayload.sharedWithCount !== savedShared.sharedWithCount ||
      (shared.on && !amountsMatch(sharedPayload.expectedReimbursement ?? 0, savedShared.expectedReimbursement ?? 0)));

  const countValues = splits.map((split) => {
    const parsed = Number(split.count.replace(",", "."));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  });
  const computedAmounts = mode === "count" ? allocateByCounts(totalAmount, countValues) : splits.map((split) => parseAmount(split.amount));
  const enteredTotal = roundToCents(computedAmounts.reduce((sum, amount) => sum + amount, 0));
  const totalMatches = mode === "count" || amountsMatch(enteredTotal, totalAmount);
  const left = roundToCents(totalAmount - enteredTotal);

  function updateSplit(index: number, patch: Partial<DraftSplit>) {
    setSplits((current) => current.map((split, i) => (i === index ? { ...split, ...patch } : split)));
  }

  function addSplit() {
    // A new part starts with whatever is still unallocated.
    setSplits((current) => [...current, { uid: crypto.randomUUID(), categoryId: "", amount: left > 0 ? toInput(left) : "", count: "1" }]);
  }

  function removeSplit(index: number) {
    setSplits((current) => current.filter((_, i) => i !== index));
  }

  async function patch(body: unknown, failure: string) {
    setSaving(true);
    setError(null);
    const response = await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      setError(result?.error ?? failure);
      return;
    }
    onOpenChange(false);
    router.refresh();
  }

  async function saveSplits() {
    if (!sharedValid) return setError(t("errors.share"));
    // Only the shared-cost section was used (no split before, no category picked):
    // save just that, without asking for a split.
    const splitUsed = initialSplits.length > 0 || splits.some((split) => split.categoryId);
    if (!splitUsed) {
      if (!sharedChanged) return onOpenChange(false);
      return patch({ id: transactionId, ...sharedPayload }, t("errors.saveFailed"));
    }
    if (splits.length < 2) return setError(t("errors.minParts"));
    const payload = splits.map((split, index) => ({ categoryId: Number(split.categoryId), amount: computedAmounts[index] }));
    if (payload.some((split) => !Number.isInteger(split.categoryId) || split.categoryId <= 0)) return setError(t("errors.chooseEach"));
    if (payload.some((split) => split.amount <= 0)) return setError(mode === "count" ? t("errors.positiveCount") : t("errors.positiveAmount"));
    if (!amountsMatch(payload.reduce((sum, split) => sum + split.amount, 0), totalAmount)) return setError(t("errors.sumMismatch"));
    await patch({ id: transactionId, splits: payload, ...(sharedChanged ? sharedPayload : {}) }, t("errors.saveFailed"));
  }

  const pickingSplit = picking != null ? splits[picking] : null;

  const statusChip = totalMatches ? (
    <span role="status" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-clear-mint px-3 text-[13px] font-bold text-clear-mint-ink">
      <IconCheck className="size-4" stroke={2.4} aria-hidden />
      {t("allocated")}
    </span>
  ) : (
    <span role="status" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-clear-peach px-3 text-[13px] font-bold text-clear-peach-ink">
      <IconAlertTriangle className="size-4" stroke={2} aria-hidden />
      <MoneyText>{left > 0 ? t("left", { amount: formatEur(left) }) : t("tooMuch", { amount: formatEur(-left) })}</MoneyText>
    </span>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideHeaderRow
        title={t("title")}
        className="gap-5 pt-7 font-clear text-clear-ink"
        footer={
          <ClearDialogFooter
            destructive={
              initialSplits.length > 0 ? (
                <button type="button" onClick={() => patch({ id: transactionId, splits: [] }, t("errors.removeFailed"))} disabled={saving} className={clearButtonVariants({ variant: "danger" })}>
                  {t("removeAll")}
                </button>
              ) : undefined
            }
          >
            <button type="button" onClick={() => onOpenChange(false)} disabled={saving} className={clearButtonVariants({ variant: "secondary" })}>
              {t("cancel")}
            </button>
            <button type="submit" form={`${ids}-form`} disabled={saving || !totalMatches || !sharedValid} className={clearButtonVariants()}>
              {saving ? t("saving") : t("save")}
            </button>
          </ClearDialogFooter>
        }
      >
        <ClearDialogHeader title={t("title")} subtitle={subtitle} onClose={() => onOpenChange(false)} closeLabel={t("close")} />

        <form
          id={`${ids}-form`}
          onSubmit={(e) => {
            e.preventDefault();
            saveSplits();
          }}
          className="flex flex-col gap-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="m-0 text-base font-extrabold">{t("parts")}</h3>
            <Segmented
              label={t("basis")}
              surface="tile"
              size="sm"
              value={mode}
              onChange={setMode}
              items={[
                { value: "amount", label: t("byAmount") },
                { value: "count", label: t("byCount") },
              ]}
            />
          </div>
          {mode === "count" && <p className="m-0 text-[13px] text-clear-muted">{t("countHint")}</p>}

          {splits.map((split, index) => {
            const category = categories.find((c) => String(c.id) === split.categoryId);
            const n = index + 1;
            const name = category?.name ?? t("chooseCategory");
            return (
              <div key={split.uid} className="flex items-center gap-2.5 rounded-clear-tile bg-clear-tile p-2.5">
                <button
                  type="button"
                  onClick={() => setPicking(index)}
                  aria-label={t("categoryFor", { n, name })}
                  className="flex h-12 min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-clear-row bg-clear-card pr-3.5 pl-2 text-left text-[15px] font-semibold"
                >
                  {category ? (
                    <span aria-hidden className="inline-flex shrink-0 [&>*]:size-8!">
                      <Icon iconKey={category.icon} color={category.color} size="sm" glyphSize={16} soft />
                    </span>
                  ) : (
                    <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-clear-icon bg-clear-tile text-clear-muted">
                      <IconTag className="size-4" stroke={1.9} />
                    </span>
                  )}
                  <span className={cn("min-w-0 flex-1 truncate", !category && "text-clear-placeholder")}>{name}</span>
                  <IconChevronDown className="size-4 shrink-0 text-clear-muted" stroke={2.2} aria-hidden />
                </button>
                {mode === "amount" ? (
                  <label className="flex h-12 w-[140px] shrink-0 cursor-text items-center gap-1 rounded-clear-row bg-clear-card px-3.5">
                    <span className="sr-only">{t("amountFor", { n })}</span>
                    <span aria-hidden className="text-[15px] font-bold text-clear-muted">
                      {currencySymbol()}
                    </span>
                    <input
                      inputMode="decimal"
                      autoComplete="off"
                      value={split.amount}
                      placeholder="0,00"
                      onChange={(e) => updateSplit(index, { amount: e.target.value.replace(/[^0-9.,]/g, "") })}
                      className="min-w-0 flex-1 bg-transparent p-0 text-right text-base font-extrabold tabular-nums text-clear-ink outline-none placeholder:text-clear-placeholder"
                    />
                  </label>
                ) : (
                  <div className="flex shrink-0 items-center gap-2">
                    <label className="flex h-12 w-20 cursor-text items-center gap-1 rounded-clear-row bg-clear-card px-3">
                      <span className="sr-only">{t("countFor", { n })}</span>
                      <span aria-hidden className="text-[15px] font-bold text-clear-muted">
                        ×
                      </span>
                      <input
                        inputMode="numeric"
                        autoComplete="off"
                        value={split.count}
                        onChange={(e) => updateSplit(index, { count: e.target.value.replace(/[^0-9.,]/g, "") })}
                        className="min-w-0 flex-1 bg-transparent p-0 text-right text-base font-extrabold tabular-nums text-clear-ink outline-none"
                      />
                    </label>
                    <span className="w-20 text-right text-[15px] font-extrabold tabular-nums"><MoneyText>{formatEur(computedAmounts[index] ?? 0)}</MoneyText></span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeSplit(index)}
                  disabled={splits.length <= 2}
                  aria-label={t("remove", { n, name })}
                  title={splits.length <= 2 ? t("minPartsHint") : t("remove", { n, name })}
                  className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-clear-card text-clear-ink-2 transition-colors hover:text-clear-ink disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <IconX className="size-[18px]" stroke={2} aria-hidden />
                </button>
              </div>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <button type="button" onClick={addSplit} className={cn(clearButtonVariants({ variant: "secondary" }), "h-10 pl-3 text-sm")}>
              <IconPlus className="size-4" stroke={2.2} aria-hidden />
              {t("addPart")}
            </button>
            {statusChip}
          </div>

          {/* Shared cost: others pay part of this back. Reports can then use your share. */}
          <section
            aria-labelledby={`${ids}-shared`}
            data-tip-anchor="splitSharedCost"
            className="mt-2.5 flex flex-col gap-3 border-t border-clear-line pt-5"
          >
            <h3 id={`${ids}-shared`} className="m-0 text-base font-extrabold">
              {tShared("row")}
            </h3>
            <div className="flex min-h-11 items-center justify-between gap-4">
              <span id={`${ids}-shared-toggle`} className="text-[15px] font-semibold">
                {tShared("sharedToggle")}
              </span>
              <ClearSwitch checked={shared.on} onCheckedChange={(on) => editShared({ on })} labelledBy={`${ids}-shared-toggle`} />
            </div>
            {shared.on && (
              <>
                <div className="flex min-h-11 items-center justify-between gap-4">
                  <label htmlFor={`${ids}-people`} className="text-[15px] font-semibold">
                    {tShared("peopleLabel")}
                  </label>
                  <div className="inline-flex shrink-0 items-center gap-1 rounded-full bg-clear-tile p-1">
                    <button
                      type="button"
                      onClick={() => editShared({ people: Math.max(2, shared.people - 1) })}
                      disabled={shared.people <= 2}
                      aria-label={t("fewer")}
                      className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full bg-clear-card text-clear-ink disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <IconMinus className="size-4" stroke={2.4} aria-hidden />
                    </button>
                    <input
                      id={`${ids}-people`}
                      inputMode="numeric"
                      autoComplete="off"
                      value={shared.people}
                      onChange={(e) => {
                        const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                        editShared({ people: Number.isFinite(n) ? Math.min(99, Math.max(2, n)) : 2 });
                      }}
                      className="w-9 bg-transparent p-0 text-center text-base font-extrabold tabular-nums text-clear-ink outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => editShared({ people: Math.min(99, shared.people + 1) })}
                      aria-label={t("more")}
                      className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full bg-clear-card text-clear-ink"
                    >
                      <IconPlus className="size-4" stroke={2.4} aria-hidden />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    aria-pressed={shared.even}
                    onClick={() => editShared({ even: !shared.even, share: toInput(myShare) })}
                    className={cn(
                      "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full pr-3.5 pl-2.5 text-[13px] font-bold transition-colors",
                      shared.even ? "bg-clear-primary text-clear-primary-ink" : "bg-clear-tile text-clear-ink",
                    )}
                  >
                    {shared.even && <IconCheck className="size-4" stroke={2.6} aria-hidden />}
                    {tShared("splitEvenly")}
                  </button>
                  {shared.even ? (
                    <span className="text-[13px] font-semibold text-clear-ink-2">
                      <MoneyText>{t("each", { amount: formatEur(evenShare) })}</MoneyText>
                    </span>
                  ) : (
                    <label className="flex h-10 w-[150px] cursor-text items-center gap-1 rounded-clear-row bg-clear-tile px-3">
                      <span className="sr-only">{t("yourShare")}</span>
                      <span aria-hidden className="text-sm font-bold text-clear-muted">
                        {currencySymbol()}
                      </span>
                      <input
                        inputMode="decimal"
                        autoComplete="off"
                        value={shared.share}
                        placeholder="0,00"
                        onChange={(e) => editShared({ share: e.target.value.replace(/[^0-9.,]/g, "") })}
                        className="min-w-0 flex-1 bg-transparent p-0 text-right text-[15px] font-extrabold tabular-nums text-clear-ink outline-none placeholder:text-clear-placeholder"
                      />
                    </label>
                  )}
                </div>
                <div className="flex items-center justify-between gap-4 rounded-clear-tile bg-clear-lilac px-[18px] py-4 text-clear-ink">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-[13px] font-bold text-clear-ink-2">{t("yourShare")}</span>
                    <span className="flex flex-wrap items-baseline gap-x-1.5">
                      <Amount value={myShare} className="text-[30px] leading-none tracking-[-0.03em]" />
                      <span className="text-[15px] font-semibold text-clear-ink-2">
                        <MoneyText>{t("ofTotal", { total: formatEur(totalAmount) })}</MoneyText>
                      </span>
                    </span>
                  </div>
                  <div aria-hidden className="flex shrink-0 items-center">
                    <span className="inline-flex size-9 items-center justify-center rounded-full border-2 border-clear-lilac bg-clear-peach text-clear-peach-ink">
                      <IconUser className="size-4" stroke={2.2} />
                    </span>
                    <span className="-ml-2.5 inline-flex size-9 items-center justify-center rounded-full border-2 border-clear-lilac bg-clear-card text-[13px] font-extrabold text-clear-lilac-ink">
                      +{shared.people - 1}
                    </span>
                  </div>
                </div>
                <p className="m-0 flex items-start gap-2 text-[13px] leading-snug text-clear-muted">
                  <IconInfoCircle className="mt-px size-4 shrink-0" stroke={2} aria-hidden />
                  {tShared("sharedHint")}
                </p>
              </>
            )}
          </section>
          <AnchoredTip id="splitSharedCost" anchor="splitSharedCost" active={open} />

          {error && (
            <p role="alert" className="m-0 rounded-clear-tile bg-clear-negative-fill/15 px-4 py-3 text-sm font-semibold text-clear-negative">
              {error}
            </p>
          )}
        </form>

        <CategoryPickerSheet
          categories={categories}
          current={pickingSplit?.categoryId}
          open={picking != null}
          onOpenChange={(v) => !v && setPicking(null)}
          onChange={(v) => {
            if (picking != null) updateSplit(picking, { categoryId: v === "none" ? "" : v });
            setPicking(null);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
