"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconCalculatorFilled, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

const springOut = "cubic-bezier(0.32, 0.72, 0, 1)";
const springIn = "cubic-bezier(0.16, 1, 0.3, 1)";

// Icon-only trigger + animated subpage overlay for the extra-payment ("aflossing")
// simulation — same portal/backdrop/slide-up mechanic as the goals page's forecast
// overlay (src/app/goals/prognose-portal.tsx), scoped to the debts page instead. Moves
// the simulation out of an always-visible inline card and behind an on-demand button.
export function DebtSimulationPortal({ content, triggerClassName }: { content: React.ReactNode; triggerClassName?: string }) {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- portal must not render until after mount, to avoid SSR/hydration mismatch
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  function openPortal() {
    setEverOpened(true);
    setOpen(true);
  }
  function closePortal() {
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={openPortal}
        aria-label="Extra payment simulation"
        className={cn("rounded-full bg-white dark:bg-white/7 flex items-center justify-center active:scale-[0.97] transition-transform", triggerClassName)}
      >
        <IconCalculatorFilled className="size-5" />
      </button>

      {mounted &&
        createPortal(
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-x-0 bottom-0 bg-background"
              style={{
                top: 0,
                zIndex: 70,
                opacity: open ? 1 : 0,
                pointerEvents: "none",
                transition: open ? "opacity 480ms cubic-bezier(0.25, 0, 0.15, 1)" : "opacity 320ms ease",
              }}
            />

            {/* Content */}
            <div
              className="fixed inset-x-0 bottom-0 flex flex-col"
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
              <div className="shrink-0 flex items-center justify-end px-4" style={{ paddingTop: "calc(0.75rem + var(--sat))" }}>
                <button
                  type="button"
                  onClick={closePortal}
                  aria-label="Close"
                  className="size-11 rounded-full bg-white dark:bg-white/7 flex items-center justify-center active:scale-[0.97] transition-transform"
                >
                  <IconX className="size-5" />
                </button>
              </div>
              <div
                className="flex-1 relative overflow-y-auto overflow-x-hidden px-4"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                {everOpened && content}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
