"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { m, AnimatePresence, spring } from "@/lib/motion";
import { IconCircleCheckFilled as CheckCircle2 } from "@tabler/icons-react";
import { useFinishTransition } from "@/lib/finish-transition-state";

// A handful of phrases, shown slower than a typical loading spinner — this is meant to
// be read, not just glanced at.
const LOADING_PHRASES = [
  "Warming up the calculator…",
  "Counting your coins…",
  "Fetching the piggy bank from the mud…",
  "Untangling your transactions…",
  "Teaching the numbers to behave…",
  "Polishing your dashboard…",
];

const PHRASE_MS = 1800;
const HOLD_MS = 7000; // how long the loading phrases run before "ready"
const READY_HOLD_MS = 1100; // how long "Everything is ready!" shows before navigating
const REVEAL_BUFFER_MS = 120; // tiny buffer after the dashboard signals ready, for paint to settle
const REVEAL_FALLBACK_MS = 4000; // reveal anyway if the dashboard never signals (defensive)
const FADE_MS = 500;

function ConfettiBurst() {
  const colors = ["#f97316", "#3b82f6", "#22c55e", "#eab308", "#ec4899", "#8b5cf6"];
  const pieces = useMemo(
    () =>
      Array.from({ length: 32 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        color: colors[i % colors.length],
        delay: Math.random() * 0.3,
        duration: 1.6 + Math.random() * 0.9,
        rotate: Math.random() * 360,
        drift: (Math.random() - 0.5) * 180,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {pieces.map((p) => (
        <m.span
          key={p.id}
          initial={{ top: "-5%", left: `${p.left}%`, opacity: 1, rotate: 0 }}
          animate={{ top: "105%", opacity: [1, 1, 0], rotate: p.rotate, x: p.drift }}
          transition={{ duration: p.duration, delay: p.delay, ease: "easeIn" }}
          className="absolute size-2.5 rounded-[2px]"
          style={{ backgroundColor: p.color }}
        />
      ))}
    </div>
  );
}

// Mounted once in the root layout (see FinishTransitionProvider for why). Runs the whole
// "getting things ready" sequence itself — cycling phrases, showing "ready", navigating,
// and only *then* fading out. The fade is triggered by the dashboard page itself reporting
// that it actually mounted (via routeReadyTick, see DashboardReadySignal) rather than a
// fixed delay — a guessed timeout was firing before the dashboard's own (DB-backed) render
// had finished, so the fade revealed Next's in-between blank state instead of real content,
// which is what looked like an extra "loading…" flash before the dashboard popped in.
export function FinishTransitionOverlay() {
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

    const cycle = setInterval(() => setPhraseIndex((i) => (i + 1) % LOADING_PHRASES.length), PHRASE_MS);
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
    const t = setTimeout(stop, FADE_MS);
    return () => clearTimeout(t);
  }, [revealing, stop]);

  if (!active) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-[#050e2e] transition-opacity"
      style={{ opacity: revealing ? 0 : 1, transitionDuration: `${FADE_MS}ms` }}
    >
      {!revealing && <ConfettiBurst />}

      {/* Aurora blobs */}
      <m.div
        className="absolute -top-1/4 -left-1/4 size-[70vmax] rounded-full bg-blue-600/30 blur-[120px]"
        animate={{ x: [0, 80, 0], y: [0, 60, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <m.div
        className="absolute -bottom-1/4 -right-1/4 size-[70vmax] rounded-full bg-indigo-400/25 blur-[120px]"
        animate={{ x: [0, -70, 0], y: [0, -50, 0], scale: [1.1, 1, 1.1] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative z-10 text-center px-6">
        {!ready ? (
          <div className="mx-auto mb-8 size-14 animate-spin rounded-full border-[3px] border-white/20 border-t-white" />
        ) : (
          <m.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={spring.gentle}
            className="mx-auto mb-8 flex size-14 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300"
          >
            <CheckCircle2 className="size-8" />
          </m.div>
        )}

        <AnimatePresence mode="wait">
          {ready ? (
            <m.h2
              key="ready"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={spring.gentle}
              className="text-3xl font-black tracking-tight text-white mb-2"
            >
              Everything is ready{options?.name ? `, ${options.name}` : ""}!
            </m.h2>
          ) : (
            <m.h2
              key={phraseIndex}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={spring.gentle}
              className="text-3xl font-black tracking-tight text-white mb-2"
            >
              {LOADING_PHRASES[phraseIndex]}
            </m.h2>
          )}
        </AnimatePresence>

        <m.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, ...spring.gentle }}
          className="text-white/70"
        >
          {options?.importResult ? (
            <>
              Processing <span className="font-bold text-white">{options.importResult.imported}</span> transactions
              {options.importResult.autoCategorised > 0 && (
                <> · <span className="font-bold text-white">{options.importResult.autoCategorised}</span> auto-categorised</>
              )}
            </>
          ) : (
            "Preparing your dashboard"
          )}
        </m.p>
      </div>
    </div>
  );
}
