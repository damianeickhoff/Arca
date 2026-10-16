"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconCheck } from "@tabler/icons-react";
import { m, animate, easeOutQuart, useReducedMotion } from "@/lib/motion";
import { useFinishTransition } from "@/lib/finish-transition-state";

const BLOOM_DELAY_S = 0.3; // lets the finish step fade and its check pulse first
const BLOOM_S = 0.85;
const NAVIGATE_MS = 1200; // the screen is fully ember by now, so Home can load underneath
const MIN_HOLD_MS = 3000; // the welcome stays at least this long — it's meant to be read
const REVEAL_BUFFER_MS = 120; // after Home signals it mounted, for paint to settle
const REVEAL_FALLBACK_MS = 4000; // reveal anyway if Home never signals (defensive)
const REVEAL_S = 0.85;
const EASE_BLOOM = [0.7, 0, 0.2, 1] as const;
const EASE_REVEAL = [0.65, 0, 0.2, 1] as const;

/** Distance from (x, y) to the farthest viewport corner: a circle that big covers the screen. */
function coverRadius(x: number, y: number) {
  return Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
}

function Rise({ delay, className, children }: { delay: number; className?: string; children: React.ReactNode }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: easeOutQuart }}
      className={className}
    >
      {children}
    </m.div>
  );
}

// Mounted once in the root layout (see FinishTransitionProvider for why). The finish
// step's ember check blooms over the whole screen and says welcome, Home loads
// underneath, and once it has mounted (DashboardReadySignal) it opens through a growing
// circle in the middle of the ember.
export function FinishTransitionOverlay() {
  const t = useTranslations("onboarding.finishing");
  const tApp = useTranslations("onboarding");
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { active, options, routeReadyTick, stop } = useFinishTransition();
  const [navigated, setNavigated] = useState(false);
  const [minHeld, setMinHeld] = useState(false);
  const [routeReady, setRouteReady] = useState(false);
  const revealing = minHeld && routeReady;
  const layerRef = useRef<HTMLDivElement>(null);

  // The routeReadyTick value at the moment we navigate — only a *later* tick (Home
  // actually mounting after we navigated) counts, not one left over from before.
  const baselineTickRef = useRef(0);

  // Main sequence: bloom → navigate (Home renders underneath) → hold the welcome.
  useEffect(() => {
    if (!active) return;
    setNavigated(false);
    setMinHeld(false);
    setRouteReady(false);

    const navigateTimer = setTimeout(() => {
      baselineTickRef.current = routeReadyTick;
      router.push("/");
      router.refresh();
      setNavigated(true);
    }, NAVIGATE_MS);
    const holdTimer = setTimeout(() => setMinHeld(true), MIN_HOLD_MS);

    return () => {
      clearTimeout(navigateTimer);
      clearTimeout(holdTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, router]);

  // Ready as soon as Home reports it mounted (plus a tiny paint buffer), or after a
  // generous fallback if that signal never arrives.
  useEffect(() => {
    if (!navigated) return;
    const signalled = routeReadyTick > baselineTickRef.current;
    const timer = setTimeout(() => setRouteReady(true), signalled ? REVEAL_BUFFER_MS : REVEAL_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [navigated, routeReadyTick]);

  // The reveal: a hole grows from the middle of the screen until Home shows through
  // everywhere, then the overlay unmounts. With reduced motion the layer just fades.
  useEffect(() => {
    if (!revealing) return;
    const el = layerRef.current;
    if (!el || reduceMotion) {
      const timer = setTimeout(stop, 400);
      return () => clearTimeout(timer);
    }
    const x = window.innerWidth / 2;
    const y = window.innerHeight / 2;
    const controls = animate(0, coverRadius(x, y), {
      duration: REVEAL_S,
      delay: 0.1,
      ease: EASE_REVEAL,
      onUpdate: (r) => {
        const mask = `radial-gradient(circle at ${x}px ${y}px, transparent ${r}px, #000 ${r + 1}px)`;
        el.style.maskImage = mask;
        el.style.webkitMaskImage = mask;
      },
      onComplete: stop,
    });
    return () => controls.stop();
  }, [revealing, reduceMotion, stop]);

  if (!active || !options) return null;

  const app = tApp("appName");
  const { name, summary } = options;
  const x = options.origin?.x ?? window.innerWidth / 2;
  const y = options.origin?.y ?? window.innerHeight / 2;
  const r = options.origin?.r ?? 0;
  const items = [
    summary.imported > 0 ? t("transactions", { count: summary.imported }) : null,
    t("plan", summary.strategy),
    summary.bills > 0 ? t("bills", { count: summary.bills }) : null,
  ].filter((item): item is string => item !== null);

  return (
    <m.div
      ref={layerRef}
      role="status"
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-clear-ember px-6 font-clear text-clear-ember-ink"
      initial={reduceMotion ? { opacity: 0 } : { clipPath: `circle(${r}px at ${x}px ${y}px)` }}
      animate={reduceMotion ? { opacity: revealing ? 0 : 1 } : { clipPath: `circle(${coverRadius(x, y)}px at ${x}px ${y}px)` }}
      transition={reduceMotion ? { duration: 0.4 } : { duration: BLOOM_S, delay: BLOOM_DELAY_S, ease: EASE_BLOOM }}
    >
      <m.div
        className="flex flex-col items-center text-center"
        animate={{ opacity: revealing ? 0 : 1 }}
        transition={{ duration: 0.3 }}
      >
        <Rise delay={0.55}>
          <span aria-hidden className="inline-flex size-[72px] items-center justify-center rounded-full border-[3px] border-clear-ember-ink sm:size-[88px]">
            <IconCheck size={40} stroke={2.6} />
          </span>
        </Rise>
        <Rise delay={0.7}>
          <h2 className="m-0 mt-7 text-[40px] leading-none font-extrabold tracking-[-0.04em] sm:text-[56px] lg:text-[72px]">
            {name ? t("welcome", { app, name }) : t("welcomeNoName", { app })}
          </h2>
        </Rise>
        <Rise delay={0.85}>
          <p className="m-0 mt-4 text-base font-semibold sm:text-lg">{t("ready")}</p>
        </Rise>
        <ul className="m-0 mt-10 flex list-none flex-col items-start gap-3 p-0 sm:flex-row sm:items-center sm:gap-7">
          {items.map((item, i) => (
            <m.li
              key={item}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 1.05 + i * 0.25, ease: easeOutQuart }}
              className="inline-flex items-center gap-2.5 text-[15px] font-bold"
            >
              <span aria-hidden className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-full bg-clear-ember-ink text-clear-ember">
                <IconCheck size={14} stroke={3} />
              </span>
              {item}
            </m.li>
          ))}
        </ul>
      </m.div>
    </m.div>
  );
}
