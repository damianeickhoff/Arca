"use client";

import { useEffect, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { IconQuestionMark } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

/**
 * A small round "?" next to a field label that shows an explanation when tapped or
 * clicked — a popover anchored to the button on every screen size, so it also works by
 * tap on phones. Escape or a tap elsewhere closes it. `label` (the button's accessible
 * name) and `children` (the explanation) come already translated.
 */
export function InfoHint({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);

  // Inside a dialog Escape would also close the dialog (its listener runs on the
  // document in the capture phase), so catch it on the window first and close only
  // the hint.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  return (
    <Popover.Root open={open} onOpenChange={(next) => setOpen(next)}>
      <Popover.Trigger
        render={
          <button
            type="button"
            aria-label={label}
            className={cn(
              "inline-flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-clear-tile text-clear-ink-2 outline-none transition-colors hover:bg-clear-line hover:text-clear-ink focus-visible:ring-2 focus-visible:ring-clear-ink aria-expanded:bg-clear-ink aria-expanded:text-clear-card",
              // A 32px tap target around the 18px dot.
              "relative after:absolute after:-inset-[7px] after:content-['']",
              className,
            )}
          />
        }
      >
        <IconQuestionMark aria-hidden size={12} stroke={2.8} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={8} collisionPadding={16} className="isolate z-[200] outline-none">
          <Popover.Popup
            initialFocus={false}
            // A sheet treats a press on a body-portalled element as "outside"; this
            // keeps it open (see keepOpenOnOutside in ui/dialog.tsx).
            data-dialog-keep-open=""
            className="max-w-[min(300px,calc(100vw-32px))] origin-(--transform-origin) rounded-clear-tile bg-clear-card px-4 py-3 font-clear text-[13px] leading-[1.5] font-medium text-clear-ink-2 shadow-clear-dialog outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
