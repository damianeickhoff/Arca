"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconChevronLeft } from "@tabler/icons-react";
import { Icon } from "@/components/icon";
import { ListItemRow } from "@/components/list-item-row";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CategorySpendCard } from "@/components/category-spending-row";
import { acquireNavHidden } from "@/lib/nav-visibility";

const springOut = "cubic-bezier(0.32, 0.72, 0, 1)";
const springIn = "cubic-bezier(0.16, 1, 0.3, 1)";

/** Full list of every category with spend this period, including ones hidden from
 * the row itself — opened from the dashboard's "Spending by category" row via its
 * "View all"/"Show more" controls. Sits underneath CategoryDetailPortal (both z-45,
 * this one mounted first) so tapping a row opens the detail portal on top without
 * closing this list behind it; re-including a hidden category is done from there
 * (the 3-dot menu's "Show in spending row"). */
export function CategorySpendingListPortal({
  open,
  rows,
  onClose,
  onSelect,
  title = "Spending by category",
}: {
  open: boolean;
  rows: CategorySpendCard[];
  onClose: () => void;
  onSelect: (categoryId: number) => void;
  title?: string;
}) {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- portal must not render until after mount, to avoid SSR/hydration mismatch
  useEffect(() => { setMounted(true); }, []);
  const isIncome = title === "Income by category";

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Hide the mobile bottom nav while this full-screen portal is open — otherwise
  // it floats above the list since the nav sits at a higher z-index (same
  // treatment as CategoryDetailPortal, which this list opens into).
  useEffect(() => {
    if (!open) return;
    return acquireNavHidden();
  }, [open]);

  return (
    <>
      {mounted &&
        createPortal(
          <>
            <div
              className="fixed inset-x-0 bottom-0 bg-background"
              style={{
                top: 0,
                zIndex: 45,
                opacity: open ? 1 : 0,
                pointerEvents: "none",
                transition: open ? "opacity 480ms cubic-bezier(0.25, 0, 0.15, 1)" : "opacity 320ms ease",
              }}
            />

            <div
              className="fixed inset-x-0 bottom-0 flex flex-col overflow-hidden"
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
              <div className="relative shrink-0 grid grid-cols-[auto_1fr_auto] items-center gap-2 px-4 pb-3" style={{ paddingTop: "calc(0.75rem + var(--sat))" }}>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Back"
                  className="size-11 rounded-full bg-white/12 backdrop-blur-xs flex items-center justify-center active:scale-[0.97] transition-transform"
                >
                  <IconChevronLeft className="size-5" />
                </button>
                <h1 className="text-lg text-foreground text-center truncate">{title}</h1>
                <div className="size-11" />
              </div>

              <div className="relative flex-1 overflow-y-auto overflow-x-hidden" style={{ WebkitOverflowScrolling: "touch" }}>
                <div className="space-y-2 mx-3 mb-[calc(2rem+var(--sab))]">
                  {rows.map((c) => {
                    const over = c.pct != null && c.pct > 1;
                    return (
                      <button
                        key={c.categoryId}
                        type="button"
                        onClick={() => onSelect(c.categoryId)}
                        className="w-full text-left rounded-2xl bg-card overflow-hidden active:bg-foreground/5 transition-colors"
                      >
                        <ListItemRow
                          icon={<Icon iconKey={c.icon} color={c.color} size="lg" round />}
                          name={c.categoryName}
                          subtitle={
                            isIncome
                              ? undefined
                              : c.excluded
                                ? "Hidden from spending row"
                                : c.budget != null
                                  ? over
                                    ? <span className="text-[var(--color-expense)]">{formatEur(c.spent - c.budget)} over</span>
                                    : `of ${formatEur(c.budget)}`
                                  : "No limit"
                          }
                          right={
                            <span
                              className={cn("font-semibold text-base tabular-nums", c.excluded && "text-foreground/40")}
                              style={isIncome ? { color: "var(--color-income)" } : undefined}
                            >
                              {isIncome ? "+" : ""}{formatEur(c.spent)}
                            </span>
                          }
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
