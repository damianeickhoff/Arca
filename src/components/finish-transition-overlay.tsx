"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconCheck } from "@tabler/icons-react";
import { m, AnimatePresence, spring } from "@/lib/motion";
import { useFinishTransition } from "@/lib/finish-transition-state";
import { cn } from "@/lib/utils";

// A handful of phrases, shown slower than a typical loading spinner — this is meant to
// be read, not just glanced at.
const PHRASES = ["calculator", "coins", "piggyBank", "untangle", "behave", "polish"] as const;

const PHRASE_MS = 1800;
const HOLD_MS = 7000; // how long the loading phrases run before "ready"
const READY_HOLD_MS = 1100; // how long "Everything is ready!" shows before navigating
const REVEAL_BUFFER_MS = 120; // tiny buffer after the dashboard signals ready, for paint to settle
const REVEAL_FALLBACK_MS = 4000; // reveal anyway if the dashboard never signals (defensive)
const FADE_MS = 500;

const CONFETTI = ["bg-clear-ember", "bg-clear-info-fill", "bg-clear-positive-fill", "bg-clear-warning-fill", "bg-clear-rose-ink", "bg-clear-lilac-ink"];

/** A fixed scatter (0–1) per piece and property — the same burst every time, no Math.random in render. */
function scatter(i: number, k: number) {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const PIECES = Array.from({ length: 32 }, (_, i) => ({
  id: i,
  left: scatter(i, 1) * 100,
  color: CONFETTI[i % CONFETTI.length],
  delay: scatter(i, 2) * 0.3,
  duration: 1.6 + scatter(i, 3) * 0.9,
  rotate: scatter(i, 4) * 360,
  drift: (scatter(i, 5) - 0.5) * 180,
}));

function ConfettiBurst() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {PIECES.map((p) => (
        <m.span
          key={p.id}
          initial={{ top: "-5%", left: `${p.left}%`, opacity: 1, rotate: 0 }}
          animate={{ top: "105%", opacity: [1, 1, 0], rotate: p.rotate, x: p.drift }}
          transition={{ duration: p.duration, delay: p.delay, ease: "easeIn" }}
          className={cn("absolute size-2.5 rounded-[2px]", p.color)}
        />
      ))}
    </div>
  );
}

// Mounted once in the root layout (see FinishTransitionProvider for why). Runs the whole
// "setting up your household" sequence itself — cycling phrases with a progress bar,
// showing "ready", navigating, and only *then* fading out. The fade is triggered by the
// dashboard page itself reporting that it actually mounted (via routeReadyTick, see
// DashboardReadySignal) rather than a fixed delay, so it never reveals Next's in-between
// blank state instead of real content.
export function FinishTransitionOverlay() {
  const t = useTranslations("onboarding.finishing");
  const router = useRouter();
  const { active, options, routeReadyTick, stop } = useFinishTransition();
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [waitingForRoute, setWaitingForRoute] = useState(false);

  // The routeReadyTick value at the moment we start waiting — only a *later* tick than
  // this (i.e. the dashboard actually mounting after we navigated) should trigger the
  // reveal, not one left over from whatever was already true before we got here.
  const baselineTickRef = useRef(0);

  // Main sequence: phrases → "ready" → navigate → start waiting for the dashboard's signal.
  useEffect(() => {
    if (!active) return;
    setReady(false);
    setRevealing(false);
    setWaitingForRoute(false);
    setPhraseIndex(0);

    const cycle = setInterval(() => setPhraseIndex((i) => (i + 1) % PHRASES.length), PHRASE_MS);
    const readyTimer = setTimeout(() => setReady(true), HOLD_MS);
    const navigateTimer = setTimeout(() => {
      baselineTickRef.current = routeReadyTick;
      router.push("/");
      router.refresh();
      setWaitingForRoute(true);
    }, HOLD_MS + READY_HOLD_MS);

    return () => {
      clearInterval(cycle);
      clearTimeout(readyTimer);
      clearTimeout(navigateTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, router]);

  // Once navigated, reveal as soon as the dashboard reports it mounted (plus a tiny paint
  // buffer) — or after a generous fallback if that signal never arrives for some reason.
  useEffect(() => {
    if (!waitingForRoute) return;
    if (routeReadyTick <= baselineTickRef.current) {
      const fallback = setTimeout(() => setRevealing(true), REVEAL_FALLBACK_MS);
      return () => clearTimeout(fallback);
    }
    const buffered = setTimeout(() => setRevealing(true), REVEAL_BUFFER_MS);
    return () => clearTimeout(buffered);
  }, [waitingForRoute, routeReadyTick]);

  // Once the fade starts, fully unmount after it completes.
  useEffect(() => {
    if (!revealing) return;
    const timer = setTimeout(stop, FADE_MS);
    return () => clearTimeout(timer);
  }, [revealing, stop]);

  if (!active) return null;

  const name = options?.name;
  const imported = options?.importResult?.imported ?? 0;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-clear-ground px-6 font-clear text-clear-ink transition-opacity"
      style={{ opacity: revealing ? 0 : 1, transitionDuration: `${FADE_MS}ms` }}
    >
      {ready && !revealing && <ConfettiBurst />}

      <div className="relative z-10 flex w-full max-w-[420px] flex-col items-center gap-7 text-center">
        <div aria-hidden className="flex size-[180px] items-center justify-center rounded-full bg-clear-card/55">
          <div className="flex size-[146px] items-center justify-center rounded-full bg-clear-card">
            <m.span
              animate={ready ? { scale: [1, 1.08, 1] } : { scale: 1 }}
              // Three keyframes (a pop and back) can't run on a spring — Motion throws and
              // the overlay never hands off — so the pop is a short timed animation.
              transition={ready ? { duration: 0.5, ease: "easeInOut", times: [0, 0.4, 1] } : spring.gentle}
              className="inline-flex size-[110px] items-center justify-center rounded-full bg-clear-ember text-clear-ember-ink"
            >
              {ready ? (
                <IconCheck size={52} stroke={2.6} />
              ) : (
                <span className="size-12 animate-spin rounded-full border-[3px] border-clear-ember-ink/25 border-t-clear-ember-ink" />
              )}
            </m.span>
          </div>
        </div>

        <div className="flex min-h-[96px] flex-col items-center gap-3">
          <AnimatePresence mode="wait">
            <m.h2
              key={ready ? "ready" : phraseIndex}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={spring.gentle}
              className="m-0 text-[28px] leading-[1.1] font-extrabold tracking-[-0.03em] sm:text-[34px]"
            >
              {ready ? (name ? t("ready", { name }) : t("readyNoName")) : t(`phrases.${PHRASES[phraseIndex]}`)}
            </m.h2>
          </AnimatePresence>
          <p role="status" className="m-0 text-base leading-normal text-clear-ink-2">
            {imported > 0 ? t("withImport", { count: imported }) : t("withoutImport")}
          </p>
        </div>

        <div className="flex w-full items-center gap-3">
          <div aria-hidden className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-clear-line">
            <m.span
              className="absolute inset-y-0 left-0 rounded-full bg-clear-ember"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: HOLD_MS / 1000, ease: "easeInOut" }}
            />
          </div>
          <span className="sr-only">{t("progressLabel")}</span>
        </div>
      </div>
    </div>
  );
}
