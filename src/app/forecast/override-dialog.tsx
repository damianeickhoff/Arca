"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconArrowDownRight, IconArrowUpRight, IconChevronLeft, IconChevronRight, IconInfoCircle, IconTrash } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { Icon } from "@/components/icon";
import { currencySymbol, formatEur, formatEurWhole } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PlanItem, PlanMonth } from "./load-forecast";
import { amountFor, usualFor } from "./plan-amounts";
import { MoneyText } from "@/components/clear/money";

const ENDPOINT = {
  recurring: { url: "/api/prognose/overrides", id: "recurringItemId", amount: "amount" },
  savings: { url: "/api/savings-overrides", id: "goalId", amount: "overrideAmount" },
  budget: { url: "/api/prognose/variable-overrides", id: "categoryId", amount: "overrideAmount" },
} as const;

/** "1.234,56", "1234.56" or "12,5" → a number; null when it isn't one. */
function parseAmount(raw: string): number | null {
  let s = raw.replace(/[\s€$£]/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else {
    s = s.replace(",", ".");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

function inputValue(n: number) {
  return n.toFixed(2).replace(".", ",");
}

/**
 * Change one month of a recurring item, savings goal or category budget without
 * touching the rule: a month switcher, the amount, the six months around it (the
 * override in ember against the usual amount) and Save / Delete override.
 * Remounted per opening (the caller keys it), so it always starts on the plan month.
 */
export function OverrideDialog({
  item,
  initialMonth,
  months,
  allowedMonths,
  onClose,
}: {
  item: PlanItem | null;
  initialMonth: string;
  months: Record<string, PlanMonth>;
  allowedMonths: string[];
  onClose: () => void;
}) {
  const t = useTranslations("insights.forecast.override");
  const router = useRouter();
  const inputId = useId();
  // Keeps the content through the closing animation once the caller clears `item`.
  const [opened] = useState(item);
  const shown = item ?? opened;
  const [month, setMonth] = useState(initialMonth);
  const [value, setValue] = useState(() => (shown ? inputValue(amountFor(shown, initialMonth)) : ""));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!shown) return null;

  const label = months[month];
  const usual = usualFor(shown, month);
  const saved = shown.overrides[month];
  const parsed = parseAmount(value);
  const diff = parsed != null ? parsed - usual : 0;
  const index = allowedMonths.indexOf(month);
  const prev = index > 0 ? allowedMonths[index - 1] : undefined;
  const next = index >= 0 && index < allowedMonths.length - 1 ? allowedMonths[index + 1] : undefined;

  function switchTo(m: string | undefined) {
    if (!m || !shown) return;
    setMonth(m);
    setValue(inputValue(amountFor(shown, m)));
    setFailed(false);
  }

  async function send(method: "POST" | "DELETE", amount?: number) {
    if (!shown) return;
    const api = ENDPOINT[shown.kind];
    setBusy(true);
    setFailed(false);
    const res = await fetch(api.url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(method === "POST" ? { [api.id]: shown.id, month, [api.amount]: amount } : { [api.id]: shown.id, month }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setFailed(true);
      return;
    }
    router.refresh();
    onClose();
  }

  function save() {
    if (parsed == null) return;
    if (Math.abs(parsed - usual) < 0.005) {
      // Back to the usual amount: drop the override instead of storing a copy of it.
      if (saved != null) void send("DELETE");
      else onClose();
      return;
    }
    void send("POST", parsed);
  }

  // The six months around the chosen one, each with what the plan uses for it.
  const keys = Object.keys(months).sort();
  const at = keys.indexOf(month);
  const strip = [-3, -2, -1, 0, 1, 2]
    .map((offset) => (at === -1 ? undefined : keys[at + offset]))
    .filter((m): m is string => m != null && months[m] != null)
    .map((m) => {
      const isCurrent = m === month;
      const amount = isCurrent && parsed != null ? parsed : amountFor(shown, m);
      const isOverride = isCurrent ? parsed != null && Math.abs(parsed - usualFor(shown, m)) >= 0.005 : shown.overrides[m] != null;
      return { m, amount, isOverride, isCurrent };
    });
  const top = Math.max(1, ...strip.map((s) => s.amount), usual);
  const BAR = 96;

  return (
    <Dialog open={item != null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        hideHeaderRow
        title={shown.name}
        className="gap-5 pt-7 font-clear text-clear-ink"
        footer={
          <ClearDialogFooter
            destructive={
              saved != null ? (
                <button type="button" onClick={() => void send("DELETE")} disabled={busy} className={clearButtonVariants({ variant: "danger" })}>
                  <IconTrash aria-hidden />
                  {t("delete")}
                </button>
              ) : undefined
            }
          >
            <button type="button" onClick={onClose} className={clearButtonVariants({ variant: "secondary" })}>
              {t("cancel")}
            </button>
            <button type="button" onClick={save} disabled={busy || parsed == null} className={clearButtonVariants()}>
              {t("save")}
            </button>
          </ClearDialogFooter>
        }
      >
        <ClearDialogHeader
          icon={<Icon iconKey={shown.icon} color={shown.color} background={shown.background} size="xl" soft />}
          title={shown.name}
          subtitle={<MoneyText>{t("subtitle", { kind: t(`kind.${shown.type}`), amount: formatEur(usual) })}</MoneyText>}
          onClose={onClose}
          closeLabel={t("close")}
        />

        <div className="flex flex-col gap-3">
          <h3 className="m-0 text-[17px] font-extrabold tracking-[-0.01em]">{t("question", { month: label?.name ?? month })}</h3>
          <div role="group" aria-label={t("monthGroup")} className="flex h-14 items-center justify-between gap-3 rounded-full bg-clear-tile px-1.5">
            <button
              type="button"
              onClick={() => switchTo(prev)}
              disabled={!prev}
              aria-label={prev ? t("previous", { month: months[prev]?.long ?? prev }) : t("previousNone")}
              className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-clear-card text-clear-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconChevronLeft size={20} stroke={2} aria-hidden />
            </button>
            <span aria-live="polite" className="flex flex-col items-center gap-px">
              <span className="text-base font-extrabold capitalize">{label?.long ?? month}</span>
              <span className="text-xs font-semibold text-clear-muted">{saved != null ? t("changed") : t("usual")}</span>
            </span>
            <button
              type="button"
              onClick={() => switchTo(next)}
              disabled={!next}
              aria-label={next ? t("next", { month: months[next]?.long ?? next }) : t("nextNone")}
              className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-clear-card text-clear-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconChevronRight size={20} stroke={2} aria-hidden />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="text-[13px] font-bold text-clear-ink-2">
            {t("amountFor", { month: label?.name ?? month })}
          </label>
          <div
            className={cn(
              "flex h-14 items-center gap-2 rounded-clear-row border-[1.5px] bg-clear-card px-4 transition-colors focus-within:border-clear-ember focus-within:ring-4 focus-within:ring-clear-ember/20",
              parsed == null ? "border-clear-negative-fill" : "border-clear-line",
            )}
          >
            <span aria-hidden className="text-xl font-extrabold text-clear-muted">
              {currencySymbol()}
            </span>
            <input
              id={inputId}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
              aria-invalid={parsed == null}
              aria-describedby={`${inputId}-default`}
              className="w-full min-w-0 flex-1 border-none bg-transparent p-0 font-clear text-[22px] font-extrabold tracking-[-0.02em] text-clear-ink tabular-nums outline-none"
            />
            <span id={`${inputId}-default`} className="text-[13px] font-semibold whitespace-nowrap text-clear-muted">
              <MoneyText>{t("default", { amount: formatEur(usual) })}</MoneyText>
            </span>
          </div>
          {parsed == null ? (
            <span role="alert" className="text-[13px] font-semibold text-clear-negative">
              {t("invalid")}
            </span>
          ) : Math.abs(diff) >= 0.005 ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-clear-ink-2">
              {diff > 0 ? <IconArrowUpRight size={14} stroke={2.2} className="text-clear-ember-text" aria-hidden /> : <IconArrowDownRight size={14} stroke={2.2} className="text-clear-positive" aria-hidden />}
              <span><MoneyText>{t.rich(diff > 0 ? "more" : "less", { amount: formatEurWhole(Math.abs(diff)), b: (c) => <b className="font-extrabold text-clear-ink"><MoneyText>{c}</MoneyText></b> })}</MoneyText></span>
            </span>
          ) : null}
          {failed && (
            <span role="alert" className="text-[13px] font-semibold text-clear-negative">
              {t("error")}
            </span>
          )}
        </div>

        {/* The months around this one */}
        <div className="flex flex-col gap-3.5 rounded-clear-tile border border-clear-line px-[18px] pt-4 pb-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-bold">{t("strip")}</span>
            <span aria-hidden className="inline-flex items-center gap-3.5 text-xs font-semibold text-clear-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-[3px] bg-clear-line" />
                {t("legendUsual")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-[3px] bg-clear-ember" />
                {t("legendOverride")}
              </span>
            </span>
          </div>
          <div
            role="img"
            aria-label={t("stripLabel", {
              name: shown.name,
              months: strip.map((s) => `${months[s.m].long}: ${formatEurWhole(s.amount)}${s.isOverride ? ` (${t("overrideTag")})` : ""}`).join(", "),
            })}
            className="grid gap-x-3"
            style={{ gridTemplateColumns: `repeat(${strip.length}, minmax(0, 1fr))` }}
          >
            {strip.map((s) => (
              <span key={`v-${s.m}`} aria-hidden className="flex min-h-12 flex-col items-center justify-end gap-1 pb-1.5">
                {s.isOverride && (
                  <span className="inline-flex h-[22px] items-center rounded-full bg-clear-primary px-2 text-xs font-extrabold text-clear-primary-ink">{t("overrideTag")}</span>
                )}
                <span className={cn("text-[13px] font-extrabold tabular-nums", s.isOverride || s.isCurrent ? "text-clear-ink" : "text-clear-ink-2")}><MoneyText>{formatEurWhole(s.amount)}</MoneyText></span>
              </span>
            ))}
            <span aria-hidden className="relative col-span-full grid gap-x-3" style={{ height: BAR, gridTemplateColumns: `repeat(${strip.length}, minmax(0, 1fr))` }}>
              <span className="pointer-events-none absolute -inset-x-1.5 border-t-[1.5px] border-dashed border-clear-placeholder" style={{ bottom: (usual / top) * BAR }} />
              {strip.map((s) => (
                <span key={`b-${s.m}`} className="flex items-end">
                  <span className={cn("w-full rounded-[10px]", s.isOverride ? "bg-clear-ember" : "bg-clear-line")} style={{ height: Math.max(4, (s.amount / top) * BAR) }} />
                </span>
              ))}
            </span>
            {strip.map((s) => (
              <span key={`l-${s.m}`} aria-hidden className={cn("pt-1.5 text-center text-xs capitalize", s.isCurrent ? "font-extrabold text-clear-ink" : "font-semibold text-clear-muted")}>
                {months[s.m].short}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-clear-tile bg-clear-sky px-4 py-3">
          <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-clear-card text-clear-sky-ink">
            <IconInfoCircle size={17} stroke={2.1} />
          </span>
          <span className="pt-1 text-sm leading-normal font-semibold">{t("info", { month: label?.name ?? month })}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
