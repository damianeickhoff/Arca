"use client";

import { useLayoutEffect, useRef } from "react";
import { IconX } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { MoneyText } from "@/components/clear/money";

const px = (value: string) => parseFloat(value) || 0;

/** True when nothing with a size follows `el` inside `scroller` (portals, closed
 *  sheets and tips render elsewhere or nothing at all). */
function nothingRenderedAfter(el: Element, scroller: Element) {
  for (let node: Element | null = el; node && node !== scroller; node = node.parentElement) {
    for (let sib = node.nextElementSibling; sib; sib = sib.nextElementSibling) {
      const r = sib.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return false;
    }
  }
  return true;
}

/**
 * Stretches a sticky header (edge "top") or footer ("bottom") over its scroll
 * container's padding, so content scrolling underneath is covered edge to edge. A
 * sticky `top: 0` pins to the inside of the padding, which leaves a strip between the
 * bar and the dialog's edge where the content shows through; so the bar takes that
 * padding inside itself and sticks at `-padding`, flush with the edge, its content
 * still at the same distance from it. The padding differs per dialog (pt-6, pt-7,
 * p-7 …), hence measured rather than hard-coded. Pulls into the padding only when the
 * bar is the first (header) or last (footer) thing in the box; otherwise it just sticks.
 * Sets `data-pinned` once it has found the scroll box it pins to, and `data-under`
 * while content is scrolled past the bar's edge (what the hairline shows).
 */
function useStickyBleed(edge: "top" | "bottom") {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let box = el.parentElement;
    while (box && box !== document.body && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
    if (!box || box === document.body) return;
    const scroller = box;
    const props = ["top", "bottom", "marginTop", "marginBottom", "marginLeft", "marginRight", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight"] as const;
    // Back to the bar's own layout, so it is measured where it really sits in the flow
    // (an earlier run — React runs effects twice in development — leaves its bleed).
    function reset() {
      for (const p of props) el!.style[p] = "";
      delete el!.dataset.pinned;
      delete el!.dataset.under;
    }
    reset();

    // Decided once, on mount, while nothing has scrolled yet: measured later, a stuck
    // bar reports where it is pinned instead of where it sits in the flow.
    const cs0 = getComputedStyle(scroller);
    const sr = scroller.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const top = er.top - sr.top - scroller.clientTop + scroller.scrollTop;
    // The footer's end is read from the tree, not measured: while the popup opens (or its
    // content is still loading) the content can be shorter than the box, and the box's
    // own height then hides how much really follows the footer.
    const atEdge = edge === "top" ? top <= px(cs0.paddingTop) + 1 : nothingRenderedAfter(el, scroller);
    // A footer nested inside an indented block only bleeds sideways when it lines up
    // with the content edge; otherwise the bleed would push it out of its block.
    const flush = Math.abs(er.left - sr.left - scroller.clientLeft - px(cs0.paddingLeft)) <= 1;
    el.dataset.pinned = "";
    // Content beyond the bar's edge: scrolled past the top, or more left below the bottom.
    function markUnder() {
      const under =
        edge === "top"
          ? scroller.scrollTop > 1
          : scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > 1;
      el!.toggleAttribute("data-under", under);
    }
    function apply() {
      markUnder();
      const cs = getComputedStyle(scroller);
      const pl = px(cs.paddingLeft);
      const pr = px(cs.paddingRight);
      if (edge === "top" || flush) {
        Object.assign(el!.style, { marginLeft: `${-pl}px`, marginRight: `${-pr}px`, paddingLeft: `${pl}px`, paddingRight: `${pr}px` });
      }
      if (!atEdge) return;
      if (edge === "top") {
        const pt = px(cs.paddingTop);
        Object.assign(el!.style, { top: `${-pt}px`, marginTop: `${-pt}px`, paddingTop: `${pt}px` });
      } else {
        const pb = px(cs.paddingBottom);
        Object.assign(el!.style, { bottom: `${-pb}px`, marginBottom: `${-pb}px`, paddingBottom: `${pb}px` });
      }
    }
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(scroller);
    scroller.addEventListener("scroll", markUnder, { passive: true });
    return () => {
      ro.disconnect();
      scroller.removeEventListener("scroll", markUnder);
      reset();
    };
  }, [edge]);
  return ref;
}

/**
 * The visual parts of a Clear dialog, independent of how it opens (centred modal
 * on desktop, bottom sheet on phones — the behaviour stays in components/ui/dialog).
 * Panel: 28px radius, 28px padding, dialog shadow. Header: title + optional
 * subtitle and leading icon tile, round close button. Footer: an optional
 * destructive action on the left, secondary then primary on the right.
 */
export function ClearDialogPanel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex w-full flex-col gap-5 rounded-clear-dialog bg-clear-card p-7 font-clear text-clear-ink shadow-clear-dialog", className)}
      {...props}
    />
  );
}

export function ClearDialogHeader({
  title,
  subtitle,
  icon,
  onClose,
  closeLabel,
  titleId,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  onClose?: () => void;
  /** Already translated, e.g. t("common.close"). Required when onClose is set. */
  closeLabel?: string;
  titleId?: string;
}) {
  const ref = useStickyBleed("top");
  return (
    // Sticky, so the title and the close button stay in view while a long dialog
    // scrolls; the card fill hides what scrolls under it and a hairline marks the edge
    // once something is underneath. The icon is always a 48px tile and the title +
    // one-line subtitle are set to the same 48px, so the two lines sit exactly beside
    // it, top to bottom.
    <div ref={ref} className="group/bar sticky top-0 z-20 flex items-center gap-3.5 bg-clear-card">
      <EdgeLine edge="top" />
      {icon && <span className="flex shrink-0 [&>*]:size-12!">{icon}</span>}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 id={titleId} className="m-0 text-[22px] leading-7 font-extrabold tracking-[-0.02em]">
          {title}
        </h2>
        {subtitle && <p className="m-0 text-sm leading-[18px] text-clear-muted"><MoneyText>{subtitle}</MoneyText></p>}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-clear-ground text-clear-ink transition-colors hover:bg-clear-line"
        >
          <IconX size={20} stroke={2} aria-hidden />
        </button>
      )}
    </div>
  );
}

export function ClearDialogFooter({ destructive, children }: { destructive?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 pt-1">
      {destructive}
      <span className="flex-1" />
      {children}
    </div>
  );
}

/**
 * Holds a popup's footer (the buttons, plus a hint or divider with them) at the bottom
 * of a dialog that scrolls, the way <ClearDialogHeader> holds the title at the top.
 * `className` styles the footer row itself (a divider, its spacing), so that keeps the
 * content width while the pinned bar behind it runs edge to edge. Footers passed
 * through DialogContent's `footer` prop already sit outside the scroll area.
 */
export function ClearDialogFooterDock({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useStickyBleed("bottom");
  return (
    <div ref={ref} className="group/bar data-pinned:sticky data-pinned:bottom-0 data-pinned:z-20 data-pinned:bg-clear-card">
      <EdgeLine edge="bottom" />
      <div className={className}>{children}</div>
    </div>
  );
}

/**
 * The hairline where content scrolls under a pinned header (edge "top": along its
 * bottom) or footer ("bottom": along its top). Hidden at rest; shown while the bar
 * has `data-under` (content past its edge), so a dialog that fits shows no line.
 * The bar bleeds into the dialog's padding, so the line runs edge to edge.
 */
function EdgeLine({ edge }: { edge: "top" | "bottom" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 h-px bg-clear-line opacity-0 transition-opacity duration-200 group-data-under/bar:opacity-100",
        edge === "top" ? "bottom-0" : "top-0",
      )}
    />
  );
}
