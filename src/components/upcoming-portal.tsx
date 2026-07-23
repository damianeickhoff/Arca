"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconChevronLeft } from "@tabler/icons-react";
import { useTransactionsPortal } from "@/lib/transactions-portal-state";
import { acquireNavHidden } from "@/lib/nav-visibility";
import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";
import { BillsCalendar, type CalendarBill } from "@/app/budget/bills-calendar";

// Dashboard-only entry point for the upcoming-bills view — same slide-up shell as
// the Budget/Reports portals, so it opens with the same animation instead of the
// default page-navigation fade. The standalone
// /transactions/upcoming route is untouched for its other entry point
// (src/app/transactions/mobile.tsx).
export function UpcomingPortal({
  bills,
  from,
  to,
  month,
}: {
  bills: CalendarBill[];
  from: string;
  to: string;
  month: string;
}) {
  const { upcomingOpen: open, upcomingEverOpened: everOpened, closeUpcoming: close } = useTransactionsPortal();
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- portal must not render until after mount, to avoid SSR/hydration mismatch
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return acquireNavHidden();
  }, [open]);

  const springOut = "cubic-bezier(0.32, 0.72, 0, 1)";
  const springIn = "cubic-bezier(0.16, 1, 0.3, 1)";

  if (!mounted || !everOpened) return null;

  const byDate = new Map<string, CalendarBill[]>();
  for (const b of [...bills].sort((a, z) => (a.dueDate! < z.dueDate! ? -1 : 1))) {
    const list = byDate.get(b.dueDate!) ?? [];
    list.push(b);
    byDate.set(b.dueDate!, list);
  }
  const total = bills.reduce((sum, b) => sum + (b.amount ?? 0), 0);
  const fmtDay = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long" });

  return createPortal(
    <>
      <div
        className="fixed inset-x-0 bottom-0 bg-background"
        style={{
          top: 0,
          zIndex: 45,
          opacity: open ? 1 : 0,
          pointerEvents: "none",
          transition: open
            ? "opacity 480ms cubic-bezier(0.25, 0, 0.15, 1)"
            : "opacity 320ms ease",
        }}
      />
      <div
        className="fixed inset-x-0 bottom-0 flex flex-col"
        style={{
          top: 0,
          zIndex: 45,
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0)" : "translateY(24px)",
          transition: open
            ? `opacity 400ms ease 180ms, transform 500ms ${springIn} 160ms`
            : `opacity 220ms ease, transform 260ms ${springOut}`,
          pointerEvents: open ? "auto" : "none",
        }}
      >
        <div className="shrink-0 grid grid-cols-[auto_1fr_auto] items-center px-4 pb-3" style={{ paddingTop: "calc(0.75rem + var(--sat))" }}>
          <button
            type="button"
            onClick={close}
            aria-label="Back"
            className="size-11 rounded-full bg-white dark:bg-white/7 backdrop-blur-xs flex items-center justify-center active:scale-[0.97] transition-transform"
          >
            <IconChevronLeft className="size-5" />
          </button>
          <h1 className="text-lg text-foreground text-center truncate">Upcoming</h1>
          <div className="size-11" />
        </div>

        <div
          className="flex-1 relative overflow-y-auto overflow-x-hidden"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="pb-24 pt-2 space-y-4">
            <BillsCalendar
              from={from}
              to={to}
              bills={bills}
              month={month}
              title="Upcoming this month"
              showPaidCount={false}
              dayMode="icons"
            />

            {bills.length === 0 ? (
              <div className="mx-4 rounded-2xl bg-card py-16 text-center text-muted-foreground text-sm">
                No upcoming transactions this month
              </div>
            ) : (
              <div className="space-y-4 px-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-foreground px-2">Upcoming transactions</h2>
                  <span className="text-sm text-muted-foreground tabular-nums px-2">{formatEur(total)}</span>
                </div>
                <div className="space-y-4">
                  {[...byDate.entries()].map(([date, items]) => (
                    <div key={date} className="rounded-lg bg-card p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-muted-foreground">{fmtDay(date)}</span>
                        {items.length > 1 && (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {formatEur(items.reduce((s, b) => s + (b.amount ?? 0), 0))}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2.5">
                        {items.map((b) => (
                          <div key={b.id} className="flex items-center gap-3">
                            <Icon iconKey={b.icon} size="md" color={b.iconColor} background={b.iconBackground} />
                            <span className="flex-1 text-sm font-medium truncate">{b.name}</span>
                            {b.amount != null && (
                              <span className="text-sm tabular-nums text-foreground">{formatEur(b.amount)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
