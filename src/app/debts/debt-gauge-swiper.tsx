"use client";

import { useRef, useState } from "react";
import { GaugeCard, type GaugeCardProps } from "@/components/gauge-card";
import { cn } from "@/lib/utils";

/** Swipeable pair of gauge cards ("I owe" / "I am owed") — a snap-scroll track with a
 *  dot indicator underneath, same interaction as a native iOS card carousel. Falls
 *  back to a single static card when there's nothing owed to swipe to. */
export function DebtGaugeSwiper({ owe, owed }: { owe: GaugeCardProps; owed: GaugeCardProps | null }) {
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  if (!owed) {
    return <GaugeCard {...owe} />;
  }

  const cards = [owe, owed];

  function handleScroll() {
    const el = trackRef.current;
    if (!el) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    setActive(index);
  }

  function goTo(index: number) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div>
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth -mx-4 px-4 gap-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((card, i) => (
          <div key={i} className="w-full shrink-0 snap-center">
            <GaugeCard {...card} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-1.5 mt-3">
        {cards.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Show gauge ${i + 1}`}
            onClick={() => goTo(i)}
            className={cn("rounded-full transition-all", active === i ? "w-5 h-1.5 bg-white/60" : "w-1.5 h-1.5 bg-white/50")}
          />
        ))}
      </div>
    </div>
  );
}
