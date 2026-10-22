import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { IconCheck, IconChevronRight } from "@tabler/icons-react";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { ClearProgress } from "@/components/clear/progress";
import { cn } from "@/lib/utils";
import { GetStartedSkip } from "./get-started-skip";
import { AddRecurringButton } from "@/components/settings/recurring/add-recurring-button";

const STEPS = [
  { key: "imported", href: "/settings?panel=import" },
  { key: "budget", href: "/budget" },
  { key: "bills", href: null },
  { key: "goal", href: "/goals/add" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

/**
 * Home before anything is imported: four steps to a working household, each a link
 * to where it's done. Steps already done (a budget made during onboarding, say) show
 * checked, and the first open step is marked as the place to start. Skip hides it.
 */
export async function GetStartedCard({ steps }: { steps: Record<StepKey, boolean> }) {
  const t = await getTranslations("home.getStarted");
  const done = STEPS.filter((s) => steps[s.key]).length;
  const firstOpen = STEPS.find((s) => !steps[s.key])?.key;

  return (
    <ClearCard aria-labelledby="home-get-started-title">
      <ClearCardHeader
        title={<span id="home-get-started-title">{t("title")}</span>}
        subtitle={t("progress", { done, total: STEPS.length })}
        action={<GetStartedSkip label={t("skip")} />}
      />
      <ClearProgress value={done / STEPS.length} size="sm" />
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {STEPS.map((s) => {
          const isDone = steps[s.key];
          const isNext = s.key === firstOpen;
          return (
            <li key={s.key}>
              {/* The bills step opens the recurring form in place; the others are pages. */}
              {s.href ? (
              <Link href={s.href} className={cn(
                "flex w-full cursor-pointer items-center gap-3 rounded-clear-tile p-3.5 text-left text-clear-ink no-underline transition-colors hover:bg-clear-line",
                isNext ? "bg-clear-peach" : "bg-clear-tile",
              )}>
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-full",
                    isDone ? "bg-clear-mint text-clear-mint-ink" : "border-[1.5px] border-clear-line bg-clear-card",
                  )}
                >
                  {isDone && <IconCheck size={15} stroke={3} />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cn("text-[15px] font-bold", isDone && "text-clear-muted line-through")}>{t(`steps.${s.key}.title`)}</span>
                  <span className="text-[13px] text-clear-ink-2">{isDone ? t("done") : t(`steps.${s.key}.body`)}</span>
                </span>
                {isNext && <span className="hidden shrink-0 text-xs font-extrabold text-clear-ember-text sm:inline">{t("startHere")}</span>}
                <IconChevronRight size={18} stroke={2} aria-hidden className="shrink-0 text-clear-muted" />
              </Link>
              ) : (
              <AddRecurringButton type="bill" className={cn(
                "flex w-full cursor-pointer items-center gap-3 rounded-clear-tile p-3.5 text-left text-clear-ink no-underline transition-colors hover:bg-clear-line",
                isNext ? "bg-clear-peach" : "bg-clear-tile",
              )}>
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-full",
                    isDone ? "bg-clear-mint text-clear-mint-ink" : "border-[1.5px] border-clear-line bg-clear-card",
                  )}
                >
                  {isDone && <IconCheck size={15} stroke={3} />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cn("text-[15px] font-bold", isDone && "text-clear-muted line-through")}>{t(`steps.${s.key}.title`)}</span>
                  <span className="text-[13px] text-clear-ink-2">{isDone ? t("done") : t(`steps.${s.key}.body`)}</span>
                </span>
                {isNext && <span className="hidden shrink-0 text-xs font-extrabold text-clear-ember-text sm:inline">{t("startHere")}</span>}
                <IconChevronRight size={18} stroke={2} aria-hidden className="shrink-0 text-clear-muted" />
              </AddRecurringButton>
              )}
            </li>
          );
        })}
      </ol>
    </ClearCard>
  );
}
