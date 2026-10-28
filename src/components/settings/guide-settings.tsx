"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ClearSwitch } from "@/components/clear/switch";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { useGuide } from "@/lib/guide-context";
import { TOURS, TOUR_IDS, type TourId } from "@/lib/guide";
import { cn } from "@/lib/utils";

/**
 * Settings › Help, under the guide and "Report a problem": the two switches (Page tours,
 * Tips), every page's tour with Seen and Replay or when it will start, and "Show every
 * tip and tour again". All of it is stored on the account (lib/guide.ts).
 */
export function GuideSettings() {
  const t = useTranslations("settings.guide");
  const tTours = useTranslations("tours");
  const router = useRouter();
  const { state, update, requestReplay } = useGuide();
  const id = useId();
  if (!state) return null;

  function replay(tour: TourId) {
    // The tour starts on its page; the phone's Settings sheet closes for it.
    requestReplay(tour);
    router.push(TOURS[tour].href);
  }

  const switches = [
    { key: "tours" as const, on: state.toursOn },
    { key: "tips" as const, on: state.tipsOn },
  ];

  return (
    <section aria-labelledby={`${id}-title`} className="mt-3 flex flex-col border-t border-clear-ground pt-5 font-clear text-clear-ink">
      <div className="flex flex-col gap-1 px-0 pb-2">
        <h3 id={`${id}-title`} className="m-0 text-lg font-bold">{t("title")}</h3>
        <span className="text-sm text-clear-ink-2">{t("subtitle")}</span>
      </div>

      {switches.map((s) => (
        <div key={s.key} className="flex min-h-[68px] items-center gap-3.5 border-b border-clear-ground px-2">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span id={`${id}-${s.key}`} className="text-[15px] font-bold">{t(`${s.key}.title`)}</span>
            <span className="text-[13px] text-clear-ink-2">{t(`${s.key}.meta`)}</span>
          </span>
          <ClearSwitch
            checked={s.on}
            onCheckedChange={(on) => update({ kind: "switch", which: s.key, on })}
            labelledBy={`${id}-${s.key}`}
          />
        </div>
      ))}

      <h4 className="m-0 px-2 pt-4 pb-1 text-[13px] font-bold text-clear-ink-2">{t("toursHeading")}</h4>
      <ul className="m-0 flex list-none flex-col p-0">
        {TOUR_IDS.map((tour) => {
          const def = TOURS[tour];
          const count = def.steps.length;
          const seen = state.toursSeen.includes(tour);
          const meta = seen
            ? t("seen", { count })
            : !state.toursOn
              ? t("off")
              : "startsAfter" in def
                ? t(def.startsAfter === "debt" ? "afterDebt" : "afterGoal")
                : t("nextTime", { count });
          return (
            <li key={tour} className="flex min-h-14 items-center gap-3 border-b border-clear-ground px-2 py-2">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-bold">{tTours(`${tour}.title`)}</span>
                <span className={cn("text-[13px]", seen ? "text-clear-ink-2" : "text-clear-placeholder")}>{meta}</span>
              </span>
              {seen && (
                <button
                  type="button"
                  onClick={() => replay(tour)}
                  aria-label={t("replayLabel", { page: tTours(`${tour}.title`) })}
                  className="h-9 shrink-0 cursor-pointer rounded-full bg-clear-ground px-3.5 text-[13px] font-bold text-clear-ink transition-colors hover:bg-clear-line"
                >
                  {t("replay")}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="px-2 pt-4 pb-1">
        <button type="button" onClick={() => update({ kind: "reset" })} className={clearButtonVariants({ variant: "outline" })}>
          {t("reset")}
        </button>
      </div>
    </section>
  );
}
