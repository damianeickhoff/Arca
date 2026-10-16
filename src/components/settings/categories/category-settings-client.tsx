"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { acquireNavHidden } from "@/lib/nav-visibility";
import { IconChevronLeft, IconChevronRight, IconPencil, IconTrash } from "@tabler/icons-react";
import type { Category, CategoryRule, Bank } from "@/db/schema";
import { Icon, isBrandIcon } from "@/components/icon";
import { RuleDialog, emptyRuleDraft, ruleDraftFromRule, type RuleDraft, type RuleFields } from "@/components/rule-dialog";
import { ColorPicker } from "@/components/color-picker";
import { IconPicker } from "@/components/icon-picker";
import { PickerField } from "@/components/picker-field";
import { ClearButton } from "@/components/clear/button";
import { ClearChip } from "@/components/clear/chip";
import { ClearField, ClearInput } from "@/components/clear/field";
import { ClearSelect } from "@/components/settings/accounts/clear-select";
import { FIELD_LABEL } from "@/app/settings/account-edit-dialogs";
import { SettingsNotice, SettingsSection } from "@/components/settings/settings-ui";
import { BudgetTypeField, CategoryRuleList, DEFAULT_CATEGORY_COLOR } from "@/components/settings/categories/category-form-parts";
import { cn } from "@/lib/utils";
import { normalizeBudgetType } from "@/lib/format";

interface Props {
  category: Category;
  rules: CategoryRule[];
  banks: Bank[];
  categories: Category[];
  // Embedded (the categories list's slide-over, the category detail popup's edit
  // sheet) the host supplies a close callback; the standalone
  // /settings/categories/[id] route leaves via history instead.
  onClose?: () => void;
}

/** The category editor: name, icon and colour, parent, budget type and the automatic
 *  rules, with Delete, Cancel and Save at the bottom. */
export function CategorySettingsClient({ category, rules: initialRules, banks, categories, onClose }: Props) {
  const router = useRouter();
  const t = useTranslations("settings.categories");
  const tRule = useTranslations("activity.rule");
  const confirm = useConfirm();
  const ids = useId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iconOpen, setIconOpen] = useState(false);
  const standalone = !onClose;

  // Route mode leaves this screen via history; embedded mode dismisses the slide-over.
  const close = onClose ?? (() => router.back());

  // A category can only become a parent if it doesn't itself have one (max 2 levels).
  const parentOptions = categories.filter((c) => c.parentCategoryId === null && c.id !== category.id);
  // A category that already has sub-categories can't be nested under another.
  const children = categories.filter((c) => c.parentCategoryId === category.id);

  const parentColorFor = (pid: number | null) => (pid != null ? categories.find((c) => c.id === pid)?.color ?? null : null);

  const [name, setName] = useState(category.name ?? "");
  const [budgetType, setBudgetType] = useState<string>(normalizeBudgetType(category.budgetType) || "willen");
  const [color, setColor] = useState(category.color ?? DEFAULT_CATEGORY_COLOR);
  const [icon, setIcon] = useState<string | null>(category.icon ?? null);
  const [parentId, setParentId] = useState<number | null>(category.parentCategoryId ?? null);

  // A sub-category inherits its parent's colour: the colour picker is hidden and the
  // parent's colour is what previews and gets saved.
  const isSubcategory = parentId != null;
  const effectiveColor = isSubcategory ? parentColorFor(parentId) ?? color : color;

  const [rules, setRules] = useState<CategoryRule[]>(initialRules);

  // Hide the bottom nav on the standalone page so the sticky footer isn't covered by
  // it. Embedded, the host's sheet already covers the nav.
  useEffect(() => {
    if (onClose) return;
    return acquireNavHidden();
  }, [onClose]);

  async function save() {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: category.id, name: name.trim(), budgetType, icon, parentCategoryId: parentId, color: effectiveColor || null }),
    }).catch(() => null);
    setLoading(false);
    if (!res?.ok) {
      setError(t("saveError"));
      return;
    }
    // The list restores its prior scroll position itself; refresh re-renders it (route
    // mode remounts, embedded mode gets fresh props).
    router.refresh();
    close();
  }

  async function remove() {
    const ok = await confirm({
      title: t("deleteTitle", { name: category.name }),
      body: t("deleteBody"),
      confirmLabel: t("deleteConfirm"),
      destructive: true,
    });
    if (!ok) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/categories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: category.id }),
    }).catch(() => null);
    if (!res?.ok) {
      setLoading(false);
      setError(t("deleteError"));
      return;
    }
    router.refresh();
    close();
  }

  // ─── Rules ────────────────────────────────────────────────────────────────
  // The rule being added (id null) or edited; kept after closing for the exit animation.
  const [ruleEditor, setRuleEditor] = useState<{ id: number | null; draft: RuleDraft } | null>(null);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);

  function openRule(rule: CategoryRule | null) {
    setRuleEditor({ id: rule?.id ?? null, draft: rule ? ruleDraftFromRule(rule) : emptyRuleDraft(category.id) });
    setRuleDialogOpen(true);
  }

  async function saveRule(fields: RuleFields) {
    const id = ruleEditor?.id ?? null;
    setError(null);
    const res = await fetch("/api/category-rules", {
      method: id == null ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id == null ? { categoryId: category.id, ...fields } : { id, ...fields }),
    }).catch(() => null);
    if (!res?.ok) {
      setError(t("ruleSaveError"));
      setRuleDialogOpen(false);
      return;
    }
    const saved: CategoryRule = await res.json();
    setRules((r) => (id == null ? [...r, saved] : r.map((x) => (x.id === id ? saved : x))));
    setRuleDialogOpen(false);
    await fetch("/api/apply-rules", { method: "POST" });
    router.refresh();
  }

  async function deleteRule(rule: CategoryRule) {
    const previous = rules;
    setRules((r) => r.filter((x) => x.id !== rule.id));
    setError(null);
    const res = await fetch("/api/category-rules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id }),
    }).catch(() => null);
    if (!res?.ok) {
      setRules(previous);
      setError(t("ruleDeleteError"));
      return;
    }
    router.refresh();
  }

  const shownName = name.trim() || category.name;

  return (
    <div className={cn("flex flex-col font-clear text-clear-ink", standalone ? "px-4 pt-[calc(var(--sat,0px)+16px)] pb-12 lg:px-8 lg:pt-7" : "min-h-full")}>
      <div className={cn("flex flex-1 flex-col", standalone && "rounded-clear-card bg-clear-card")}>
        {/* Header: back + where this is */}
        <div className={cn("flex items-center gap-3 px-4 pb-2", standalone ? "pt-5" : "pt-[calc(var(--sat,0px)+20px)] lg:pt-6")}>
          <button
            type="button"
            onClick={close}
            aria-label={t("back")}
            className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-clear-tile text-clear-ink transition-colors hover:bg-clear-line"
          >
            <IconChevronLeft size={20} stroke={2.2} aria-hidden />
          </button>
          <nav aria-label={t("breadcrumb")} className="min-w-0 flex-1">
            <ol className="m-0 flex min-w-0 list-none items-center gap-1.5 p-0 text-sm font-bold text-clear-muted">
              <li className="shrink-0">{t("listTitle")}</li>
              <li aria-hidden><IconChevronRight size={14} stroke={2.2} /></li>
              <li aria-current="page" className="truncate text-clear-ink">{shownName}</li>
            </ol>
          </nav>
        </div>

        {/* Hero: the icon (tap to change it), name and what it is */}
        <div className="flex items-center gap-4 px-4 pt-3 pb-5">
          <button
            type="button"
            onClick={() => setIconOpen(true)}
            aria-label={t("changeIcon")}
            className="relative shrink-0 cursor-pointer rounded-clear-tile outline-none transition-transform focus-visible:ring-3 focus-visible:ring-clear-ember/50 active:scale-95"
          >
            <Icon iconKey={icon} color={effectiveColor} soft size="xl" />
            <span aria-hidden className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full bg-clear-primary text-clear-primary-ink">
              <IconPencil size={13} stroke={2.2} />
            </span>
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h2 className="m-0 truncate text-[24px] font-extrabold tracking-[-0.02em]">{shownName}</h2>
            <div className="flex flex-wrap gap-1.5">
              <ClearChip tone={budgetType === "nodig" ? "sky" : budgetType === "sparen" ? "mint" : "peach"}>
                {t(`budgetTypes.${(["nodig", "willen", "sparen"].includes(budgetType) ? budgetType : "willen") as "willen"}`)}
              </ClearChip>
              <ClearChip tone="stone">{t("ruleCount", { count: rules.length })}</ClearChip>
              {children.length > 0 && <ClearChip tone="stone">{t("subcategoryCount", { count: children.length })}</ClearChip>}
            </div>
          </div>
          {/* Controlled — opened by tapping the icon above. */}
          <IconPicker value={icon} onChange={setIcon} previewColor={effectiveColor} hideBrandTab open={iconOpen} onOpenChange={setIconOpen} hideDefaultTrigger />
        </div>

        <div className="flex flex-1 flex-col gap-7 px-4 pb-6">
          <SettingsSection title={t("appearance")} subtitle={t("appearanceHint")}>
            <ClearField label={t("name")} htmlFor={`${ids}-name`}>
              <ClearInput id={`${ids}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} autoComplete="off" />
            </ClearField>
            <div className="flex flex-col gap-2.5">
              <div className="rounded-clear-tile bg-clear-tile px-4 py-3">
                <PickerField label={t("icon")}>
                  <ClearButton variant="surface" size="sm" onClick={() => setIconOpen(true)}>{t("changeIcon")}</ClearButton>
                </PickerField>
              </div>
              {!isSubcategory && !(icon && isBrandIcon(icon)) && (
                <div className="rounded-clear-tile bg-clear-tile px-4 py-3">
                  <PickerField label={t("color")}>
                    <ColorPicker value={color} onChange={setColor} previewIcon={icon} />
                  </PickerField>
                </div>
              )}
              {isSubcategory && <p className="m-0 text-[13px] text-clear-muted">{t("colorFromParent")}</p>}
            </div>
            {parentOptions.length > 0 && children.length === 0 && (
              <div className="flex flex-col gap-1.5">
                <span id={`${ids}-parent`} className={FIELD_LABEL}>{t("parent")}</span>
                <ClearSelect
                  ariaLabelledBy={`${ids}-parent`}
                  value={parentId}
                  onChange={(pid) => {
                    setParentId(pid);
                    if (pid != null) setColor(parentColorFor(pid) ?? color);
                  }}
                  options={[{ value: null, label: t("noParent") }, ...parentOptions.map((c) => ({ value: c.id as number | null, label: c.name }))]}
                />
              </div>
            )}
          </SettingsSection>

          <SettingsSection title={t("budget")} subtitle={t("budgetHint")}>
            <BudgetTypeField value={budgetType} onChange={setBudgetType} />
          </SettingsSection>

          <SettingsSection title={t("rulesTitle")} subtitle={t("rulesHint", { name: shownName })}>
            <CategoryRuleList rules={rules} banks={banks} onAdd={() => openRule(null)} onEdit={openRule} onDelete={deleteRule} />
          </SettingsSection>

          {error && <SettingsNotice>{error}</SettingsNotice>}
        </div>

        {/* Footer */}
        <div className={cn("sticky bottom-0 z-10 border-t border-clear-ground bg-clear-card px-4 pt-3", standalone ? "rounded-b-clear-card pb-4" : "pb-[calc(1rem+var(--sab,0px))]")}>
          <div className="flex flex-wrap items-center gap-2.5">
            <ClearButton variant="danger" onClick={remove} disabled={loading}>
              <IconTrash aria-hidden />
              {t("delete")}
            </ClearButton>
            <span className="flex-1" />
            <ClearButton variant="secondary" onClick={close}>{t("cancel")}</ClearButton>
            <ClearButton onClick={save} disabled={loading || !name.trim()}>
              {loading ? t("saving") : t("save")}
            </ClearButton>
          </div>
        </div>
      </div>

      <RuleDialog
        open={ruleDialogOpen}
        onOpenChange={setRuleDialogOpen}
        initial={ruleEditor?.draft ?? null}
        title={ruleEditor?.id == null ? tRule("titleNew") : tRule("titleEdit")}
        category={{ name: shownName, icon, color: effectiveColor }}
        banks={banks}
        submitLabel={tRule("save")}
        onSubmit={saveRule}
      />
    </div>
  );
}
