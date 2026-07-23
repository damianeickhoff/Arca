"use client";

import { useState } from "react";
import { IconCalendarFilled } from "@tabler/icons-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { MarkPaidButton } from "@/app/mark-paid-button";

export type CalendarBill = {
  id: number;
  name: string;
  amount: number | null;
  icon: string | null;
  iconColor: string | null;
  iconBackground: string | null;
  dueDate: string | null; // YYYY-MM-DD
  paid: boolean | null;
  paidSource: "match" | "manual" | null;
  overdue: boolean;
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Financial-month-aware calendar grid: spans from `from` to `to` (may straddle a
// calendar-month boundary when the financial month doesn't start on the 1st), padded
// to full Mon–Sun weeks at both ends.
export function BillsCalendar({
  from,
  to,
  bills,
  month,
  title = "Bills this month",
  showPaidCount = true,
  // "status" = colored due-dots (budget page). "icons" = per-item icon, or the day's
  // total amount when several fall on one day (upcoming page).
  dayMode = "status",
}: {
  from: string;
  to: string;
  bills: CalendarBill[];
  month: string;
  title?: string;
  showPaidCount?: boolean;
  dayMode?: "status" | "icons";
}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const dated = bills.filter((b) => b.dueDate != null);
  const dateless = bills.filter((b) => b.dueDate == null);
  const byDate = new Map<string, CalendarBill[]>();
  for (const b of dated) {
    const list = byDate.get(b.dueDate!) ?? [];
    list.push(b);
    byDate.set(b.dueDate!, list);
  }

  const [fromY, fromM, fromD] = from.split("-").map(Number);
  const [toY, toM, toD] = to.split("-").map(Number);
  const gridStart = new Date(fromY, fromM - 1, fromD);
  // Mon=0..Sun=6
  gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7));
  const gridEnd = new Date(toY, toM - 1, toD);
  gridEnd.setDate(gridEnd.getDate() + (7 - ((gridEnd.getDay() + 6) % 7) - 1));

  const days: { date: string; inRange: boolean; monthLabel: string | null }[] = [];
  const cursor = new Date(gridStart);
  let lastMonth = -1;
  while (cursor <= gridEnd) {
    const date = toDateStr(cursor);
    const inRange = date >= from && date <= to;
    const showMonthLabel = inRange && cursor.getMonth() !== lastMonth && cursor.getDate() <= 7;
    if (inRange) lastMonth = cursor.getMonth();
    days.push({
      date,
      inRange,
      monthLabel: showMonthLabel ? cursor.toLocaleDateString("en-GB", { month: "short" }) : null,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  const todayStr = toDateStr(new Date());
  const paidCount = dated.filter((b) => b.paid).length;
  const selectedBills = selectedDay ? (byDate.get(selectedDay) ?? []) : [];

  return (
    <div className="rounded-lg bg-card p-5 ml-4 mr-4">
      <div className="flex items-center justify-center mb-5">
        <h2 className="font-semibold text-xl">{title}</h2>
        {showPaidCount && dated.length > 0 && (
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {paidCount}/{dated.length} paid
          </span>
        )}
      </div>

      {dated.length === 0 && dateless.length === 0 ? (
        <EmptyState icon={IconCalendarFilled} title="No fixed costs configured." />
      ) : (
        <>
          {dated.length > 0 && (
            <div className="space-y-1">
              <div className="grid grid-cols-7 gap-5 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                {WEEKDAY_LABELS.map((w) => <span key={w}>{w}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-5">
                {days.map(({ date, inRange, monthLabel }) => {
                  const dayBills = byDate.get(date) ?? [];
                  const hasBills = dayBills.length > 0;
                  const allPaid = hasBills && dayBills.every((b) => b.paid);
                  const anyOverdue = dayBills.some((b) => b.overdue);
                  const isToday = date === todayStr;
                  const dayNum = Number(date.slice(8, 10));
                  return (
                    <button
                      key={date}
                      type="button"
                      disabled={!inRange || !hasBills}
                      onClick={() => setSelectedDay(date)}
                      className={cn(
                        "relative rounded-lg flex flex-col items-center text-sm tabular-nums transition-colors",
                        dayMode === "icons" ? "justify-start gap-1 py-1" : "aspect-square justify-center",
                        !inRange ? "text-muted-foreground/20" : "text-foreground",
                        hasBills && inRange ? "hover:bg-foreground/5 cursor-pointer" : "cursor-default",
                        isToday && inRange ? "ring-1 ring-primary" : "",
                      )}
                    >
                      {monthLabel && (
                        <span className="absolute -left-1 top-0 text-xs text-muted-foreground/60">{monthLabel}</span>
                      )}
                      <span className="leading-none">{dayNum}</span>
                      {hasBills && inRange && (
                        dayMode === "icons" ? (
                          dayBills.length === 1 ? (
                            <Icon iconKey={dayBills[0].icon} size="xs" color={dayBills[0].iconColor} background={dayBills[0].iconBackground} />
                          ) : (
                            <span className="flex items-center justify-center size-5 rounded-full bg-primary text-[10px] font-semibold leading-none text-white tabular-nums">
                              {dayBills.length}
                            </span>
                          )
                        ) : (
                          <span
                            className={cn(
                              "size-1.5 rounded-full mt-0.5",
                              allPaid ? "bg-emerald-500" : anyOverdue ? "bg-red-500" : "bg-muted-foreground/50",
                            )}
                          />
                        )
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {dateless.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border/50">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">No fixed date</p>
              <div className="space-y-1.5">
                {dateless.map((b) => (
                  <div key={b.id} className="flex items-center gap-2.5 py-1">
                    <Icon iconKey={b.icon} size="sm" color={b.iconColor} background={b.iconBackground} />
                    <span className="flex-1 text-sm truncate">{b.name}</span>
                    {b.amount != null && <span className="text-sm tabular-nums text-muted-foreground">{formatEur(b.amount)}</span>}
                    {b.paidSource === "match" ? (
                      <span className="text-[11px] font-semibold text-emerald-600">Paid</span>
                    ) : (
                      <MarkPaidButton recurringItemId={b.id} month={month} paid={b.paid === true} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={selectedDay != null} onOpenChange={(v) => !v && setSelectedDay(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedDay ? new Date(selectedDay + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            {selectedBills.map((b) => (
              <div key={b.id} className="flex items-center gap-2.5 py-2 border-b border-border/50 last:border-0">
                <Icon iconKey={b.icon} size="sm" color={b.iconColor} background={b.iconBackground} />
                <span className="flex-1 text-sm truncate">{b.name}</span>
                {b.amount != null && <span className="text-sm tabular-nums text-muted-foreground">{formatEur(b.amount)}</span>}
                {b.paidSource === "match" ? (
                  <span className="text-[11px] font-semibold text-emerald-600">Paid</span>
                ) : (
                  <MarkPaidButton recurringItemId={b.id} month={month} paid={b.paid === true} />
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
