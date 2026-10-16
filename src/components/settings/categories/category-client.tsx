"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { Category, CategoryRule, Bank } from "@/db/schema";
import { ColorPicker } from "@/components/color-picker";
import { IconPicker } from "@/components/icon-picker";
import { PickerField } from "@/components/picker-field";
import { Icon, isBrandIcon } from "@/components/icon";
import { ClearButton } from "@/components/clear/button";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField, ClearInput } from "@/components/clear/field";
import { ClearSelect } from "@/components/settings/accounts/clear-select";
import { FIELD_LABEL } from "@/app/settings/account-edit-dialogs";
import { SettingsNotice } from "@/components/settings/settings-ui";
import { BudgetTypeField, CategoryRuleList, DEFAULT_CATEGORY_COLOR } from "@/components/settings/categories/category-form-parts";
import { RuleDialog, emptyRuleDraft, ruleDraftFromRule, type RuleDraft, type RuleFields } from "@/components/rule-dialog";

/**
 * A button (its look comes from `className` / `children`) that opens the New category
 * dialog: name, budget type, parent, icon and colour, and rules — staged here and
 * created once the category itself is saved. `defaultParentId` pre-picks the parent
 * ("Add subcategory").
 */
export function NewCategoryButton({
  categories,
  banks,
  defaultParentId = null,
  className,
  ariaLabel,
  children,
}: {
  categories: Category[];
  banks: Bank[];
  defaultParentId?: number | null;
  className?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("settings.categories");
  const [open, setOpen] = useState(false);
  // Bumped per opening, so every opening starts from a blank form.
  const [session, setSession] = useState(0);

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => { setSession((n) => n + 1); setOpen(true); }}
        className={className}
      >
        {children}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent hideHeaderRow title={t("newTitle")} className="gap-[18px] pt-6 font-clear text-clear-ink" sheetClassName="lg:max-w-[600px]">
          <NewCategoryForm
            key={session}
            categories={categories}
            banks={banks}
            defaultParentId={defaultParentId}
            onClose={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function NewCategoryForm({
  categories,
  banks,
  defaultParentId,
  onClose,
}: {
  categories: Category[];
  banks: Bank[];
  defaultParentId: number | null;
  onClose: () => void;
}) {
  const t = useTranslations("settings.categories");
  const tRule = useTranslations("activity.rule");
  const router = useRouter();
  const ids = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A category can only become a parent if it doesn't itself have one (max 2 levels).
  const parentOptions = categories.filter((c) => c.parentCategoryId === null);
  const parentColorFor = (pid: number | null) => (pid != null ? categories.find((c) => c.id === pid)?.color ?? null : null);

  const [name, setName] = useState("");
  const [budgetType, setBudgetType] = useState<string>("willen");
  const [parentId, setParentId] = useState<number | null>(defaultParentId);
  const [icon, setIcon] = useState<string | null>(null);
  const [color, setColor] = useState(parentColorFor(defaultParentId) ?? DEFAULT_CATEGORY_COLOR);

  // A sub-category takes its colour from its parent — the colour picker is hidden and
  // the parent's colour is what gets saved, so all children read as one visual family.
  const isSubcategory = parentId != null;
  const effectiveColor = isSubcategory ? parentColorFor(parentId) ?? color : color;

  // Rules are staged here with a negative temp id and created once the category exists.
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const nextTempId = useRef(-1);
  const [ruleEditor, setRuleEditor] = useState<{ id: number | null; draft: RuleDraft } | null>(null);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);

  function openRule(rule: CategoryRule | null) {
    setRuleEditor({ id: rule?.id ?? null, draft: rule ? ruleDraftFromRule(rule) : emptyRuleDraft(null) });
    setRuleDialogOpen(true);
  }

  function saveRule(fields: RuleFields) {
    const id = ruleEditor?.id ?? null;
    setRules((r) =>
      id == null
        ? [...r, { id: nextTempId.current--, categoryId: -1, createdAt: null, ...fields }]
        : r.map((x) => (x.id === id ? { ...x, ...fields } : x)),
    );
    setRuleDialogOpen(false);
  }

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), budgetType, color: effectiveColor || null, icon, parentCategoryId: parentId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      if (rules.length > 0) {
        const created = await res.json();
        for (const rule of rules) {
          await fetch("/api/category-rules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              categoryId: created.id,
              namePattern: rule.namePattern,
              nameWildcard: rule.nameWildcard,
              nameWholeWord: rule.nameWholeWord,
              amount: rule.amount,
              amountMin: rule.amountMin,
              amountMax: rule.amountMax,
              direction: rule.direction,
              bankId: rule.bankId,
            }),
          });
        }
        await fetch("/api/apply-rules", { method: "POST" });
      }
      router.refresh();
      onClose();
    } catch {
      setError(t("createError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ClearDialogHeader
        title={t("newTitle")}
        subtitle={t("newSubtitle")}
        icon={<Icon iconKey={icon} color={effectiveColor} soft size="md" />}
        onClose={onClose}
        closeLabel={t("close")}
      />

      <ClearField label={t("name")} htmlFor={`${ids}-name`}>
        <ClearInput id={`${ids}-name`} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} autoComplete="off" />
      </ClearField>

      <BudgetTypeField value={budgetType} onChange={setBudgetType} />

      {parentOptions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span id={`${ids}-parent`} className={FIELD_LABEL}>{t("parent")}</span>
          <ClearSelect
            ariaLabelledBy={`${ids}-parent`}
            value={parentId}
            onChange={(pid) => {
              setParentId(pid);
              // Adopt the new parent's colour immediately so the icon preview matches.
              if (pid != null) setColor(parentColorFor(pid) ?? color);
            }}
            options={[{ value: null, label: t("noParent") }, ...parentOptions.map((c) => ({ value: c.id as number | null, label: c.name }))]}
          />
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <div className="rounded-clear-tile bg-clear-tile px-4 py-3">
          <PickerField label={t("icon")}>
            <IconPicker value={icon} onChange={setIcon} previewColor={effectiveColor} hideBrandTab />
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

      <section aria-labelledby={`${ids}-rules`} className="flex flex-col gap-2">
        <h3 id={`${ids}-rules`} className="m-0 text-[15px] font-bold">{t("rulesTitle")}</h3>
        <CategoryRuleList
          rules={rules}
          banks={banks}
          note={t("rulesStaged")}
          onAdd={() => openRule(null)}
          onEdit={openRule}
          onDelete={(rule) => setRules((r) => r.filter((x) => x.id !== rule.id))}
        />
      </section>

      {error && <SettingsNotice>{error}</SettingsNotice>}

      <div className="border-t border-clear-ground pt-[18px] pb-1">
        <ClearDialogFooter>
          <ClearButton variant="secondary" onClick={onClose}>{t("cancel")}</ClearButton>
          <ClearButton onClick={save} disabled={busy || !name.trim()}>
            {busy ? t("saving") : t("create")}
          </ClearButton>
        </ClearDialogFooter>
      </div>

      {/* Inside the content so it stacks as a nested sheet over this one. */}
      <RuleDialog
        open={ruleDialogOpen}
        onOpenChange={setRuleDialogOpen}
        initial={ruleEditor?.draft ?? null}
        title={ruleEditor?.id == null ? tRule("titleNew") : tRule("titleEdit")}
        category={{ name, icon, color: effectiveColor }}
        banks={banks}
        submitLabel={tRule("save")}
        onSubmit={saveRule}
      />
    </>
  );
}
