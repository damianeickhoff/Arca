"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { IconAlertTriangle, IconFilter, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import type { Bank, Category, CategoryRule } from "@/db/schema";
import type { RuleStat } from "@/lib/rule-stats";
import { Segmented } from "@/components/clear/segmented";
import { ClearButton } from "@/components/clear/button";
import { IconTile } from "@/components/clear/icon-tile";
import { MoneyText } from "@/components/clear/money";
import { FIELD_LABEL } from "@/app/settings/account-edit-dialogs";
import { RowIconButton, SettingsEmpty } from "@/components/settings/settings-ui";
import { normalizeBudgetType, ruleAmountLabel } from "@/lib/format";
import { compareGroups } from "@/lib/category-tree";
import { ClearSelect } from "@/components/settings/accounts/clear-select";

// Pieces shared by the new-category dialog (category-client.tsx) and the category
// editor (category-settings-client.tsx).

/** The colour a new top-level category starts with (stored on the category). */
export const DEFAULT_CATEGORY_COLOR = "#22c55e";

export const BUDGET_TYPES = ["nodig", "willen", "sparen"] as const;
export type BudgetTypeKey = (typeof BUDGET_TYPES)[number];

/** The group a category belongs to (required), as a select of every group. */
export function GroupField({ id, categories, value, onChange }: { id: string; categories: Category[]; value: number | null; onChange: (groupId: number) => void }) {
  const t = useTranslations("settings.categories");
  const groups = categories.filter((c) => c.isGroup).sort(compareGroups);
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className={FIELD_LABEL}>{t("group")}</span>
      <ClearSelect
        ariaLabelledBy={id}
        value={value}
        placeholder={t("groupPlaceholder")}
        onChange={(v) => { if (v != null) onChange(v); }}
        options={groups.map((g) => ({ value: g.id as number | null, label: g.name }))}
      />
    </div>
  );
}

/** The budget type a new category in `group` starts with: the group's own. */
export function groupDefaultBudgetType(group: Category | undefined): BudgetTypeKey {
  const type = normalizeBudgetType(group?.budgetType ?? null);
  return (BUDGET_TYPES as readonly string[]).includes(type) ? (type as BudgetTypeKey) : "willen";
}

/** Needs / Wants / Savings as a segmented control, with what the chosen one means. */
export function BudgetTypeField({ value, onChange }: { value: string; onChange: (v: BudgetTypeKey) => void }) {
  const t = useTranslations("settings.categories");
  const current = (BUDGET_TYPES as readonly string[]).includes(value) ? (value as BudgetTypeKey) : "willen";
  return (
    <div className="flex flex-col gap-1.5">
      <span className={FIELD_LABEL} aria-hidden>{t("budgetType")}</span>
      <Segmented
        label={t("budgetType")}
        surface="tile"
        size="sm"
        value={current}
        onChange={onChange}
        className="w-full [&>button]:flex-1"
        items={BUDGET_TYPES.map((b) => ({ value: b, label: t(`budgetTypes.${b}`) }))}
      />
      <span className="text-[13px] text-clear-muted">{t(`budgetTypeHints.${current}`)}</span>
    </div>
  );
}

/**
 * Per rule of a saved category: how many transactions it decides and the rules of other
 * categories it fights with over recent ones. Fetched once when the editor opens and
 * again whenever its rule list changes (a save or delete); null until it arrives.
 */
export function useRuleStats(categoryId: number, rules: CategoryRule[]): Map<number, RuleStat> | null {
  const [stats, setStats] = useState<{ rules: CategoryRule[]; byRule: Map<number, RuleStat> } | null>(null);
  useEffect(() => {
    if (rules.length === 0) return;
    let live = true;
    fetch(`/api/category-rules/stats?categoryId=${categoryId}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ stats: RuleStat[] }>) : Promise.reject()))
      .then(({ stats }) => live && setStats({ rules, byRule: new Map(stats.map((s) => [s.ruleId, s])) }))
      .catch(() => { /* the list still works without counts */ });
    return () => {
      live = false;
    };
  }, [categoryId, rules]);
  return stats?.rules === rules ? stats.byRule : null;
}

/** The automatic rules of one category: a row per rule (what it matches, edit, delete)
 *  and an Add rule button. `note` sits above the list (e.g. "created when you save").
 *  With `stats` each row also says how many transactions the rule decides and warns
 *  when another category's rule matches the same recent transactions. */
export function CategoryRuleList({
  rules,
  banks,
  onAdd,
  onEdit,
  onDelete,
  note,
  stats,
  categories,
}: {
  rules: CategoryRule[];
  banks: Bank[];
  onAdd: () => void;
  onEdit: (rule: CategoryRule) => void;
  onDelete: (rule: CategoryRule) => void;
  note?: string;
  stats?: Map<number, RuleStat> | null;
  /** Names the category of a conflicting rule. */
  categories?: Category[];
}) {
  const t = useTranslations("settings.categories");
  const tRule = useTranslations("activity.rule");

  function conflictLine(stat: RuleStat | undefined) {
    const first = stat?.conflicts[0];
    if (!first) return null;
    const values = {
      pattern: first.pattern ? `“${first.pattern}”` : t("ruleAnyName"),
      category: categories?.find((c) => c.id === first.categoryId)?.name ?? "",
      count: stat.conflicts.length - 1,
    };
    return first.wins ? t("ruleConflictWins", values) : t("ruleConflictLoses", values);
  }

  function describe(rule: CategoryRule) {
    const match = rule.nameWholeWord ? "word" : rule.nameWildcard ? "contains" : "exact";
    const parts: string[] = [];
    const amount = ruleAmountLabel(rule);
    if (amount) parts.push(amount);
    if (rule.direction === "income" || rule.direction === "expense") parts.push(tRule(`direction.${rule.direction}`));
    if (rule.bankId) {
      const bank = banks.find((b) => b.id === rule.bankId);
      if (bank) parts.push(bank.displayName ?? bank.accountNumber ?? "");
    }
    return {
      title: rule.namePattern ? t("ruleMatch", { match: tRule(`match.${match}`), pattern: rule.namePattern }) : t("ruleAnyName"),
      meta: parts.filter(Boolean).join(" · ") || t("ruleAnyAmount"),
    };
  }

  return (
    <div className="flex flex-col gap-3">
      {note && <p className="m-0 text-[13px] text-clear-muted">{note}</p>}
      {rules.length === 0 ? (
        <SettingsEmpty icon={<IconFilter stroke={1.9} />}>{t("noRules")}</SettingsEmpty>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {rules.map((rule) => {
            const { title, meta } = describe(rule);
            const stat = stats?.get(rule.id);
            const conflict = conflictLine(stat);
            return (
              <li key={rule.id} className="flex min-h-16 items-center gap-3 border-b border-clear-ground py-2 pl-1 last:border-b-0">
                <IconTile size="sm"><IconFilter stroke={1.9} /></IconTile>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-bold">{title}</span>
                  <span className="truncate text-[13px] text-clear-muted">
                    <MoneyText>{stat ? `${meta} · ${t("ruleDecides", { count: stat.decides })}` : meta}</MoneyText>
                  </span>
                  {conflict && (
                    <span className="flex items-start gap-1.5 text-[13px] font-semibold text-clear-ember-text">
                      <IconAlertTriangle size={15} stroke={2.2} aria-hidden className="mt-px shrink-0" />
                      <span className="min-w-0">{conflict}</span>
                    </span>
                  )}
                </span>
                <RowIconButton label={t("editRule")} onClick={() => onEdit(rule)}>
                  <IconPencil stroke={2} />
                </RowIconButton>
                <RowIconButton label={t("deleteRule")} onClick={() => onDelete(rule)} danger>
                  <IconTrash stroke={2} />
                </RowIconButton>
              </li>
            );
          })}
        </ul>
      )}
      <ClearButton variant="secondary" size="sm" className="self-start" onClick={onAdd}>
        <IconPlus aria-hidden stroke={2.2} />
        {t("addRule")}
      </ClearButton>
    </div>
  );
}
