"use client";

import { useTranslations } from "next-intl";
import { Segmented } from "@/components/clear/segmented";
import { cn } from "@/lib/utils";

type Scope = "missing" | "all" | "custom";

/**
 * Which earlier matches a new rule files the first time it runs: only the ones still
 * without a category (the default), or all of them, the ones that already have one too.
 * It works on the caller's unticked set: "Only without a category" unticks every match
 * that has a category, "All" ticks them again; a hand-picked mix in "Show the N
 * transactions" selects neither. Renders nothing when no match has a category yet.
 * Shared by the rule switch (Needs a category, the category picker) and the teach strip.
 */
export function RuleScopeChoice({
  total,
  categorizedIds,
  excluded,
  onExcludedChange,
  className,
}: {
  /** Every earlier match the rule would file. */
  total: number;
  /** The matches that already have a category. */
  categorizedIds: number[];
  excluded: Set<number>;
  onExcludedChange: (next: Set<number>) => void;
  className?: string;
}) {
  const t = useTranslations("ruleScope");
  if (categorizedIds.length === 0) return null;

  const left = categorizedIds.filter((id) => excluded.has(id)).length;
  const value: Scope = left === categorizedIds.length ? "missing" : left === 0 ? "all" : "custom";

  function choose(next: Scope) {
    const set = new Set(excluded);
    for (const id of categorizedIds) {
      if (next === "missing") set.add(id);
      else set.delete(id);
    }
    onExcludedChange(set);
  }

  return (
    <div className={cn("flex flex-col items-start gap-2", className)}>
      <span className="text-[13px] font-medium text-clear-ink-2">{t(`hint.${value}`, { count: categorizedIds.length, total })}</span>
      <Segmented<Scope>
        size="sm"
        label={t("label")}
        value={value}
        onChange={choose}
        items={[
          { value: "missing", label: t("missing") },
          { value: "all", label: t("all") },
        ]}
      />
    </div>
  );
}
