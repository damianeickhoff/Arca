"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconFilter2, IconListCheck } from "@tabler/icons-react";
import { IconTile } from "@/components/clear/icon-tile";
import { ClearSwitch } from "@/components/clear/switch";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { AnchoredTip } from "@/components/anchored-tip";
import { RuleMatchesDialog } from "@/components/rule-matches-dialog";
import type { RuleSpec } from "@/lib/category-suggestions";
import { cn } from "@/lib/utils";

/**
 * "Also create a rule": the switch that files similar transactions too, with — when the
 * rule would move others — "Show the N transactions", the list where matches can be
 * unticked before the rule runs. Shared by Needs a category and the category picker;
 * the caller keeps the switch and the unticked ids, and leaves those out when it saves.
 */
export function RuleSwitchCard({
  rules,
  similarIds,
  skipIds,
  checked,
  onCheckedChange,
  disabled,
  excluded,
  onExcludedChange,
  nested,
  tipActive,
  className,
}: {
  /** The rules it makes: one per merchant (pattern) among the picked transactions. */
  rules: RuleSpec[];
  /** The other transactions the rule matches today (they move with it). */
  similarIds: number[];
  /** The transactions being filed by hand anyway: not listed. */
  skipIds: number[];
  checked: boolean;
  onCheckedChange: (on: boolean) => void;
  disabled: boolean;
  excluded: Set<number>;
  onExcludedChange: (next: Set<number>) => void;
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
            {total > 0 ? t("rule.helpWithSimilar", { names, count: total }) : t("rule.help", { names })}
          </span>
        </span>
        <ClearSwitch checked={checked} onCheckedChange={onCheckedChange} labelledBy={labelId} disabled={disabled} />
      </label>
      {total > 0 && (
        <>
          <button
            type="button"
            data-tip-anchor="ruleMatches"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className={cn(clearButtonVariants({ variant: "surface", size: "sm" }), "self-start")}
          >
            <IconListCheck aria-hidden />
            {ticked < total ? t("rule.showMatchesSome", { count: ticked, total }) : t("rule.showMatches", { count: total })}
          </button>
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
