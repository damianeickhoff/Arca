"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconChevronRight, IconFilter, IconPlus, IconTag } from "@tabler/icons-react";
import { Icon } from "@/components/icon";
import { ListRow } from "@/components/clear/list-row";
import { IconTile } from "@/components/clear/icon-tile";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { ClearButton } from "@/components/clear/button";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { NewCategoryButton } from "@/components/settings/categories/category-client";
import { CategorySettingsClient } from "@/components/settings/categories/category-settings-client";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import { SettingsEmpty, SettingsNotice, SettingsSearch } from "@/components/settings/settings-ui";
import { groupCategoriesByParent, resolveCategoryColor } from "@/lib/category-tree";
import { normalizeBudgetType } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SHEET_COLUMN } from "@/components/page-container";
import type { Category, CategoryRule, Bank } from "@/db/schema";

interface Props {
  categories: Category[];
  rulesByCat: Record<number, CategoryRule[]>;
  banks: Bank[];
}

/** The Categories settings panel: a search, every category grouped under its parent
 *  (a row opens the editor), and in edit mode Add subcategory rows and Reset. */
export function CategoriesClient({ categories, rulesByCat, banks }: Props) {
  const router = useRouter();
  const t = useTranslations("settings.categories");
  const tPanels = useTranslations("settings.panels");
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wipes every category and re-seeds src/config/categories.ts. Only reachable from
  // edit mode, since it throws away all custom categories.
  async function resetToDefaults() {
    const ok = await confirm({
      title: t("resetTitle"),
      body: t("resetBody"),
      confirmLabel: t("resetConfirm"),
      destructive: true,
    });
    if (!ok) return;
    setResetting(true);
    setError(null);
    const res = await fetch("/api/categories/reset", { method: "POST" }).catch(() => null);
    setResetting(false);
    if (!res?.ok) {
      setError(t("resetError"));
      return;
    }
    setEditMode(false);
    router.refresh();
  }

  // Drill-down into a single category's editor, shown as a slide-over *inside* the
  // panel (not a route) so its Back returns here. `detail` is the selected category;
  // `detailVisible` drives the slide so it can animate out before unmounting.
  const [detail, setDetail] = useState<Category | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  function openDetail(cat: Category) {
    setDetail(cat);
    requestAnimationFrame(() => setDetailVisible(true));
  }
  function closeDetail() {
    setDetailVisible(false);
    setTimeout(() => setDetail(null), 300);
  }

  const { topLevel, childrenByParentId } = groupCategoriesByParent(categories);
  const query = search.trim().toLowerCase();
  const searchResults = query ? categories.filter((c) => c.name.toLowerCase().includes(query)) : [];
  const ruleCount = Object.values(rulesByCat).reduce((n, list) => n + list.length, 0);

  function budgetLabel(cat: Category) {
    const key = normalizeBudgetType(cat.budgetType);
    return key === "nodig" || key === "willen" || key === "sparen" ? t(`budgetTypes.${key}`) : null;
  }

  function row(cat: Category, child = false) {
    const children = childrenByParentId.get(cat.id) ?? [];
    const meta = [budgetLabel(cat), !child && children.length > 0 ? t("subcategoryCount", { count: children.length }) : null]
      .filter(Boolean)
      .join(" · ");
    return (
      <ListRow
        key={cat.id}
        onClick={() => openDetail(cat)}
        className={cn(child && "min-h-14 pl-9")}
        icon={<Icon iconKey={cat.icon} color={resolveCategoryColor(cat, categories)} soft size={child ? "sm" : "md"} />}
        title={cat.name}
        meta={meta || undefined}
        trailing={<IconChevronRight aria-hidden size={18} stroke={2} className="shrink-0 text-clear-placeholder" />}
      />
    );
  }

  return (
    <>
      <PanelHeader
        title={tPanels("categories.title")}
        action={
          <>
            {editMode && (
              <ClearButton variant="danger" size="sm" onClick={resetToDefaults} disabled={resetting}>
                {resetting ? t("resetting") : t("reset")}
              </ClearButton>
            )}
            <ClearButton variant="secondary" size="sm" onClick={() => setEditMode((m) => !m)} aria-pressed={editMode}>
              {editMode ? t("done") : t("edit")}
            </ClearButton>
            <NewCategoryButton categories={categories} banks={banks} ariaLabel={t("new")} className={clearButtonVariants({ size: "sm" })}>
              <IconPlus aria-hidden stroke={2.2} />
              <span aria-hidden className="hidden sm:inline">{t("new")}</span>
            </NewCategoryButton>
          </>
        }
      />

      <div className="flex flex-col gap-5 px-4 pt-1 pb-8 font-clear text-clear-ink">
        <SettingsSearch value={search} onChange={setSearch} placeholder={t("search")} label={t("search")} />

        {error && <SettingsNotice>{error}</SettingsNotice>}

        {query ? (
          searchResults.length === 0 ? (
            <SettingsEmpty icon={<IconTag stroke={1.9} />}>{t("noMatch")}</SettingsEmpty>
          ) : (
            <div className="flex flex-col">{searchResults.map((cat) => row(cat))}</div>
          )
        ) : topLevel.length === 0 ? (
          <SettingsEmpty
            icon={<IconTag stroke={1.9} />}
            action={
              <NewCategoryButton categories={categories} banks={banks} className={clearButtonVariants({ size: "sm" })}>
                <IconPlus aria-hidden stroke={2.2} />
                {t("new")}
              </NewCategoryButton>
            }
          >
            {t("empty")}
          </SettingsEmpty>
        ) : (
          <div className="grid items-start gap-x-8 gap-y-5 xl:grid-cols-2">
            {topLevel.map((parent) => {
              const children = childrenByParentId.get(parent.id) ?? [];
              return (
                <section key={parent.id} aria-label={parent.name} className="flex flex-col">
                  {row(parent)}
                  {children.map((child) => row(child, true))}
                  {editMode && (
                    <NewCategoryButton
                      categories={categories}
                      banks={banks}
                      defaultParentId={parent.id}
                      className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-clear-row pr-2 pl-9 text-left text-[15px] font-bold text-clear-ink-2 transition-colors hover:bg-clear-tile"
                    >
                      <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-clear-icon border-2 border-dashed border-clear-line">
                        <IconPlus size={16} stroke={2.2} />
                      </span>
                      <span className="flex-1">{t("addSubcategory", { parent: parent.name })}</span>
                    </NewCategoryButton>
                  )}
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
      </div>

      {/* Category editor — slid over the list. `fixed inset-0` so it covers the whole
          sheet (on the /settings page, the panel card); its own Back calls closeDetail,
          which returns here rather than popping browser history. Keyed by id so
          switching categories reseeds the form. */}
      {detail && (
        <div
          // `fixed inset-0` escapes the sheet it covers, so it carries the column cap
          // itself to stay aligned with that sheet on desktop.
          className={cn(SHEET_COLUMN, "fixed inset-0 z-[70] flex flex-col overflow-y-auto rounded-t-clear-card bg-clear-card transition-transform duration-300 ease-out lg:rounded-clear-card")}
          style={{ transform: detailVisible ? "translateX(0)" : "translateX(100%)" }}
        >
          <CategorySettingsClient
            key={detail.id}
            category={detail}
            rules={rulesByCat[detail.id] ?? []}
            banks={banks}
            categories={categories}
            onClose={closeDetail}
          />
        </div>
      )}
    </>
  );
}
