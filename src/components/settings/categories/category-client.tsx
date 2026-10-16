"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  IconPlusFilled as Plus,
  IconDotsVerticalFilled as EllipsisVertical,
  IconTrashFilled as Trash2,
  IconCheckFilled as Check,
  IconChevronDownFilled as ChevronDown
} from "@tabler/icons-react";
import type { Category, CategoryRule, Bank } from "@/db/schema";
import { ColorPicker } from "@/components/color-picker";
import { IconPicker } from "@/components/icon-picker";
import { PickerField } from "@/components/picker-field";
import { isBrandIcon } from "@/components/icon";
import { OptionDropdown } from "@/components/option-dropdown";
import { normalizeBudgetType, ruleAmountLabel } from "@/lib/format";
import { RuleDialog, emptyRuleDraft, ruleDraftFromRule, type RuleDraft, type RuleFields } from "@/components/rule-dialog";
import { MoneyText } from "@/components/clear/money";

interface AddProps { action: "add"; variant?: "default" | "icon" | "custom"; categories?: Category[]; onSave?: () => void; defaultParentId?: number | null; children?: React.ReactNode; className?: string }
interface EditProps { action: "edit"; category: Category; rules: CategoryRule[]; banks: Bank[]; categories?: Category[]; onSave?: () => void; open?: boolean; onOpenChange?: (v: boolean) => void }
type Props = AddProps | EditProps;

const PRESET_COLORS = [
  "#22c55e", "#3b82f6", "#ef4444", "#f97316", "#a855f7",
  "#14b8a6", "#f59e0b", "#6366f1", "#ec4899", "#64748b",
  "#0ea5e9", "#84cc16", "#e11d48", "#7c3aed", "#0d9488",
];

const BUDGET_TYPE_OPTIONS = [
  { value: "nodig",  label: "Needs" },
  { value: "willen", label: "Wants" },
  { value: "sparen", label: "Savings" },
];

export function CategoryClient(props: Props) {
  const router = useRouter();
  const t = useTranslations("settings.categories");
  const tRule = useTranslations("activity.rule");
  const confirm = useConfirm();
  const isEdit = props.action === "edit";
  const controlledOpen = isEdit ? props.open : undefined;
  const controlledOnOpenChange = isEdit ? props.onOpenChange : undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  function setOpen(v: boolean) { controlledOnOpenChange ? controlledOnOpenChange(v) : setInternalOpen(v); }
  const [loading, setLoading] = useState(false);
  const cat = isEdit ? props.category : null;
  const initialRules = isEdit ? props.rules : [];
  const banks = isEdit ? props.banks : [];
  const allCategories = props.categories ?? [];
  const defaultParentId = props.action === "add" ? props.defaultParentId ?? null : null;
  // A category can only become a parent if it doesn't itself have one (max 2 levels).
  const parentOptions = allCategories.filter((c) => c.parentCategoryId === null && c.id !== cat?.id);
  // A category that already has sub-categories can't be nested under another (max 2 levels).
  const hasChildren = isEdit && allCategories.some((c) => c.parentCategoryId === cat?.id);

  const parentColorFor = (pid: number | null) =>
    pid != null ? allCategories.find((c) => c.id === pid)?.color ?? null : null;

  const [form, setForm] = useState({
    name:             cat?.name             ?? "",
    budgetType:       normalizeBudgetType(cat?.budgetType) || "willen",
    color:            (cat?.parentCategoryId ?? defaultParentId) != null
                        ? parentColorFor(cat?.parentCategoryId ?? defaultParentId) ?? cat?.color ?? PRESET_COLORS[0]
                        : cat?.color ?? PRESET_COLORS[0],
    icon:             cat?.icon             ?? null as string | null,
    parentCategoryId: cat?.parentCategoryId ?? defaultParentId,
  });

  // A sub-category takes its colour from its parent — the colour picker is hidden and
  // the parent's colour is what gets saved, so all children read as one visual family.
  const isSubcategory = form.parentCategoryId != null;
  const effectiveColor = isSubcategory ? parentColorFor(form.parentCategoryId) ?? form.color : form.color;

  // Local copy of rules. In edit mode these are persisted immediately via API calls;
  // in add mode (no category id yet) they're staged here with a negative tempId and
  // only actually created once the category itself is saved.
  const [rules, setRules] = useState<CategoryRule[]>(initialRules);
  const [rulesOpen, setRulesOpen] = useState(false);
  const nextTempId = useRef(-1);

  // Always start collapsed each time the dialog is (re)opened, rather than remembering
  // whatever state it was left in from a previous open — adjust during render like the
  // pathname-close tracking elsewhere in this app, instead of an effect.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRulesOpen(false);
      // Reset the "add" form on each open so a freshly created category doesn't leave
      // the previous name/icon/color filled in the next time the dialog is opened.
      if (!isEdit) {
        setForm({
          name:             "",
          budgetType:       normalizeBudgetType(cat?.budgetType) || "willen",
          color:            parentColorFor(defaultParentId) ?? PRESET_COLORS[0],
          icon:             null,
          parentCategoryId: defaultParentId,
        });
        setRules([]);
      }
    }
  }

  // The rule being added (id null) or edited; kept after closing for the exit animation.
  const [ruleEditor, setRuleEditor] = useState<{ id: number | null; draft: RuleDraft } | null>(null);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setLoading(true);
    const payload = {
      ...form,
      color: (isSubcategory ? effectiveColor : form.color) || null,
    };
    const res = await fetch("/api/categories", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isEdit ? { id: cat!.id, ...payload } : payload),
    });

    // New category: now that it has an id, create any rules staged during setup.
    if (!isEdit && rules.length > 0) {
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

    setLoading(false);
    setOpen(false);
    props.onSave?.();
    router.refresh();
  }

  async function remove() {
    const ok = await confirm({
      title: t("deleteTitle", { name: cat?.name ?? "" }),
      body: t("deleteBody"),
      confirmLabel: t("deleteConfirm"),
      destructive: true,
    });
    if (!ok) return;
    setLoading(true);
    const res = await fetch("/api/categories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cat!.id }),
    });
    if (!res.ok) {
      setLoading(false);
      alert("Failed to delete the category.");
      return;
    }
    setLoading(false);
    setOpen(false);
    props.onSave?.();
    router.refresh();
  }

  function openRule(rule: CategoryRule | null) {
    setRuleEditor({ id: rule?.id ?? null, draft: rule ? ruleDraftFromRule(rule) : emptyRuleDraft(cat?.id ?? null) });
    setRuleDialogOpen(true);
  }

  async function saveRule(fields: RuleFields) {
    const id = ruleEditor?.id ?? null;
    // No category id yet, or a rule staged before it had one: kept here, created once
    // the category itself is saved.
    if (!isEdit || (id != null && id < 0)) {
      setRules((r) =>
        id == null
          ? [...r, { id: nextTempId.current--, categoryId: -1, createdAt: null, ...fields }]
          : r.map((x) => (x.id === id ? { ...x, ...fields } : x)),
      );
      setRuleDialogOpen(false);
      return;
    }
    const res = await fetch("/api/category-rules", {
      method: id == null ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id == null ? { categoryId: cat!.id, ...fields } : { id, ...fields }),
    });
    const saved: CategoryRule = await res.json();
    setRules((r) => (id == null ? [...r, saved] : r.map((x) => (x.id === id ? saved : x))));
    setRuleDialogOpen(false);
    await fetch("/api/apply-rules", { method: "POST" });
    router.refresh();
  }

  async function deleteRule(id: number) {
    setRules((r) => r.filter((x) => x.id !== id));
    if (!isEdit || id < 0) return;
    await fetch("/api/category-rules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  function openDialog() {
    // Re-sync rules from props when opening (in case page refreshed)
    if (isEdit) setRules(props.rules);
    setOpen(true);
  }

  return (
    <>
      {isEdit && controlledOpen === undefined ? (
        <button
          onClick={openDialog}
          className="flex items-center justify-center mt-0 p-1.5 hover:bg-foreground/10 text-ink rounded-sm bg-surface-2 hover:text-ink shrink-0 size-9 cursor-pointer"
        >
          <EllipsisVertical className="size-4" />
        </button>
      ) : !isEdit && props.variant === "custom" ? (
        <button onClick={() => setOpen(true)} className={props.className}>
          {props.children}
        </button>
      ) : !isEdit && props.variant === "icon" ? (
        <button
          onClick={() => setOpen(true)}
          className="glass-icon-btn size-12"
          aria-label="Add category"
        >
          <Plus className="size-5 text-ink dark:text-gray-300" />
        </button>
      ) : !isEdit ? (
        <button
          onClick={() => setOpen(true)}
          className="size-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity shrink-0"
          title="Add category"
        >
          <Plus className="size-5" />
        </button>
      ) : (
        null
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto [scrollbar-gutter:stable]">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit" : "New category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Name *">
              <Input autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>

            <Field label="Budget type">
              <OptionDropdown
                value={form.budgetType}
                onChange={(v) => set("budgetType", v)}
                options={BUDGET_TYPE_OPTIONS}
              />
            </Field>

            {parentOptions.length > 0 && !hasChildren && (
              <Field label="Parent category">
                <OptionDropdown
                  value={form.parentCategoryId !== null ? String(form.parentCategoryId) : ""}
                  onChange={(v) => {
                    const pid = v ? Number(v) : null;
                    // Adopt the new parent's colour immediately so the icon preview matches.
                    setForm((f) => ({ ...f, parentCategoryId: pid, color: pid != null ? parentColorFor(pid) ?? f.color : f.color }));
                  }}
                  options={[
                    { value: "", label: "None" },
                    ...parentOptions.map((c) => ({ value: String(c.id), label: c.name })),
                  ]}
                />
              </Field>
            )}

            <div className="flex items-center gap-6">
              <div className="flex-1">
                <PickerField label="Icon">
                  <IconPicker value={form.icon} onChange={(v) => setForm((f) => ({ ...f, icon: v }))} previewColor={effectiveColor} hideBrandTab />
                </PickerField>
              </div>
              {!isSubcategory && !(form.icon && isBrandIcon(form.icon)) && (
                <div className="flex-1">
                  <PickerField label="Color">
                    <ColorPicker value={form.color} onChange={(c) => set("color", c)} previewIcon={form.icon} />
                  </PickerField>
                </div>
              )}
            </div>

            {/* Rules section — collapsible; available for both new and existing categories.
                For a new category, rules are staged locally and created once it's saved. */}
            <div className="rounded-md border border-foreground/15">
              <button
                type="button"
                onClick={() => setRulesOpen((v) => !v)}
                className="flex items-center justify-between w-full px-3 py-3 text-left cursor-pointer"
              >
                <span className="text-base text-ink font-medium">
                  Automatic rules{rules.length > 0 ? ` (${rules.length})` : ""}
                </span>
                <ChevronDown className={`size-4 text-foreground transition-transform ${rulesOpen ? "rotate-180" : ""}`} />
              </button>
              {rulesOpen && (
                <div className="px-3 pb-3 space-y-2">
                  {!isEdit && (
                    <p className="text-sm text-ink-2 mb-5">
                      Rules are created when you save the category.
                    </p>
                  )}
                  {rules.length > 0 && (
                    <div className="rounded-md divide-y text-sm">
                      {rules.map((rule) => (
                        <div key={rule.id} className="py-2">
                          <div className="bg-surface-2 rounded-tile h-12 p-3 flex items-center justify-between gap-2">
                            <div className="text-sm text-ink-2 min-w-0">
                              {rule.namePattern && (
                                <span>
                                  Name {rule.nameWholeWord ? "whole word" : rule.nameWildcard ? "contains" : "exact"}{" "}
                                  <span className="font-mono text-ink">&ldquo;{rule.namePattern}&rdquo;</span>
                                </span>
                              )}
                              <MoneyText>{ruleAmountLabel(rule) && (
                                <span className="ml-1 text-xs">· <MoneyText>{ruleAmountLabel(rule)}</MoneyText></span>
                              )}</MoneyText>
                              {rule.direction && (
                                <span className="ml-1 text-xs">· {rule.direction === "income" ? "income" : "expense"}</span>
                              )}
                              {rule.bankId && (() => {
                                const bank = banks.find((b) => b.id === rule.bankId);
                                return bank ? (
                                  <span className="ml-1 text-xs">· {bank.displayName ?? bank.accountNumber}</span>
                                ) : null;
                              })()}
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              <button
                                onClick={() => openRule(rule)}
                                className="flex items-center justify-center mt-0 p-1.5 rounded-sm hover:bg-foreground/10 text-ink hover:text-ink shrink-0 size-9 cursor-pointer"
                              >
                                <EllipsisVertical className="size-4" />
                              </button>
                              <button
                                onClick={() => deleteRule(rule.id)}
                                className="flex items-center justify-center mt-0 p-1.5 rounded-sm hover:bg-destructive/20 text-destructive bg-destructive/10 hover:text-destructive shrink-0 size-9 cursor-pointer"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button size="lg" variant="default" onClick={() => openRule(null)} className="w-full">
                    <Plus className="size-4 mr-1" />
                      Add rule
                  </Button>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <Button onClick={save} disabled={loading || !form.name} className="flex-1">
                {loading ? "Saving..." : "Save"}
              </Button>
              {isEdit && (
                <Button variant="destructive" size="icon" className="size-12" onClick={remove} disabled={loading}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Inside the content so it stacks as a nested sheet over this one. */}
          <RuleDialog
            open={ruleDialogOpen}
            onOpenChange={setRuleDialogOpen}
            initial={ruleEditor?.draft ?? null}
            title={ruleEditor?.id == null ? tRule("titleNew") : tRule("titleEdit")}
            category={{ name: form.name, icon: form.icon, color: effectiveColor }}
            banks={banks}
            submitLabel={tRule("save")}
            onSubmit={saveRule}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-ink-3">{label}</label>
      {children}
    </div>
  );
}
