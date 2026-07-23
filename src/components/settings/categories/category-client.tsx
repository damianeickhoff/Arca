"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
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

  // New rule form state — matchType: "contains" | "word" | "exact"
  const [newRule, setNewRule] = useState({ namePattern: "", matchType: "contains" as "contains" | "word" | "exact", direction: "", bankId: "" });
  const [ruleLoading, setRuleLoading] = useState(false);
  const [addRuleOpen, setAddRuleOpen] = useState(false);

  const [editingRule, setEditingRule] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ namePattern: "", matchType: "contains" as "contains" | "word" | "exact", direction: "", bankId: "" });

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
    if (!confirm(`Delete category "${cat?.name}"? All linked transactions, recurring items, budget targets, and rules will also be deleted.`)) return;
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

  function matchTypeToFlags(matchType: "contains" | "word" | "exact") {
    return {
      nameWildcard: matchType === "contains",
      nameWholeWord: matchType === "word",
    };
  }

  async function addRule() {
    if (!newRule.namePattern && !newRule.bankId) return;
    const fields = {
      namePattern: newRule.namePattern || null,
      ...matchTypeToFlags(newRule.matchType),
      amount: null,
      direction: newRule.direction || null,
      bankId: newRule.bankId ? parseInt(newRule.bankId) : null,
    };

    if (!isEdit) {
      // No category id yet — stage locally, created once the category itself is saved.
      setRules((r) => [...r, { id: nextTempId.current--, categoryId: -1, createdAt: null, ...fields } as CategoryRule]);
      setNewRule({ namePattern: "", matchType: "contains", direction: "", bankId: "" });
      return;
    }

    setRuleLoading(true);
    const res = await fetch("/api/category-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: cat!.id, ...fields }),
    });
    const created = await res.json();
    setRules((r) => [...r, created]);
    setNewRule({ namePattern: "", matchType: "contains", direction: "", bankId: "" });
    await fetch("/api/apply-rules", { method: "POST" });
    setRuleLoading(false);
    router.refresh();
  }

  function openAddRule() {
    setNewRule({ namePattern: "", matchType: "contains", direction: "", bankId: "" });
    setAddRuleOpen(true);
  }

  async function submitAddRule() {
    await addRule();
    setAddRuleOpen(false);
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

  function ruleToMatchType(rule: CategoryRule): "contains" | "word" | "exact" {
    if (rule.nameWholeWord) return "word";
    if (rule.nameWildcard) return "contains";
    return "exact";
  }

  function startEdit(rule: CategoryRule) {
    setEditingRule(rule.id);
    setEditForm({
      namePattern: rule.namePattern ?? "",
      matchType: ruleToMatchType(rule),
      direction: rule.direction ?? "",
      bankId: rule.bankId !== null && rule.bankId !== undefined ? String(rule.bankId) : "",
    });
  }

  async function saveEdit(id: number) {
    const fields = {
      namePattern: editForm.namePattern || null,
      ...matchTypeToFlags(editForm.matchType),
      amount: null,
      direction: editForm.direction || null,
      bankId: editForm.bankId ? parseInt(editForm.bankId) : null,
    };

    if (!isEdit || id < 0) {
      // Staged rule (category not saved yet) — update locally only.
      setRules((r) => r.map((x) => (x.id === id ? { ...x, ...fields } : x)));
      setEditingRule(null);
      return;
    }

    const res = await fetch("/api/category-rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    });
    const updated = await res.json();
    setRules((r) => r.map((x) => (x.id === id ? updated : x)));
    setEditingRule(null);
    await fetch("/api/apply-rules", { method: "POST" });
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
          className="flex items-center justify-center mt-0 p-1.5 hover:bg-foreground/10 text-foreground rounded-sm bg-foreground/3 hover:text-foreground shrink-0 size-9 cursor-pointer"
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
          <Plus className="size-5 text-foreground dark:text-gray-300" />
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
        <DialogContent className="sm:max-w-lg sm:max-h-[90dvh] sm:overflow-y-auto sm:[scrollbar-gutter:stable]">
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
                <span className="text-base text-foreground font-medium">
                  Automatic rules{rules.length > 0 ? ` (${rules.length})` : ""}
                </span>
                <ChevronDown className={`size-4 text-foreground transition-transform ${rulesOpen ? "rotate-180" : ""}`} />
              </button>
              {rulesOpen && (
                <div className="px-3 pb-3 space-y-2">
                  {!isEdit && (
                    <p className="text-sm text-foreground/60 mb-5">
                      Regels worden aangemaakt zodra je de categorie opslaat.
                    </p>
                  )}
                  {rules.length > 0 && (
                    <div className="rounded-md divide-y text-sm">
                      {rules.map((rule) => (
                        <div key={rule.id} className="py-2">
                          <div className="bg-foreground/3 rounded-lg h-12 p-3 flex items-center justify-between gap-2">
                            <div className="text-sm text-foreground/60 min-w-0">
                              {rule.namePattern && (
                                <span>
                                  Name {rule.nameWholeWord ? "whole word" : rule.nameWildcard ? "contains" : "exact"}{" "}
                                  <span className="font-mono text-foreground">&ldquo;{rule.namePattern}&rdquo;</span>
                                </span>
                              )}
                              {ruleAmountLabel(rule) && (
                                <span className="ml-1 text-xs">· {ruleAmountLabel(rule)}</span>
                              )}
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
                                onClick={() => startEdit(rule)}
                                className="flex items-center justify-center mt-0 p-1.5 rounded-sm hover:bg-foreground/10 text-foreground hover:text-foreground shrink-0 size-9 cursor-pointer"
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

                  <Button size="lg" variant="default" onClick={openAddRule} className="w-full">
                    <Plus className="size-4 mr-1" />
                    Add rule
                  </Button>
                </div>
              )}
            </div>

            {/* Add rule inline panel */}
            {addRuleOpen && (
              <div className="rounded-lg border border-foreground/15 p-3 space-y-2 bg-foreground/[0.02]">
                <p className="text-sm font-medium">New rule</p>
                <Field label="Name">
                  <Input
                    placeholder="Name (optioneel)"
                    value={newRule.namePattern}
                    onChange={(e) => setNewRule((r) => ({ ...r, namePattern: e.target.value }))}
                    className="text-sm"
                  />
                </Field>
                <MatchTypePicker value={newRule.matchType} onChange={(v) => setNewRule((r) => ({ ...r, matchType: v }))} />
                <DirectionPicker value={newRule.direction} onChange={(v) => setNewRule((r) => ({ ...r, direction: v }))} />
                <BankPicker banks={banks} value={newRule.bankId} onChange={(v) => setNewRule((r) => ({ ...r, bankId: v }))} />
                <div className="flex gap-2 pt-1">
                  <Button size="lg" variant="default" onClick={submitAddRule}
                    disabled={ruleLoading || (!newRule.namePattern && !newRule.bankId)}
                    className="flex-1">
                    <Check className="size-4 mr-1" />Add
                  </Button>
                  <Button size="lg" variant="ghost" onClick={() => setAddRuleOpen(false)} className="flex-1">Cancel</Button>
                </div>
              </div>
            )}

            {/* Edit rule inline panel */}
            {editingRule !== null && (
              <div className="rounded-lg border border-foreground/15 p-3 space-y-2 bg-foreground/[0.02]">
                <p className="text-sm font-medium">Regel bewerken</p>
                <Field label="Name">
                  <Input
                    placeholder="Name (optioneel)"
                    value={editForm.namePattern}
                    onChange={(e) => setEditForm((f) => ({ ...f, namePattern: e.target.value }))}
                    className="text-sm"
                  />
                </Field>
                <MatchTypePicker value={editForm.matchType} onChange={(v) => setEditForm((f) => ({ ...f, matchType: v }))} />
                <DirectionPicker value={editForm.direction} onChange={(v) => setEditForm((f) => ({ ...f, direction: v }))} />
                <BankPicker banks={banks} value={editForm.bankId} onChange={(v) => setEditForm((f) => ({ ...f, bankId: v }))} />
                <div className="flex gap-2 pt-1">
                  <Button size="lg" variant="default" onClick={() => editingRule !== null && saveEdit(editingRule)} className="flex-1">
                    <Check className="size-4 mr-1" />Save
                  </Button>
                  <Button size="lg" variant="ghost" onClick={() => setEditingRule(null)} className="flex-1">Cancel</Button>
                </div>
              </div>
            )}

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
        </DialogContent>
      </Dialog>
    </>
  );
}

function MatchTypePicker({
  value,
  onChange,
}: {
  value: "contains" | "word" | "exact";
  onChange: (v: "contains" | "word" | "exact") => void;
}) {
  const options: { value: "contains" | "word" | "exact"; label: string; title: string }[] = [
    { value: "contains", label: "Contains", title: "Name contains the text (also as part of a word)" },
    { value: "word", label: "Whole word", title: "Name contains it as a whole word (MCD does not match McDonalds)" },
    { value: "exact", label: "Exact", title: "Name matches the text exactly" },
  ];
  return (
    <div className="flex rounded-md overflow-hidden text-xs mb-5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.title}
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-2 py-2.5 transition-colors pb-2 ${
            value === opt.value
              ? "bg-foreground text-primary-foreground font-medium"
              : "bg-foreground/3 text-foreground/60 hover:bg-foreground/10"
          } ${opt.value !== "contains" ? "border-l border-foreground/10" : ""}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function DirectionPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options = [
    { value: "",        label: "Both" },
    { value: "income",  label: "Income" },
    { value: "expense", label: "Expense" },
  ];
  return (
    <div className="flex rounded-md overflow-hidden text-xs">
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-2 py-2.5 transition-colors ${
            value === opt.value
              ? "bg-foreground text-primary-foreground font-medium"
              : "bg-background text-foreground/60 hover:bg-foreground/10"
          } ${i > 0 ? "border-l border-foreground/10" : ""}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function BankPicker({ banks, value, onChange }: { banks: Bank[]; value: string; onChange: (v: string) => void }) {
  if (banks.length === 0) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-5 mt-2 h-11 w-full rounded-md px-4 py-1.5 text-sm text-foreground bg-background"
    >
      <option value="">All accounts</option>
      {banks.map((bank) => (
        <option key={bank.id} value={String(bank.id)}>
          {bank.displayName ?? bank.accountNumber ?? `Bank ${bank.id}`}
          {bank.displayName && bank.accountNumber ? ` (${bank.accountNumber})` : ""}
        </option>
      ))}
    </select>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
