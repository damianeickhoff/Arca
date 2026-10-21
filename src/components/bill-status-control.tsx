"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconCheck, IconCircleCheck, IconClock, IconWand } from "@tabler/icons-react";
import type { RecurringItem } from "@/db/schema";
import { ResponsivePopover } from "@/components/clear/responsive-popover";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { RecurringClient } from "@/components/settings/recurring/recurring-client";
import type { BillControl } from "@/lib/bill-groups";
import { cn } from "@/lib/utils";

const PILL = "h-7 px-3 text-xs";

/**
 * The status on the right of a bill row, on Plan › Budget and Activity › Upcoming:
 * "auto" (Arca ticks it off from its match pattern), the black Paid pill (due or
 * overdue and no payment matched), "Paid?" for a bill Arca can't check (no pattern)
 * with Yes, paid · Not yet · Teach Arca the pattern, or a mint Paid pill for a bill
 * marked paid by hand, which takes the mark off again.
 *
 * A mark is stored per financial month (bill_payments), like the old tick button.
 */
export function BillStatusControl({
  state,
  recurringItemId,
  month,
  item,
  income = false,
  onIncomeRow = false,
  tipAnchor = false,
}: {
  state: BillControl;
  recurringItemId: number;
  /** The financial month (YYYY-MM) the mark is for. */
  month: string;
  /** The item itself, for "Teach Arca the pattern" (only needed for "ask"). */
  item?: RecurringItem | null;
  /** Money coming in: "Received" instead of "Paid". */
  income?: boolean;
  /** Sits on a mint income row: the auto chip turns white. */
  onIncomeRow?: boolean;
  /** Carries the billStatusControl tip's anchor. */
  tipAnchor?: boolean;
}) {
  const t = useTranslations("billStatus");
  const router = useRouter();
  // A mark in flight: shown (and the control disabled) until the refreshed page brings
  // a different state, so there is no flash back to the old one in between.
  const [optimistic, setOptimistic] = useState<{ from: BillControl; to: BillControl } | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [teachOpen, setTeachOpen] = useState(false);
  const waiting = optimistic != null && optimistic.from === state;
  const shown = waiting ? optimistic.to : state;
  const pending = waiting;
  const anchor = tipAnchor ? { "data-tip-anchor": "billStatusControl" } : {};

  async function mark(paid: boolean) {
    setOptimistic({ from: state, to: paid ? "paid" : state });
    const res = await fetch("/api/recurring/payments", {
      method: paid ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recurringItemId, month }),
    }).catch(() => null);
    if (!res?.ok) setOptimistic(null);
    router.refresh();
  }

  if (shown === "auto") {
    return (
      <span
        {...anchor}
        title={income ? t("autoIncomeHint") : t("autoHint")}
        className={cn(
          "inline-flex h-7 shrink-0 items-center rounded-full px-3 font-clear text-xs font-extrabold",
          onIncomeRow ? "bg-clear-card text-clear-mint-ink" : "bg-clear-stone text-clear-stone-ink",
        )}
      >
        {t("auto")}
      </span>
    );
  }

  if (shown === "paid") {
    return (
      <button
        {...anchor}
        type="button"
        disabled={pending}
        onClick={() => mark(false)}
        aria-label={income ? t("undoReceived") : t("undoPaid")}
        title={income ? t("undoReceived") : t("undoPaid")}
        className={cn(clearButtonVariants({ size: "sm" }), PILL, "bg-clear-mint text-clear-mint-ink hover:opacity-80")}
      >
        <IconCheck stroke={3} className="size-3.5" aria-hidden />
        {income ? t("received") : t("paid")}
      </button>
    );
  }

  if (shown === "pay") {
    return (
      <button
        {...anchor}
        type="button"
        disabled={pending}
        onClick={() => mark(true)}
        aria-label={income ? t("markReceived") : t("markPaid")}
        className={cn(clearButtonVariants({ size: "sm" }), PILL)}
      >
        {income ? t("received") : t("paid")}
      </button>
    );
  }

  // "ask": Arca has no pattern for this bill, so the user says whether it is paid.
  const option =
    "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-clear-row px-3 text-left text-[15px] font-bold text-clear-ink transition-colors hover:bg-clear-tile disabled:opacity-45";
  return (
    <>
      <ResponsivePopover
        open={askOpen}
        onOpenChange={setAskOpen}
        title={income ? t("askIncomeTitle") : t("askTitle")}
        className="w-64"
        trigger={
          <button
            {...anchor}
            type="button"
            disabled={pending}
            aria-haspopup="dialog"
            className={cn(clearButtonVariants({ variant: "secondary", size: "sm" }), PILL, onIncomeRow && "bg-clear-card")}
          >
            {income ? t("askReceived") : t("ask")}
          </button>
        }
      >
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            className={option}
            onClick={() => {
              setAskOpen(false);
              void mark(true);
            }}
          >
            <IconCircleCheck size={20} stroke={2} aria-hidden className="text-clear-positive" />
            {income ? t("yesReceived") : t("yesPaid")}
          </button>
          <button type="button" className={option} onClick={() => setAskOpen(false)}>
            <IconClock size={20} stroke={2} aria-hidden className="text-clear-muted" />
            {t("notYet")}
          </button>
          {item && (
            <button
              type="button"
              className={option}
              onClick={() => {
                setAskOpen(false);
                setTeachOpen(true);
              }}
            >
              <IconWand size={20} stroke={2} aria-hidden className="text-clear-ember-text" />
              <span className="flex min-w-0 flex-col">
                {t("teach")}
                <span className="text-[13px] font-semibold text-clear-muted">{t("teachHint")}</span>
              </span>
            </button>
          )}
        </div>
      </ResponsivePopover>
      {item && teachOpen && (
        <RecurringClient action="edit" item={item} open focusField="matchPattern" onOpenChange={(v) => setTeachOpen(v)} />
      )}
    </>
  );
}
