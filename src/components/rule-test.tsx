"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconArrowRight, IconFlask } from "@tabler/icons-react";
import { ClearButton } from "@/components/clear/button";
import type { RuleFields } from "@/components/rule-dialog";
import type { RuleTestResult } from "@/lib/rule-stats";
import { cn } from "@/lib/utils";

/**
 * The rule dialog's Test: replays this one rule, as edited, on the last 90 days and
 * lists the transactions whose category would change (saving applies them). Goes
 * stale — dimmed, with Test again — as soon as the conditions change.
 */
export function RuleTest({ fields, categoryId, ruleId }: { fields: RuleFields; categoryId: number; ruleId?: number | null }) {
  const t = useTranslations("activity.rule.test");
  const locale = useLocale();
  const key = JSON.stringify([fields, categoryId]);
  const [result, setResult] = useState<{ key: string; data: RuleTestResult } | null>(null);
  const [state, setState] = useState<"idle" | "running" | "failed">("idle");

  async function run() {
    setState("running");
    try {
      const res = await fetch("/api/category-rules/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rule: fields, categoryId, ruleId: ruleId ?? null }),
      });
      if (!res.ok) throw new Error("test failed");
      setResult({ key, data: await res.json() });
      setState("idle");
    } catch {
      setState("failed");
    }
  }

  const data = result?.data ?? null;
  const stale = !!result && result.key !== key;
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });

  return (
    <section aria-live="polite" className={cn("flex flex-col gap-3", stale && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ClearButton type="button" variant="secondary" size="sm" onClick={run} disabled={state === "running"}>
          <IconFlask aria-hidden />
          {state === "running" ? t("running") : data && !stale ? t("again") : t("run", { days: 90 })}
        </ClearButton>
        {data && (
          <span className="text-[13px] font-semibold text-clear-ink-2">
            {data.total === 0 ? t("nothing", { days: data.days }) : t("summary", { count: data.total, days: data.days })}
          </span>
        )}
        {state === "failed" && (
          <span role="alert" className="text-[13px] font-semibold text-clear-negative">
            {t("failed")}
          </span>
        )}
      </div>
      {data && data.changes.length > 0 && (
        <>
          <ul className="m-0 flex list-none flex-col rounded-clear-tile bg-clear-tile px-3.5 py-0">
            {data.changes.map((c) => (
              <li key={c.id} className="flex flex-col gap-0.5 border-b border-clear-line py-2.5 last:border-b-0">
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{c.description}</span>
                  <span className="shrink-0 text-[13px] text-clear-muted">{fmt.format(new Date(`${c.date}T12:00:00`))}</span>
                </span>
                <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-clear-ink-2">
                  <span className="truncate">{c.from ?? t("noCategory")}</span>
                  <IconArrowRight size={14} aria-label={t("becomes")} className="shrink-0" />
                  <span className="truncate font-bold text-clear-ink">{c.to ?? t("noCategory")}</span>
                </span>
              </li>
            ))}
          </ul>
          <span className="px-1 text-[13px] text-clear-muted">
            {data.total > data.changes.length ? t("moreAndSave", { count: data.total - data.changes.length }) : t("save")}
          </span>
        </>
      )}
    </section>
  );
}
