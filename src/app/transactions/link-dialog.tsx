"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconArrowRight, IconCheck, IconLink, IconReceiptRefund, IconSearch } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField } from "@/components/clear/field";
import { Amount } from "@/components/clear/amount";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { formatEur, currencySymbol } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AnchoredTip } from "@/components/anchored-tip";
import { MoneyText } from "@/components/clear/money";

interface Suggestion {
  id: number;
  date: string;
  amount: number;
  expectedReimbursement: number | null;
  description: string;
  categoryName: string | null;
  categoryColor: string | null;
  alreadyLinked: number;
}

interface Props {
  /** The money that came in (a Tikkie, a refund) — the transaction the panel shows. */
  tikkie: {
    id: number;
    amount: number;
    description: string;
    date: string;
    allocatedAmount: number;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const num = (v: string) => parseFloat(v.replace(",", "."));
const toInput = (n: number) => n.toFixed(2).replace(".", ",");
const AMOUNT_CHARS = /[^0-9.,]/g;

/**
 * Link money that came in (a Tikkie, a refund) to the expense it paid back. Pick one of
 * the expenses around its date, or search for an older one; how much of this payment goes to it, and how much you
 * expect back for it in total (several Tikkies can cover one dinner), are pre-filled.
 * The preview shows what the expense costs you after linking.
 */
export function LinkDialog({ tikkie, open, onOpenChange }: Props) {
  const t = useTranslations("transactions.link");
  const locale = useLocale();
  const router = useRouter();
  const ids = useId();
  const remainingBalance = tikkie.amount - tikkie.allocatedAmount;

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Suggestion | null>(null);
  // How much of THIS payment goes to the selected expense
  const [portion, setPortion] = useState("");
  // Total expected back for the expense (may differ when several payments cover it)
  const [expectedBack, setExpectedBack] = useState("");
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/reimbursements/suggestions?transactionId=${tikkie.id}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setSuggestions(Array.isArray(d) ? d : []); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, tikkie.id]);

  // Searching looks past the recent window: every open expense whose name matches.
  const term = query.trim().toLowerCase();
  const [searched, setSearched] = useState<{ term: string; rows: Suggestion[] } | null>(null);
  useEffect(() => {
    if (!open || term.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/reimbursements/suggestions?transactionId=${tikkie.id}&q=${encodeURIComponent(term)}`)
        .then((r) => r.json())
        .then((d) => { if (!cancelled) setSearched({ term, rows: Array.isArray(d) ? d : [] }); })
        .catch(() => { /* the recent list stays filtered locally */ });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, term, tikkie.id]);

  function handleOpenChange(v: boolean) {
    onOpenChange(v);
    if (!v) {
      setSelected(null);
      setQuery("");
    }
  }

  function select(s: Suggestion) {
    setSelected(s);
    // By default: whatever is still open on both sides.
    const expenseRemaining = s.expectedReimbursement != null ? s.expectedReimbursement - s.alreadyLinked : s.amount;
    const p = Math.max(0, Math.min(remainingBalance, expenseRemaining));
    setPortion(toInput(p));
    setExpectedBack(toInput(s.alreadyLinked + p));
  }

  async function confirmLink() {
    if (!selected) return;
    const p = num(portion);
    const expected = num(expectedBack);
    if (isNaN(p) || p <= 0 || isNaN(expected) || expected <= 0) return;
    setLinking(true);
    await fetch("/api/reimbursements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reimbursementTransactionId: tikkie.id,
        originalTransactionId: selected.id,
        amount: p,
        expectedReimbursement: expected,
      }),
    });
    setLinking(false);
    handleOpenChange(false);
    router.refresh();
  }

  const fmtDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
  const localMatches = suggestions.filter((s) => s.description.toLowerCase().includes(term) || (s.categoryName ?? "").toLowerCase().includes(term));
  const shown = !term ? suggestions : searched?.term === term ? searched.rows : localMatches;

  const p = num(portion);
  const validPortion = !isNaN(p) && p > 0;
  const validExpected = !isNaN(num(expectedBack)) && num(expectedBack) > 0;
  const costNow = selected ? Math.max(0, selected.amount - selected.alreadyLinked) : 0;
  const costAfter = selected && validPortion ? Math.max(0, costNow - p) : costNow;
  const cents = (n: number) => Math.round(n * 100);

  const amountField = (id: string, label: string, hint: string, value: string, onChange: (v: string) => void) => (
    <ClearField label={label} htmlFor={id} hint={hint} className="min-w-0">
      <div className="flex h-12 items-center gap-1.5 rounded-clear-row border-[1.5px] border-transparent bg-clear-tile px-4 transition-colors focus-within:border-clear-ink">
        <span aria-hidden className="text-[15px] font-bold text-clear-muted">
          {currencySymbol()}
        </span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(AMOUNT_CHARS, ""))}
          className="h-full min-w-0 flex-1 bg-transparent p-0 text-[15px] font-extrabold tabular-nums text-clear-ink outline-none"
        />
      </div>
    </ClearField>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        hideHeaderRow
        title={t("title")}
        className="gap-5 pt-7 font-clear text-clear-ink"
        footer={
          <ClearDialogFooter>
            <button type="button" onClick={() => handleOpenChange(false)} className={clearButtonVariants({ variant: "secondary" })}>
              {t("cancel")}
            </button>
            <button type="submit" form={`${ids}-form`} disabled={!selected || linking || !validPortion || !validExpected} className={clearButtonVariants()}>
              <IconLink aria-hidden />
              {linking ? t("linking") : t("link")}
            </button>
          </ClearDialogFooter>
        }
      >
        <ClearDialogHeader
          title={t("title")}
          subtitle={
            <MoneyText>{tikkie.allocatedAmount > 0
              ? t("subtitleRemaining", { name: tikkie.description, amount: formatEur(tikkie.amount), left: formatEur(remainingBalance) })
              : t("subtitle", { name: tikkie.description, amount: formatEur(tikkie.amount) })}</MoneyText>
          }
          onClose={() => handleOpenChange(false)}
          closeLabel={t("close")}
        />

        <form
          id={`${ids}-form`}
          onSubmit={(e) => {
            e.preventDefault();
            confirmLink();
          }}
          className="flex flex-col gap-5"
        >
          <label
            data-tip-anchor="linkSearch"
            className="flex h-12 cursor-text items-center gap-2.5 rounded-clear-row border-[1.5px] border-transparent bg-clear-tile px-4 text-clear-muted transition-colors focus-within:border-clear-ink"
          >
            <IconSearch className="size-[18px] shrink-0" stroke={2} aria-hidden />
            <span className="sr-only">{t("search")}</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="min-w-0 flex-1 bg-transparent p-0 text-[15px] text-clear-ink outline-none placeholder:text-clear-placeholder"
            />
          </label>
          <AnchoredTip id="linkSearchOlder" anchor="linkSearch" active={open && !loading} />

          <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 text-[13px] font-bold text-clear-ink-2">{term ? t("results") : t("candidates", { date: fmtDay(tikkie.date) })}</legend>
            {loading && <p className="m-0 py-4 text-center text-sm text-clear-muted">{t("loading")}</p>}
            {!loading && shown.length === 0 && <p className="m-0 rounded-clear-tile bg-clear-tile px-4 py-5 text-center text-sm text-clear-muted">{term ? t("noMatches", { query: query.trim() }) : t("none")}</p>}
            <MoneyText>{!loading &&
              shown.map((s) => {
                const on = selected?.id === s.id;
                const target = s.expectedReimbursement ?? s.amount;
                const pct = s.alreadyLinked > 0 ? Math.round((s.alreadyLinked / target) * 100) : 0;
                const chip =
                  cents(s.amount) === cents(remainingBalance) ? t("sameAmount") : cents(s.amount / 2) === cents(remainingBalance) ? t("exactlyHalf") : null;
                const meta = [
                  fmtDay(s.date),
                  s.categoryName,
                  s.alreadyLinked > 0 ? t("covered", { pct, left: formatEur(Math.max(0, target - s.alreadyLinked)) }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <label
                    key={s.id}
                    className={cn(
                      "relative flex min-h-[68px] cursor-pointer items-center gap-3 rounded-clear-tile border-2 py-2 pr-4 pl-3 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-clear-ember/50",
                      on ? "border-clear-ink bg-clear-card" : "border-transparent bg-clear-tile hover:bg-clear-line/60",
                    )}
                  >
                    <input type="radio" name={`${ids}-expense`} checked={on} onChange={() => select(s)} className="sr-only" />
                    <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-clear-icon bg-clear-peach text-sm font-extrabold text-clear-peach-ink">
                      {s.description.trim().charAt(0).toUpperCase() || "?"}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[15px] font-bold">{s.description}</span>
                        {chip && <span className="inline-flex h-6 items-center rounded-full bg-clear-sky px-2.5 text-xs font-bold text-clear-sky-ink">{chip}</span>}
                      </span>
                      <span className="truncate text-[13px] text-clear-muted">{meta}</span>
                    </span>
                    <Amount value={-s.amount} className="shrink-0 text-[15px]" />
                    <span
                      aria-hidden
                      className={cn(
                        "inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                        on ? "border-clear-primary bg-clear-primary text-clear-primary-ink" : "border-clear-line bg-clear-card",
                      )}
                    >
                      {on && <IconCheck className="size-3.5" stroke={3} />}
                    </span>
                  </label>
                );
              })}</MoneyText>
          </fieldset>

          {selected && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <MoneyText>{amountField(`${ids}-portion`, t("portion"), t("portionHint", { amount: formatEur(remainingBalance) }), portion, setPortion)}</MoneyText>
                <MoneyText>{amountField(
                  `${ids}-expected`,
                  t("expected"),
                  t("expectedHint", { share: formatEur(Math.max(0, selected.amount - (num(expectedBack) || 0))), total: formatEur(selected.amount) }),
                  expectedBack,
                  setExpectedBack,
                )}</MoneyText>
              </div>

              <section aria-label={t("previewLabel")} className="flex flex-col gap-3.5 rounded-clear-tile bg-clear-mint p-[18px] text-clear-ink">
                <div className="flex items-start gap-2.5">
                  <span aria-hidden className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-full bg-clear-card text-clear-positive">
                    <IconReceiptRefund className="size-4" stroke={2} />
                  </span>
                  <p className="m-0 text-sm leading-normal font-medium">
                    <MoneyText>{t.rich("preview", {
                      name: selected.description,
                      share: formatEur(costAfter),
                      amount: formatEur(validPortion ? p : 0),
                      b: (c) => <b className="font-extrabold"><MoneyText>{c}</MoneyText></b>,
                    })}</MoneyText>
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="flex flex-1 flex-col gap-0.5 rounded-clear-icon bg-clear-card px-3.5 py-3">
                    <span className="text-xs font-bold text-clear-ink-2">{t("was")}</span>
                    <Amount value={costNow} className="text-xl text-clear-muted line-through" />
                  </div>
                  <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-clear-card text-clear-positive">
                    <IconArrowRight className="size-4" stroke={2.2} />
                  </span>
                  <div className="flex flex-1 flex-col gap-0.5 rounded-clear-icon bg-clear-card px-3.5 py-3">
                    <span className="text-xs font-bold text-clear-ink-2">{t("now")}</span>
                    <Amount value={costAfter} className="text-xl text-clear-positive" />
                  </div>
                </div>
              </section>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
