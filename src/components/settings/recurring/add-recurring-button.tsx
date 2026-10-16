"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RecurringClient } from "@/components/settings/recurring/recurring-client";

/**
 * A button that opens the recurring form (add mode) right where you are — Upcoming's
 * "Add a bill", Forecast's empty states, Home's Get started — instead of navigating
 * away. `type` preselects bill / subscription / income …; the page refreshes on close.
 */
export function AddRecurringButton({
  type,
  className,
  ariaLabel,
  children,
}: {
  type?: string;
  className?: string;
  /** Already translated; for icon-only buttons. */
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={ariaLabel} className={className}>
        {children}
      </button>
      {open && (
        <RecurringClient
          action="add"
          open
          prefill={type ? { type } : undefined}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) router.refresh();
          }}
        />
      )}
    </>
  );
}
