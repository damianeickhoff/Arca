"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { Category, CategoryRule, Bank } from "@/db/schema";
import { IconPickerField } from "@/components/icon-picker";
import { PickerField } from "@/components/picker-field";
import { Icon } from "@/components/icon";
import { ClearButton } from "@/components/clear/button";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField, ClearInput } from "@/components/clear/field";
import { SettingsNotice } from "@/components/settings/settings-ui";
import { BudgetTypeField, CategoryRuleList, GroupField, groupDefaultBudgetType, nameConflictFrom, useNameConflictMessage } from "@/components/settings/categories/category-form-parts";
import { findNameConflict, type NameConflict } from "@/lib/category-name-conflict";
import { RuleDialog, emptyRuleDraft, ruleDraftFromRule, type RuleDraft, type RuleFields } from "@/components/rule-dialog";

/**
 * A button (its look comes from `className` / `children`) that opens the New category
 * dialog: name, group, budget type, icon, and rules — staged here and created once the
 * category itself is saved. `defaultParentId` pre-picks the group ("Add a category to
 * Housing"). The colour is always the group's.
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

  const groupById = (id: number | null) => (id != null ? categories.find((c) => c.id === id && c.isGroup) : undefined);

  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState<number | null>(groupById(defaultParentId)?.id ?? null);
  const group = groupById(groupId);
  // Starts at the group's budget type and follows the group until picked by hand.
  const [budgetType, setBudgetType] = useState<string>(groupDefaultBudgetType(group));
  const [typeTouched, setTypeTouched] = useState(false);
  const [icon, setIcon] = useState<string | null>(null);
  const effectiveColor = group?.color ?? null;
  const isIncome = group?.group === "income";

  // A name already used in this kind is flagged while typing; the API's 409 is the
  // fallback for a clash this list didn't know about yet.
  const describeConflict = useNameConflictMessage();
  const [serverConflict, setServerConflict] = useState<NameConflict | null>(null);
  const localConflict = group ? findNameConflict(categories, { name, kind: group.group }) : null;
  const nameError = describeConflict(localConflict ?? serverConflict);

  function pickGroup(id: number) {
    setServerConflict(null);
    setGroupId(id);
    if (!typeTouched) setBudgetType(groupDefaultBudgetType(groupById(id)));
  }

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
    if (!name.trim() || groupId == null || nameError) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), budgetType, icon, parentCategoryId: groupId }),
      });
      if (!res.ok) {
        const conflict = await nameConflictFrom(res);
        if (conflict) {
          setServerConflict(conflict);
          return;
        }
        throw new Error(String(res.status));
      }
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

      <ClearField label={t("name")} htmlFor={`${ids}-name`} error={nameError}>
        <ClearInput id={`${ids}-name`} autoFocus value={name} onChange={(e) => { setName(e.target.value); setServerConflict(null); }} placeholder={t("namePlaceholder")} autoComplete="off" aria-invalid={nameError ? true : undefined} />
      </ClearField>

      <GroupField id={`${ids}-group`} categories={categories} value={groupId} onChange={pickGroup} />

      {!isIncome && <BudgetTypeField value={budgetType} onChange={(v) => { setBudgetType(v); setTypeTouched(true); }} />}

      <div className="flex flex-col gap-2.5">
        <div className="rounded-clear-tile bg-clear-tile px-4 py-3">
          <PickerField label={t("icon")}>
            <IconPickerField subject={{ kind: "category", name: name.trim() }} value={{ icon, color: effectiveColor }} withColor={false} onChange={(c) => setIcon(c.icon)} />
          </PickerField>
        </div>
        {group && <p className="m-0 text-[13px] text-clear-muted">{t("colorFromGroup", { group: group.name })}</p>}
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
          <ClearButton onClick={save} disabled={busy || !name.trim() || groupId == null || !!nameError}>
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
