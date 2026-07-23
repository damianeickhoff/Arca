"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft } from "lucide-react";

/** Slide-in subpage for editing a single field inside an edit dialog — used by the
 * debt/savings-goal/recurring-item/account edit dialogs so tapping any row opens the
 * same-looking sheet. Matches DialogContent's own mobile header treatment (bg-card,
 * pt-5/mb-5 spacing, size-11 backdrop-blur button) instead of a bespoke one, so it
 * doesn't read as a visually different dialog nested inside the real one. */
export function SubSheet({
  title,
  visible,
  onClose,
  children,
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Fields that want to be focused as soon as the subpage opens (marked with
  // data-autofocus instead of the native autoFocus attribute) wait until the
  // slide-in transition has finished before focusing. Focusing immediately on
  // mount pops the keyboard mid-transition, which fights the transform and
  // makes the slide-in look janky/instant instead of smooth.
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      const el = contentRef.current?.querySelector<HTMLElement>("[data-autofocus]");
      el?.focus({ preventScroll: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-[#1c1c1e] backdrop-blur-xl rounded-t-2xl overflow-hidden transition-transform duration-300 ease-out"
      style={{ transform: visible ? "translateX(0)" : "translateX(100%)" }}
    >
      <div className="relative flex items-center justify-center shrink-0 px-4 min-h-11 pt-[30px] mb-5">
        <h2 className="font-heading text-lg font-semibold text-foreground truncate px-12">{title}</h2>
        {/* Pinned via an explicit top offset (matching pt-[24px] above) rather than
            flex centering — see the matching comment in dialog.tsx's header row for why. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          className="absolute top-[20px] size-11 left-[21px] rounded-full bg-white/7 backdrop-blur-lg shadow-lg flex items-center justify-center text-foreground transition-colors"
        >
          <ChevronLeft className="size-5" />
        </button>
      </div>
      <div ref={contentRef} className="flex-1 overflow-y-auto px-6 pb-[calc(1.5rem+var(--sab))]">
        {children}
      </div>
    </div>
  );
}
