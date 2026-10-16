"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// The plan month: last month, this month or one of the next six. Kept in a cookie
// (read back by the Insights page) rather than the URL, so stepping through months
// neither adds history entries nor changes the address of the Insights page.
export function MonthStepper({
  month,
  months,
  labels,
}: {
  month: string;
  months: string[];
  /** Month key → "November 2026". */
  labels: Record<string, string>;
}) {
  const t = useTranslations("insights.forecast.plan");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const index = months.indexOf(month);

  function go(next: string | undefined) {
    if (!next) return;
    document.cookie = `fc_month=${next};path=/;max-age=31536000;SameSite=Lax`;
    startTransition(() => router.refresh());
  }

  const prev = index > 0 ? months[index - 1] : index === -1 ? months[0] : undefined;
  const next = index >= 0 && index < months.length - 1 ? months[index + 1] : undefined;
  const button =
    "inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-clear-card text-clear-ink transition-colors hover:bg-clear-line disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div role="group" aria-label={t("monthGroup")} className={cn("inline-flex items-center gap-1 rounded-full bg-clear-tile p-1", pending && "opacity-70")}>
      <button type="button" onClick={() => go(prev)} disabled={!prev || pending} aria-label={prev ? t("previous", { month: labels[prev] ?? prev }) : t("previousNone")} className={button}>
        <IconChevronLeft size={18} stroke={2} aria-hidden />
      </button>
      <span aria-live="polite" className="min-w-[8.5rem] px-1.5 text-center text-sm font-bold capitalize">
        {labels[month] ?? month}
      </span>
      <button type="button" onClick={() => go(next)} disabled={!next || pending} aria-label={next ? t("next", { month: labels[next] ?? next }) : t("nextNone")} className={button}>
        <IconChevronRight size={18} stroke={2} aria-hidden />
      </button>
    </div>
  );
}
