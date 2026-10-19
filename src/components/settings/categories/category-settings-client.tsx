"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconTrash } from "@tabler/icons-react";
import type { Category, CategoryRule, Bank } from "@/db/schema";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { Icon } from "@/components/icon";
import { RuleDialog, emptyRuleDraft, ruleDraftFromRule, type RuleDraft, type RuleFields } from "@/components/rule-dialog";
import { IconPickerField } from "@/components/icon-picker";
import { PickerField } from "@/components/picker-field";
import { ClearButton } from "@/components/clear/button";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField, ClearInput } from "@/components/clear/field";
import { SettingsNotice } from "@/components/settings/settings-ui";
import { BudgetTypeField, CategoryRuleList, GroupField, nameConflictFrom, useNameConflictMessage } from "@/components/settings/categories/category-form-parts";
import { findNameConflict, type NameConflict } from "@/lib/category-name-conflict";
import { normalizeBudgetType } from "@/lib/format";

/**
 * The Edit category dialog — the same centred modal (bottom sheet on phones) and
 * layout as New category. Opened from the Categories settings panel and from a
 * category's detail popup; the caller puts an EditCategoryForm (or a loading line)
 * inside it.
 */
export function EditCategoryDialog({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const t = useTranslations("settings.categories");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent hideHeaderRow title={t("editTitle")} className="gap-[18px] pt-6 font-clear text-clear-ink" sheetClassName="lg:max-w-[600px]">
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** The category editor: name, group, budget type, icon (the colour is the group's) and
 *  the automatic rules (saved as you go), with Delete, Cancel and Save at the bottom. */
export function EditCategoryForm({
  category,
  rules: initialRules,
  banks,
  categories,
  onClose,
}: {
  category: Category;
  rules: CategoryRule[];
  banks: Bank[];
  categories: Category[];
  onClose: () => void;
}) {
  const router = useRouter();
  const t = useTranslations("settings.categories");
  const tRule = useTranslations("activity.rule");
  const confirm = useConfirm();
  const ids = useId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(category.name ?? "");
  const [budgetType, setBudgetType] = useState<string>(normalizeBudgetType(category.budgetType) || "willen");
  const [icon, setIcon] = useState<string | null>(category.icon ?? null);
  const [groupId, setGroupId] = useState<number | null>(category.parentCategoryId ?? null);
  const group = categories.find((c) => c.id === groupId && c.isGroup);
  const effectiveColor = group?.color ?? category.color;
  const isIncome = (group ? group.group : category.group) === "income";

  const [rules, setRules] = useState<CategoryRule[]>(initialRules);

  // A name already used in this kind (the kind follows the group when it moves) is
  // flagged while typing; the API's 409 is the fallback.
  const describeConflict = useNameConflictMessage();
  const [serverConflict, setServerConflict] = useState<NameConflict | null>(null);
  const kind = group && group.id !== category.parentCategoryId ? group.group : category.group;
  const localConflict = findNameConflict(categories, { name, kind, excludeId: category.id });
  const nameError = describeConflict(localConflict ?? serverConflict);

  async function save() {
    if (!name.trim() || groupId == null || nameError) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: category.id, name: name.trim(), budgetType, icon, parentCategoryId: groupId }),
    }).catch(() => null);
    setLoading(false);
    if (!res?.ok) {
      const conflict = await nameConflictFrom(res);
      if (conflict) setServerConflict(conflict);
      else setError(t("saveError"));
      return;
    }
    router.refresh();
    onClose();
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
    onClose();
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
    <>
      <ClearDialogHeader
        title={shownName}
        subtitle={[group?.name, isIncome ? t("kindIncome") : t(`budgetTypes.${(["nodig", "willen", "sparen"].includes(budgetType) ? budgetType : "willen") as "willen"}`), t("ruleCount", { count: rules.length })].filter(Boolean).join(" · ")}
        icon={<Icon iconKey={icon} color={effectiveColor} soft size="md" />}
        onClose={onClose}
        closeLabel={t("close")}
      />

      <ClearField label={t("name")} htmlFor={`${ids}-name`} error={nameError}>
        <ClearInput id={`${ids}-name`} value={name} onChange={(e) => { setName(e.target.value); setServerConflict(null); }} placeholder={t("namePlaceholder")} autoComplete="off" aria-invalid={nameError ? true : undefined} />
      </ClearField>

      <GroupField id={`${ids}-group`} categories={categories} value={groupId} onChange={(id) => { setGroupId(id); setServerConflict(null); }} />

      {!isIncome && <BudgetTypeField value={budgetType} onChange={setBudgetType} />}

      <div className="flex flex-col gap-2.5">
        <div className="rounded-clear-tile bg-clear-tile px-4 py-3">
          <PickerField label={t("icon")}>
            <IconPickerField subject={{ kind: "category", name: shownName, id: category.id }} value={{ icon, color: effectiveColor }} withColor={false} onChange={(c) => setIcon(c.icon)} />
          </PickerField>
        </div>
        {group && <p className="m-0 text-[13px] text-clear-muted">{t("colorFromGroup", { group: group.name })}</p>}
      </div>

      <section aria-labelledby={`${ids}-rules`} className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 id={`${ids}-rules`} className="m-0 text-[15px] font-bold">{t("rulesTitle")}</h3>
          <p className="m-0 text-[13px] text-clear-muted">{t("rulesHint", { name: shownName })}</p>
        </div>
        <CategoryRuleList rules={rules} banks={banks} onAdd={() => openRule(null)} onEdit={openRule} onDelete={deleteRule} />
      </section>

      {error && <SettingsNotice>{error}</SettingsNotice>}

      <div className="border-t border-clear-ground pt-[18px] pb-1">
        <ClearDialogFooter
          destructive={
            <ClearButton variant="danger" onClick={remove} disabled={loading}>
              <IconTrash aria-hidden />
              {t("delete")}
            </ClearButton>
          }
        >
          <ClearButton variant="secondary" onClick={onClose}>{t("cancel")}</ClearButton>
          <ClearButton onClick={save} disabled={loading || !name.trim() || groupId == null || !!nameError}>
            {loading ? t("saving") : t("save")}
          </ClearButton>
        </ClearDialogFooter>
      </div>

      {/* Inside the content so it stacks as a nested sheet over this one. */}
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
    </>
  );
}
