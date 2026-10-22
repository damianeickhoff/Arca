"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconCheck } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { Amount } from "@/components/clear/amount";
import { containsRuleFields, previewQuery } from "@/components/rule-actions";
import type { RuleSpec } from "@/lib/category-suggestions";
import { groupMatchesByRule, type RuleMatchRow } from "@/lib/rule-match-groups";
import { cn } from "@/lib/utils";

/** Every transaction one of `rules` matches now, each under the first rule that has it. */
async function loadMatches(rules: RuleSpec[], skipIds: number[]): Promise<RuleMatchRow[][]> {
  const perRule: RuleMatchRow[][] = [];
  for (const rule of rules) {
    const res = await fetch(`/api/category-rules/preview?${previewQuery(containsRuleFields(rule.pattern, rule.direction))}&rows=1`);
    if (!res.ok) throw new Error("preview failed");
    const data: { rows?: RuleMatchRow[] } = await res.json();
    perRule.push(data.rows ?? []);
  }
  return groupMatchesByRule(perRule, new Set(skipIds));
}

/**
 * "Show the N transactions": the transactions new "description contains" rules would
 * file when they run the first time, each with a tick (all ticked to start). With rules
 * for several merchants (a bulk selection) the list is grouped per merchant, each group
 * with its own select all / none. Unticked ones are left out of that first run — the
 * caller passes them on as `exclude` to the rule pass and leaves them out of its own
 * move. The rules themselves still file new matches. Shared by Needs a category's rule
 * card, the category picker's rule switch and the teach strip.
 */
export function RuleMatchesDialog({
  open,
  onOpenChange,
  rules,
  skipIds = [],
  excluded,
  onExcludedChange,
  sheetClassName,
  overlayClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The rules being made, one per merchant (pattern). */
  rules: RuleSpec[];
  /** Transactions filed by hand anyway (the ones being categorised): not listed. */
  skipIds?: number[];
  excluded: Set<number>;
  onExcludedChange: (next: Set<number>) => void;
  /** Layering when it opens over another sheet (the category picker). */
  sheetClassName?: string;
  overlayClassName?: string;
}) {
  const t = useTranslations("ruleMatches");
  const locale = useLocale();
  const rulesKey = JSON.stringify(rules);
  const skipKey = skipIds.join(",");
  const key = `${rulesKey}|${skipKey}`;
  const [loaded, setLoaded] = useState<{ key: string; groups: RuleMatchRow[][] } | "failed" | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadMatches(JSON.parse(rulesKey) as RuleSpec[], skipKey ? skipKey.split(",").map(Number) : [])
      .then((groups) => {
        if (!cancelled) setLoaded({ key, groups });
      })
      .catch(() => {
        if (!cancelled) setLoaded("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [open, key, rulesKey, skipKey]);

  const groups = loaded && loaded !== "failed" && loaded.key === key ? loaded.groups : null;
  const rows = groups?.flat() ?? null;
  const tickedIn = (list: RuleMatchRow[]) => list.filter((r) => !excluded.has(r.id)).length;
  const ticked = rows ? tickedIn(rows) : 0;
  const dayFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const grouped = rules.length > 1;

  function toggle(id: number) {
    const next = new Set(excluded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onExcludedChange(next);
  }
  /** Ticks (`on`) or unticks every row of `list`, leaving the rest as it is. */
  function setAll(list: RuleMatchRow[], on: boolean) {
    const next = new Set(excluded);
    for (const r of list) {
      if (on) next.delete(r.id);
      else next.add(r.id);
    }
    onExcludedChange(next);
  }

  function selectButtons(list: RuleMatchRow[], label?: string) {
    const n = tickedIn(list);
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setAll(list, true)}
          disabled={n === list.length}
          aria-label={label ? t("selectAllFor", { name: label }) : undefined}
          className={clearButtonVariants({ variant: "secondary", size: "sm" })}
        >
          {t("selectAll")}
        </button>
        <button
          type="button"
          onClick={() => setAll(list, false)}
          disabled={n === 0}
          aria-label={label ? t("selectNoneFor", { name: label }) : undefined}
          className={clearButtonVariants({ variant: "secondary", size: "sm" })}
        >
          {t("selectNone")}
        </button>
      </div>
    );
  }

  function list(items: RuleMatchRow[]) {
    return (
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {items.map((r) => {
          const on = !excluded.has(r.id);
          const value = r.direction === "expense" ? -Math.abs(r.amount) : Math.abs(r.amount);
          return (
            <li key={r.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(r.id)}
                className={cn(
                  "flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-clear-row px-2.5 text-left outline-none transition-colors hover:bg-clear-tile focus-visible:ring-3 focus-visible:ring-clear-ember/50",
                  !on && "text-clear-muted",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                    on ? "border-clear-ink bg-clear-primary text-clear-primary-ink" : "border-clear-line text-transparent",
                  )}
                >
                  <IconCheck size={14} stroke={3} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cn("truncate text-sm font-bold", on ? "text-clear-ink" : "line-through")}>{r.description}</span>
                  <span className="truncate text-[13px] text-clear-muted">{[dayFmt.format(new Date(`${r.date}T12:00:00`)), r.accountName].filter(Boolean).join(" · ")}</span>
                </span>
                <Amount value={value} sign="always" splitCents={false} className={cn("shrink-0 text-[15px]", on && value > 0 && "text-clear-positive")} />
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideHeaderRow
        title={t("title")}
        className="gap-4 pt-7 font-clear text-clear-ink"
        sheetClassName={sheetClassName}
        overlayClassName={overlayClassName}
        footer={
          <ClearDialogFooter>
            <button type="button" onClick={() => onOpenChange(false)} className={clearButtonVariants()}>
              <IconCheck aria-hidden />
              {t("done")}
            </button>
          </ClearDialogFooter>
        }
      >
        <ClearDialogHeader
          title={t("title")}
          subtitle={rows ? t("subtitle", { ticked, total: rows.length }) : undefined}
          onClose={() => onOpenChange(false)}
          closeLabel={t("close")}
        />

        {loaded === "failed" ? (
          <p role="alert" className="m-0 text-[13px] font-semibold text-clear-negative">{t("failed")}</p>
        ) : !groups || !rows ? (
          <p className="m-0 text-sm text-clear-muted">{t("loading")}</p>
        ) : rows.length === 0 ? (
          <p className="m-0 text-sm text-clear-muted">{t("none")}</p>
        ) : grouped ? (
          <>
            {selectButtons(rows)}
            {rules.map((rule, i) =>
              groups[i].length === 0 ? null : (
                <section key={rule.pattern} aria-label={rule.pattern} className="flex flex-col gap-2 rounded-clear-tile bg-clear-tile p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="m-0 min-w-0 text-[15px] font-bold">
                      {rule.pattern}
                      <span className="ml-2 text-[13px] font-medium text-clear-muted">{t("groupCount", { ticked: tickedIn(groups[i]), total: groups[i].length })}</span>
                    </h3>
                    {selectButtons(groups[i], rule.pattern)}
                  </div>
                  {list(groups[i])}
                </section>
              ),
            )}
          </>
        ) : (
          <>
            {selectButtons(rows)}
            {list(rows)}
          </>
        )}
        <p className="m-0 text-[13px] leading-snug text-clear-ink-2">{grouped ? t("noteMany") : t("note")}</p>
      </DialogContent>
    </Dialog>
  );
}
