"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconChevronDown, IconChevronRight, IconFilter, IconPencil, IconPlus, IconTag } from "@tabler/icons-react";
import { Icon } from "@/components/icon";
import { IconTile } from "@/components/clear/icon-tile";
import { Amount } from "@/components/clear/amount";
import { ClearChip } from "@/components/clear/chip";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { ClearButton } from "@/components/clear/button";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { AnchoredTip } from "@/components/anchored-tip";
import { NewCategoryButton } from "@/components/settings/categories/category-client";
import { EditCategoryDialog, EditCategoryForm } from "@/components/settings/categories/category-settings-client";
import { GroupDialog } from "@/components/settings/categories/group-dialog";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import { RowIconButton, SettingsEmpty, SettingsNotice, SettingsSearch } from "@/components/settings/settings-ui";
import { groupCategories } from "@/lib/category-tree";
import { formatEurWhole, normalizeBudgetType } from "@/lib/format";
import { MoneyText } from "@/components/clear/money";
import { cn } from "@/lib/utils";
import type { Category, CategoryRule, Bank } from "@/db/schema";

interface Props {
  categories: Category[];
  rulesByCat: Record<number, CategoryRule[]>;
  banks: Bank[];
  /** What each category counted this financial month (spent, received or saved). */
  totals: Record<number, number>;
  /** Standing budgets by category or group id. */
  budgets: Record<number, number>;
}

/** Remembered per browser: which groups are folded. */
const COLLAPSED_KEY = "centje.settings.categories.collapsed";

// One grid for the column header, group headers and category rows, so the columns line
// up. Narrow (phone, a narrow panel): icon · name · amount · action. From a 672px wide
// list the budget type and the number of rules get their own columns.
const ROW_GRID = "grid grid-cols-[40px_minmax(0,1fr)_auto_36px] items-center gap-x-3 @2xl:grid-cols-[40px_minmax(0,1fr)_96px_56px_112px_36px]";

/** The Categories settings panel: every group as a section you can fold, its
 *  categories underneath. A category opens the Edit category dialog, a group's
 *  pencil the Edit group dialog. */
export function CategoriesClient({ categories, rulesByCat, banks, totals, budgets }: Props) {
  const router = useRouter();
  const t = useTranslations("settings.categories");
  const tPanels = useTranslations("settings.panels");
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after mount; localStorage isn't there during SSR
      if (Array.isArray(saved)) setCollapsed(new Set(saved.filter((n) => typeof n === "number")));
    } catch {
      /* storage blocked: everything starts open */
    }
  }, []);
  function toggle(id: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        /* not remembered */
      }
      return next;
    });
  }

  // Wipes every category and re-seeds src/config/categories.ts.
  async function resetToDefaults() {
    const ok = await confirm({ title: t("resetTitle"), body: t("resetBody"), confirmLabel: t("resetConfirm"), destructive: true });
    if (!ok) return;
    setResetting(true);
    setError(null);
    const res = await fetch("/api/categories/reset", { method: "POST" }).catch(() => null);
    setResetting(false);
    if (!res?.ok) {
      setError(t("resetError"));
      return;
    }
    router.refresh();
  }

  // The category being edited. `detail` stays set while the dialog animates closed.
  const [detail, setDetail] = useState<Category | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  // The group being edited (group null = a new group).
  const [groupEdit, setGroupEdit] = useState<{ group: Category | null; count: number } | null>(null);
  const [groupOpen, setGroupOpen] = useState(false);

  const blocks = groupCategories(categories);
  const query = search.trim().toLowerCase();
  // Searching matches categories by name, and a group's name shows all of its categories.
  const shown = query
    ? blocks
        .map((b) => (b.group.name.toLowerCase().includes(query) ? b : { ...b, categories: b.categories.filter((c) => c.name.toLowerCase().includes(query)) }))
        .filter((b) => b.categories.length > 0)
    : blocks;
  const categoryCount = blocks.reduce((n, b) => n + b.categories.length, 0);
  const ruleCount = Object.values(rulesByCat).reduce((n, list) => n + list.length, 0);

  function chipFor(cat: Category) {
    if (cat.group === "income") return { tone: "stone" as const, label: t("kindIncome") };
    const key = normalizeBudgetType(cat.budgetType);
    if (key === "sparen" || cat.group === "savings") return { tone: "mint" as const, label: t("budgetTypes.sparen") };
    if (key === "nodig") return { tone: "sky" as const, label: t("budgetTypes.nodig") };
    if (key === "willen") return { tone: "peach" as const, label: t("budgetTypes.willen") };
    return null;
  }

  return (
    <>
      <PanelHeader
        title={tPanels("categories.title")}
        action={
          <>
            <ClearButton variant="secondary" size="sm" onClick={() => { setGroupEdit({ group: null, count: 0 }); setGroupOpen(true); }}>
              <IconPlus aria-hidden stroke={2.2} />
              {t("newGroup")}
            </ClearButton>
            {blocks.length > 0 && (
              <NewCategoryButton categories={categories} banks={banks} ariaLabel={t("new")} className={clearButtonVariants({ size: "sm" })}>
                <IconPlus aria-hidden stroke={2.2} />
                <span aria-hidden className="hidden sm:inline">{t("new")}</span>
              </NewCategoryButton>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-4 px-4 pt-1 font-clear text-clear-ink">
        <p className="m-0 text-[13px] text-clear-muted">{t("summary", { groups: blocks.length, categories: categoryCount })}</p>
        <SettingsSearch value={search} onChange={setSearch} placeholder={t("search")} label={t("search")} />

        {error && <SettingsNotice>{error}</SettingsNotice>}

        {blocks.length === 0 ? (
          <SettingsEmpty icon={<IconTag stroke={1.9} />}>{t("empty")}</SettingsEmpty>
        ) : shown.length === 0 ? (
          <SettingsEmpty icon={<IconTag stroke={1.9} />}>{t("noMatch")}</SettingsEmpty>
        ) : (
          <div className="@container" data-tip-anchor="categoryGroups">
            <div aria-hidden className={cn(ROW_GRID, "hidden px-2 pb-2 text-[13px] font-bold text-clear-muted @2xl:grid")}>
              <span />
              <span>{t("colCategory")}</span>
              <span>{t("colBudgetType")}</span>
              <span className="text-right">{t("colRules")}</span>
              <span className="text-right">{t("colThisMonth")}</span>
              <span />
            </div>

            {shown.map(({ group, categories: cats }) => {
              const isCollapsed = !query && collapsed.has(group.id);
              const all = blocks.find((b) => b.group.id === group.id)?.categories ?? cats;
              const total = all.reduce((s, c) => s + (totals[c.id] ?? 0), 0);
              const budget = budgets[group.id] ?? (all.some((c) => budgets[c.id]) ? all.reduce((s, c) => s + (budgets[c.id] ?? 0), 0) : null);
              const hasBudget = budget != null && group.group !== "income";
              const meta = [t("categoryCount", { count: all.length }), hasBudget ? t("ofBudget", { amount: formatEurWhole(budget) }) : null].filter(Boolean).join(" · ");
              const over = hasBudget && total > budget;
              const listId = `cat-group-${group.id}`;
              return (
                <section key={group.id} aria-label={group.name} className="border-t border-clear-ground py-1.5 first-of-type:border-t-0">
                  <div className={cn(ROW_GRID, "min-h-[60px] rounded-clear-row px-2 transition-colors hover:bg-clear-tile")}>
                    <button
                      type="button"
                      onClick={() => toggle(group.id)}
                      aria-expanded={!isCollapsed}
                      aria-controls={listId}
                      disabled={!!query}
                      className="col-span-2 flex min-w-0 cursor-pointer items-center gap-3 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-clear-ember/50 disabled:cursor-default @2xl:col-span-4"
                    >
                      <Icon iconKey={group.icon} color={group.color} soft size="md" />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex min-w-0 items-center gap-1.5 text-base font-extrabold">
                          <span className="truncate">{group.name}</span>
                          <IconChevronDown aria-hidden size={16} stroke={2.2} className={cn("shrink-0 text-clear-muted transition-transform", isCollapsed && "-rotate-90")} />
                        </span>
                        <span className="truncate text-[13px] text-clear-muted"><MoneyText>{meta}</MoneyText></span>
                      </span>
                    </button>
                    <Amount value={total} sign="none" className={cn("text-right text-[17px]", over && "text-clear-ember-text")} />
                    <RowIconButton label={t("editGroup", { name: group.name })} onClick={() => { setGroupEdit({ group, count: all.length }); setGroupOpen(true); }}>
                      <IconPencil stroke={2} />
                    </RowIconButton>
                  </div>

                  <div id={listId} hidden={isCollapsed} className="flex flex-col">
                    {cats.map((cat) => {
                      const chip = chipFor(cat);
                      const rules = rulesByCat[cat.id]?.length ?? 0;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => { setDetail(cat); setDetailOpen(true); }}
                          className={cn(ROW_GRID, "min-h-[52px] w-full cursor-pointer rounded-clear-row px-2 py-1 text-left transition-colors outline-none hover:bg-clear-tile focus-visible:ring-3 focus-visible:ring-clear-ember/50")}
                        >
                          <span className="flex justify-center"><Icon iconKey={cat.icon} color={group.color} soft size="sm" /></span>
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-[15px] font-semibold">{cat.name}</span>
                            <span className="truncate text-[13px] text-clear-muted @2xl:hidden">{[chip?.label, t("ruleCount", { count: rules })].filter(Boolean).join(" · ")}</span>
                          </span>
                          <span className="hidden @2xl:block">{chip && <ClearChip tone={chip.tone}>{chip.label}</ClearChip>}</span>
                          <span className="hidden text-right text-[13px] font-semibold text-clear-muted @2xl:block">{rules === 0 ? t("noRulesShort") : rules}</span>
                          <Amount value={totals[cat.id] ?? 0} sign="none" className="text-right text-[15px]" />
                          <IconChevronRight aria-hidden size={18} stroke={2} className="justify-self-center text-clear-placeholder" />
                        </button>
                      );
                    })}
                    <NewCategoryButton
                      categories={categories}
                      banks={banks}
                      defaultParentId={group.id}
                      className={cn(ROW_GRID, "min-h-[52px] w-full cursor-pointer rounded-clear-row px-2 py-1 text-left text-[15px] font-bold text-clear-muted transition-colors hover:bg-clear-tile")}
                    >
                      <span aria-hidden className="flex justify-center">
                        <span className="inline-flex size-9 items-center justify-center rounded-clear-icon border-2 border-dashed border-clear-line">
                          <IconPlus size={16} stroke={2.2} />
                        </span>
                      </span>
                      <span className="col-span-3 truncate @2xl:col-span-5">{t("addCategoryTo", { group: group.name })}</span>
                    </NewCategoryButton>
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* What the rules do with all this. */}
        <div className="flex items-center gap-3.5 rounded-clear-tile bg-clear-tile px-4 py-3.5">
          <IconTile size="md" className="bg-clear-card"><IconFilter stroke={1.9} /></IconTile>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-bold">{t("rulesSummary", { count: ruleCount })}</span>
            <span className="text-[13px] text-clear-muted">{t("rulesSummaryHint")}</span>
          </span>
        </div>

        <ClearButton variant="danger" size="sm" className="self-start" onClick={resetToDefaults} disabled={resetting}>
          {resetting ? t("resetting") : t("reset")}
        </ClearButton>
      </div>

      {/* Groups are new: point them out, also to someone who dismissed tips before. */}
      {blocks.length > 0 && <AnchoredTip id="categoryGroups" anchor="categoryGroups" />}

      <EditCategoryDialog open={detailOpen} onClose={() => setDetailOpen(false)}>
        {detail && (
          <EditCategoryForm
            key={detail.id}
            category={detail}
            rules={rulesByCat[detail.id] ?? []}
            banks={banks}
            categories={categories}
            onClose={() => setDetailOpen(false)}
          />
        )}
      </EditCategoryDialog>

      <GroupDialog open={groupOpen} onClose={() => setGroupOpen(false)} group={groupEdit?.group ?? null} categoryCount={groupEdit?.count ?? 0} />
    </>
  );
}
