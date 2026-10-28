"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { useGuide } from "@/lib/guide-context";
import { TOURS, type TipId, type TourId } from "@/lib/guide";
import { claimGuideSlot, overlayOpen, releaseGuideSlot, SHOW_DELAY_MS, useTipPending } from "@/lib/tips";
import { useIsDesktop } from "@/lib/use-is-desktop";
import type { TipAnchor } from "@/lib/tip-placement";
import { cn } from "@/lib/utils";

// The first-run guide (AGENTS.md, the "Tips, tours and sync" boards). The page dims and
// one element at a time is lifted out with a light ring, with a card that says what it
// is: "Home · 1 of 4", step dots, a title, one or two sentences, Skip tour, Back and
// Next (Done on the last step). Desktop: the card sits beside the element with a small
// pointer. Phone: the card sits at the bottom, just above the tab bar. Esc skips, the
// arrow keys move, focus stays in the card.
//
//   • <PageTour id> — a page's tour (lib/guide.ts TOURS), the first time the page is
//     opened with something to show; switched off with Page tours in Settings › Help.
//   • <FormTour id> — the same walk through the controls of a form in a dialog (new debt,
//     new saving); it is a tip, so the Tips switch turns it off, and its help button
//     replays it.

const CARD_WIDTH = 340;
/** Between the element and the card beside it (room for the pointer). */
const SIDE_GAP = 22;
/** Minimum distance from the card to the edge of the window. */
const EDGE = 16;
const POINTER = 16;
/** The pointer's centre sits this far below the card's top edge. */
const POINTER_Y = 42;

interface Step {
  anchor: TipAnchor | readonly TipAnchor[];
  title: string;
  body: string;
}

/** The first element carrying one of the anchors that is actually laid out (phone and
 *  desktop variants of one control can both be in the page, one display:none). */
function findLaidOut(anchor: TipAnchor | readonly TipAnchor[]): Element | null {
  const names = typeof anchor === "string" ? [anchor] : anchor;
  for (const name of names) {
    for (const el of document.querySelectorAll(`[data-tip-anchor="${name}"]`)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

/** The element that scrolls the page around `el` (the window, mostly). */
function scrollerOf(el: Element): Element {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return document.scrollingElement ?? document.documentElement;
}

/** Fixed chrome (the tab bar's + button) never needs scrolling to. Sticky things do:
 *  they move with the page until they stick (Activity's detail panel). */
function isPinned(el: Element) {
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (getComputedStyle(node).position === "fixed") return true;
  }
  return false;
}

interface Layout {
  hole: { top: number; left: number; width: number; height: number; radius: string };
  /** Desktop only; on a phone the card is pinned above the tab bar by CSS. */
  card?: { left: number; top: number };
  /** Phone: lifts the card above an element pinned where it would sit (Activity's
   *  search bar, docked above the tab bar). */
  phoneBottom?: number;
  pointer?: { side: "left" | "right" | "top" | "bottom"; offset: number };
}

function sameLayout(a: Layout | null, b: Layout | null) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function measure(el: Element, desktop: boolean, cardHeight: number, phoneBottom: number): Layout {
  const r = el.getBoundingClientRect();
  // The ring follows the element's own corners; a square wrapper gets the row radius.
  const radius = getComputedStyle(el).borderRadius;
  const hole = { top: r.top, left: r.left, width: r.width, height: r.height, radius: !radius || radius === "0px" ? "14px" : radius };
  if (!desktop) {
    const vh = window.innerHeight;
    const overlaps = r.bottom > vh - phoneBottom - cardHeight && r.top < vh - phoneBottom;
    return overlaps && r.top > vh / 2 && isPinned(el) ? { hole, phoneBottom: vh - r.top + 18 } : { hole };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampY = (top: number) => Math.min(Math.max(top, EDGE), Math.max(EDGE, vh - EDGE - cardHeight));

  // Beside it, right first (reading order), else left: the pointer meets the element
  // near its top, where its title is.
  const roomRight = vw - r.right - SIDE_GAP - EDGE;
  const roomLeft = r.left - SIDE_GAP - EDGE;
  if (roomRight >= CARD_WIDTH || roomLeft >= CARD_WIDTH) {
    const right = roomRight >= CARD_WIDTH;
    const anchorY = Math.min(Math.max(r.top + Math.min(r.height / 2, 58), EDGE + 24), vh - EDGE - 24);
    const top = clampY(anchorY - POINTER_Y);
    return {
      hole,
      card: { left: right ? r.right + SIDE_GAP : r.left - SIDE_GAP - CARD_WIDTH, top },
      pointer: { side: right ? "left" : "right", offset: Math.min(Math.max(anchorY - top - POINTER / 2, 16), cardHeight - 32) },
    };
  }

  // A wide element: below it, else above it, else over its lower edge without a pointer.
  const left = Math.min(Math.max(r.left + r.width / 2 - CARD_WIDTH / 2, EDGE), vw - EDGE - CARD_WIDTH);
  const offset = Math.min(Math.max(r.left + r.width / 2 - left - POINTER / 2, 24), CARD_WIDTH - 40);
  if (vh - r.bottom - SIDE_GAP - EDGE >= cardHeight) return { hole, card: { left, top: r.bottom + SIDE_GAP }, pointer: { side: "top", offset } };
  if (r.top - SIDE_GAP - EDGE >= cardHeight) return { hole, card: { left, top: r.top - SIDE_GAP - cardHeight }, pointer: { side: "bottom", offset } };
  return { hole, card: { left, top: vh - EDGE - cardHeight } };
}

/** The dim, the ring and the card for one running tour. */
function TourOverlay({
  name,
  steps,
  dialogLabel,
  trapFocus,
  onClose,
}: {
  /** "Home", shown as "Home · 1 of 4". */
  name: string;
  steps: readonly Step[];
  dialogLabel: (n: number, total: number) => string;
  /** Page tours own the keyboard focus; a form tour leaves it with its dialog. */
  trapFocus: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("tours");
  const desktop = useIsDesktop();
  const [index, setIndex] = useState(0);
  const [layout, setLayout] = useState<Layout | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const elRef = useRef<Element | null>(null);
  /** Where the phone card sits on its own (above the tab bar), measured off the card. */
  const phoneBottomRef = useRef(96);

  const step = steps[index];
  const placed = layout != null;
  const isLast = index === steps.length - 1;
  const next = useCallback(() => (isLast ? onClose() : setIndex((i) => i + 1)), [isLast, onClose]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Follow the element every frame while the tour is up: smooth scrolling, a resize or a
  // re-render all move it. A few seconds in a user's life, so the cost doesn't matter.
  // (elRef already points at this step's element: the scroll below sets it first.)
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      let el = elRef.current;
      if (!el || !el.isConnected) el = elRef.current = findLaidOut(step.anchor);
      const card = cardRef.current;
      if (card && !desktop && card.style.bottom === "") phoneBottomRef.current = window.innerHeight - card.getBoundingClientRect().bottom;
      if (el) {
        const next = measure(el, desktop, card?.offsetHeight ?? 220, phoneBottomRef.current);
        setLayout((prev) => (sameLayout(prev, next) ? prev : next));
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [step.anchor, desktop]);

  // Bring the element into view, clear of the card: centred on a desktop, between the
  // top of the screen and the card on a phone. A layout effect runs before the tracking
  // effect above, so this is where the step's element is looked up.
  useLayoutEffect(() => {
    const el = findLaidOut(step.anchor);
    elRef.current = el;
    if (!el || isPinned(el)) return;
    const r = el.getBoundingClientRect();
    const areaTop = EDGE + 8;
    const areaBottom = desktop ? window.innerHeight - EDGE : (cardRef.current?.getBoundingClientRect().top ?? window.innerHeight * 0.55) - EDGE;
    if (r.top >= areaTop && r.bottom <= areaBottom) return;
    const room = areaBottom - areaTop;
    const target = r.height >= room ? areaTop : areaTop + (room - r.height) / 2;
    // An instant jump: a smooth scroll can stall (a webview that isn't drawing, a
    // browser setting), and then the card points at something off screen.
    scrollerOf(el).scrollBy({ top: r.top - target });
  }, [index, step.anchor, desktop, placed]);

  // Focus moves to the card's main button on every step, and back where it was after.
  useEffect(() => {
    if (!trapFocus) return;
    const before = document.activeElement as HTMLElement | null;
    return () => before?.focus?.({ preventScroll: true });
  }, [trapFocus]);
  useEffect(() => {
    if (trapFocus && placed) primaryRef.current?.focus({ preventScroll: true });
  }, [trapFocus, index, placed]);

  // Esc skips, the arrows move. Caught before anything on the page (Activity's own arrow
  // keys, a dialog's Esc) sees them.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
      else if (e.key === "Tab" && trapFocus && cardRef.current) {
        const focusable = [...cardRef.current.querySelectorAll<HTMLElement>("button")];
        const at = focusable.indexOf(document.activeElement as HTMLElement);
        const to = e.shiftKey ? (at <= 0 ? focusable.length - 1 : at - 1) : (at + 1) % focusable.length;
        focusable[to]?.focus();
      } else return;
      e.preventDefault();
      e.stopPropagation();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [next, back, onClose, trapFocus]);

  const titleId = "page-tour-title";

  const card = layout?.card;

  return (
    <div
      className={cn("pointer-events-auto fixed inset-0 z-[90] font-clear transition-opacity duration-200 motion-reduce:transition-none", layout ? "opacity-100" : "opacity-0")}
      // A form tour runs over its dialog: taps on the card must not read as a tap outside
      // the dialog (keepOpenOnOutside in components/ui/dialog.tsx).
      data-dialog-keep-open=""
    >
      {/* Catches taps on the dimmed page: only the card answers while the tour is up. */}
      <div aria-hidden className="absolute inset-0" />
      {layout && (
        <div
          aria-hidden
          // Sits exactly on the element every frame, no transition: a gliding ring trails
          // behind while the page scrolls to the next step.
          className="clear-tour-spotlight pointer-events-none fixed"
          style={{ top: layout.hole.top, left: layout.hole.left, width: layout.hole.width, height: layout.hole.height, borderRadius: layout.hole.radius }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal={trapFocus || undefined}
        aria-label={dialogLabel(index + 1, steps.length)}
        aria-describedby={titleId}
        data-guide=""
        className={cn(
          "fixed flex flex-col gap-2.5 rounded-clear-card bg-clear-card p-5 text-clear-ink shadow-clear-dialog",
          desktop ? "w-[340px]" : "inset-x-4 bottom-[var(--bottom-bar-offset)]",
        )}
        style={desktop ? (card ? { left: card.left, top: card.top } : { visibility: "hidden" }) : layout?.phoneBottom != null ? { bottom: layout.phoneBottom } : undefined}
      >
        {layout?.pointer && (
          <span
            aria-hidden
            className="absolute size-4 rotate-45 rounded-[3px] bg-clear-card"
            style={
              layout.pointer.side === "left" ? { left: -POINTER / 2, top: layout.pointer.offset }
              : layout.pointer.side === "right" ? { right: -POINTER / 2, top: layout.pointer.offset }
              : layout.pointer.side === "top" ? { top: -POINTER / 2, left: layout.pointer.offset }
              : { bottom: -POINTER / 2, left: layout.pointer.offset }
            }
          />
        )}
        <div className="relative flex items-center justify-between gap-3">
          <span className="text-[13px] font-bold text-clear-ink-2">{t("progress", { page: name, n: index + 1, total: steps.length })}</span>
          <span aria-hidden className="inline-flex gap-1">
            {steps.map((_, i) => (
              <span key={i} className={cn("block h-1.5 rounded-full transition-[width] motion-reduce:transition-none", i === index ? "w-[18px] bg-clear-ink" : "w-1.5 bg-clear-tour-dot")} />
            ))}
          </span>
        </div>
        <h2 id={titleId} className="relative m-0 text-lg font-extrabold tracking-[-0.01em]">{step.title}</h2>
        <p className="relative m-0 text-[15px] leading-normal text-clear-ink-2">{step.body}</p>
        <div className="relative flex items-center justify-between gap-2.5 pt-1.5">
          <button type="button" onClick={onClose} className="h-10 cursor-pointer px-1 text-sm font-bold text-clear-ink-2 hover:text-clear-ink">
            {t("skip")}
          </button>
          <span className="inline-flex gap-2">
            {index > 0 && (
              <button type="button" onClick={back} className={clearButtonVariants({ variant: "secondary" })}>
                {t("back")}
              </button>
            )}
            <button ref={primaryRef} type="button" onClick={next} className={clearButtonVariants({ variant: "primary" })}>
              {isLast ? t("done") : t("next")}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

function useMounted() {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the body portal can't render until after mount, or SSR and hydration disagree
  useEffect(() => { setMounted(true); }, []);
  return mounted;
}

/**
 * A page's tour. `ready` is "the page has something to show": an empty page keeps its
 * empty state and the tour waits for the first visit with content (Debts right after
 * the first debt). It starts once nothing modal is open and no tip holds the screen,
 * and counts as seen the moment it starts. Replay in Settings › Help starts it again.
 */
export function PageTour({ id, ready = true }: { id: TourId; ready?: boolean }) {
  const t = useTranslations("tours");
  const { state, update, replay, clearReplay, blocked } = useGuide();
  const mounted = useMounted();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const replaying = replay === id;
  const due = state != null && (replaying || (state.toursOn && !state.toursSeen.includes(id)));
  const slot = `tour:${id}`;

  useEffect(() => {
    if (!ready || !due || blocked || steps) return;
    // Keeps trying while the page settles: a dialog may be open, a tip may be up, the
    // elements may still be streaming in.
    const timer = setInterval(() => {
      if (overlayOpen()) return;
      const found = TOURS[id].steps.filter((s) => findLaidOut(s.anchor) != null);
      if (found.length === 0 || !claimGuideSlot(slot)) return;
      clearInterval(timer);
      if (replaying) clearReplay();
      update({ kind: "tourSeen", id });
      setSteps(found.map((s) => ({ anchor: s.anchor, title: t(`${id}.steps.${s.key}.title`), body: t(`${id}.steps.${s.key}.body`) })));
    }, SHOW_DELAY_MS);
    return () => clearInterval(timer);
  }, [id, slot, ready, due, blocked, steps, replaying, clearReplay, update, t]);

  // Leaving the page mid-tour frees the screen for the next one.
  useEffect(() => () => releaseGuideSlot(slot), [slot]);

  const close = useCallback(() => {
    setSteps(null);
    releaseGuideSlot(slot);
  }, [slot]);

  if (!mounted) return null;
  return createPortal(
    steps && (
      <TourOverlay
        key={id}
        name={t(`${id}.page`)}
        steps={steps}
        dialogLabel={(n, total) => t("dialogLabel", { page: t(`${id}.page`), n, total })}
        trapFocus
        onClose={close}
      />
    ),
    document.body,
  );
}

/**
 * The walk through a form's controls (the new-debt and new-saving dialogs, whose icon
 * buttons say little on their own). A tip: it runs once, while `active`, unless Tips are
 * off; bump `replayToken` from the form's help button to run it again. Copy at
 * `tips.<id>.title` and `tips.<id>.steps.<anchor>`. Controls not on screen are left out.
 */
export function FormTour({
  id,
  steps,
  active = true,
  replayToken = 0,
}: {
  id: TipId;
  /** In the order the user should meet them. */
  steps: readonly TipAnchor[];
  active?: boolean;
  replayToken?: number;
}) {
  const t = useTranslations("tips");
  const tTours = useTranslations("tours");
  const { update, blocked } = useGuide();
  const pending = useTipPending(id);
  const mounted = useMounted();
  const [running, setRunning] = useState<Step[] | null>(null);

  const start = useCallback(() => {
    const found = steps.filter((anchor) => findLaidOut(anchor) != null);
    if (found.length === 0 || !claimGuideSlot(id)) return false;
    setRunning(found.map((anchor) => ({ anchor, title: t(`${id}.steps.${anchor}.title`), body: t(`${id}.steps.${anchor}.body`) })));
    return true;
  }, [id, steps, t]);

  useEffect(() => {
    if (!active || !pending || blocked || running) return;
    const timer = setTimeout(() => {
      if (start()) update({ kind: "tipSeen", id });
    }, SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [id, active, pending, blocked, running, start, update]);

  // Replay from the help button, whether or not it was seen. Once per press.
  const replayed = useRef(0);
  useEffect(() => {
    if (replayToken === 0 || replayToken === replayed.current) return;
    replayed.current = replayToken;
    start();
  }, [replayToken, start]);

  useEffect(() => {
    if (!active && running) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the dialog closed under the tour
      setRunning(null);
      releaseGuideSlot(id);
    }
  }, [active, running, id]);
  useEffect(() => () => releaseGuideSlot(id), [id]);

  const close = useCallback(() => {
    setRunning(null);
    releaseGuideSlot(id);
  }, [id]);

  if (!mounted) return null;
  return createPortal(
    running && (
      <TourOverlay
        key={id}
        name={t(`${id}.title`)}
        steps={running}
        dialogLabel={(n, total) => tTours("dialogLabel", { page: t(`${id}.title`), n, total })}
        trapFocus={false}
        onClose={close}
      />
    ),
    document.body,
  );
}
