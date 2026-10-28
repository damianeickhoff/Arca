"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconFilter2, IconListCheck, IconPencil } from "@tabler/icons-react";
import { IconTile } from "@/components/clear/icon-tile";
import { ClearSwitch } from "@/components/clear/switch";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { AnchoredTip } from "@/components/anchored-tip";
import { RuleMatchesDialog } from "@/components/rule-matches-dialog";
import { RuleScopeChoice } from "@/components/rule-scope-choice";
import type { RuleSpec } from "@/lib/category-suggestions";
import { cn } from "@/lib/utils";

/**
 * "Also create a rule": the switch that files similar transactions too, with — when the
 * rule would move others — "Show the N transactions", the list where matches can be
 * unticked before the rule runs, and — when some of them already have a category — the
 * the choice between moving only the ones without one (the default) or all of them.
 * With `onEditRule`, "Edit rule" beside it opens the rule to adjust before it is made.
 * Shared by Needs a category and the category picker; the caller keeps the switch and
 * the unticked ids, and leaves those out when it saves.
 */
export function RuleSwitchCard({
  rules,
  similarIds,
  categorizedIds,
  skipIds,
  checked,
  onCheckedChange,
  disabled,
  excluded,
  onExcludedChange,
  onEditRule,
  nested,
  tipActive,
  className,
}: {
  /** The rules it makes: one per merchant (pattern) among the picked transactions. */
  rules: RuleSpec[];
  /** The other transactions the rule matches today (they move with it). */
  similarIds: number[];
  /** The similar ones that already have a category. */
  categorizedIds: number[];
  /** The transactions being filed by hand anyway: not listed. */
  skipIds: number[];
  checked: boolean;
  onCheckedChange: (on: boolean) => void;
  disabled: boolean;
  excluded: Set<number>;
  onExcludedChange: (next: Set<number>) => void;
  /** "Edit rule": opens the rule dialog (Needs a category). Left out where it isn't offered. */
  onEditRule?: () => void;
  /** Inside another sheet (the category picker): the list opens above it. */
  nested?: boolean;
  /** Whether the "Show the N transactions" tip may show now. */
  tipActive: boolean;
  className?: string;
}) {
  const t = useTranslations("categoryPicker");
  const locale = useLocale();
  const labelId = useId();
  const [open, setOpen] = useState(false);
  const names = new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(rules.map((r) => r.pattern));
  const total = similarIds.length;
  const ticked = similarIds.filter((id) => !excluded.has(id)).length;

  return (
    <div className={cn("flex shrink-0 flex-col gap-3 rounded-clear-tile bg-clear-tile px-4 py-3", className)}>
      <label className="flex cursor-pointer items-center gap-3">
        <IconTile tone="sky" size="sm" className="size-8 rounded-full [&_svg]:size-4">
          <IconFilter2 stroke={2.1} />
        </IconTile>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span id={labelId} className="text-[15px] font-bold">
            {rules.length > 1 ? t("rule.titleMany", { count: rules.length }) : t("rule.title")}
          </span>
          <span className="text-[13px] font-medium text-clear-ink-2">
            {ticked > 0 ? t("rule.helpWithSimilar", { names, count: ticked }) : t("rule.help", { names })}
          </span>
        </span>
        <ClearSwitch checked={checked} onCheckedChange={onCheckedChange} labelledBy={labelId} disabled={disabled} />
      </label>
      {checked && total > 0 && (
        <RuleScopeChoice total={total} categorizedIds={categorizedIds} excluded={excluded} onExcludedChange={onExcludedChange} />
      )}
      {(total > 0 || onEditRule) && (
        <div className="flex gap-2">
          {onEditRule && (
            <button
              type="button"
              onClick={onEditRule}
              aria-haspopup="dialog"
              className={cn(clearButtonVariants({ variant: "surface", size: "sm" }), "shrink-0")}
            >
              <IconPencil aria-hidden />
              {t("rule.edit")}
            </button>
          )}
          {total > 0 && (
            <button
              type="button"
              data-tip-anchor="ruleMatches"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              className={cn(clearButtonVariants({ variant: "surface", size: "sm" }), "min-w-0", onEditRule ? "flex-1 sm:flex-none" : "self-start")}
            >
              <IconListCheck aria-hidden />
              <span className="truncate">{ticked < total ? t("rule.showMatchesSome", { count: ticked, total }) : t("rule.showMatches", { count: total })}</span>
            </button>
          )}
        </div>
      )}
      {total > 0 && (
        <>
          <RuleMatchesDialog
            open={open}
            onOpenChange={setOpen}
            rules={rules}
            skipIds={skipIds}
            excluded={excluded}
            onExcludedChange={onExcludedChange}
            sheetClassName={nested ? "z-[70]" : undefined}
            overlayClassName={nested ? "z-[70]" : undefined}
          />
          <AnchoredTip id="ruleMatches" anchor="ruleMatches" active={tipActive && !open} />
        </>
      )}
    </div>
  );
}
