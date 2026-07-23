"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { acquireNavHidden } from "@/lib/nav-visibility";
import { ChevronLeft } from "lucide-react";
import {
  IconPlusFilled as Plus,
  IconDotsVerticalFilled as EllipsisVertical,
  IconTrashFilled as Trash2,
  IconPencilFilled as Pencil,
  IconChevronDownFilled as ChevronDown,
} from "@tabler/icons-react";
import type { Category, CategoryRule, Bank } from "@/db/schema";
import { Icon, isBrandIcon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ColorPicker } from "@/components/color-picker";
import { IconPicker } from "@/components/icon-picker";
import { OptionDropdown } from "@/components/option-dropdown";
import { cn } from "@/lib/utils";
import { normalizeBudgetType, ruleAmountLabel } from "@/lib/format";

const PRESET_COLORS = [
  "#22c55e", "#3b82f6", "#ef4444", "#f97316", "#a855f7",
  "#14b8a6", "#f59e0b", "#6366f1", "#ec4899", "#64748b",
];

const BUDGET_TYPE_OPTIONS = [
  { value: "nodig",  label: "Needs" },
  { value: "willen", label: "Wants" },
  { value: "sparen", label: "Savings" },
];

interface Props {
  category: Category;
  rules: CategoryRule[];
  banks: Bank[];
  categories: Category[];
  // When rendered inside the settings dialog (mobile drill-down) rather than as the
  // standalone /settings/categories/[id] route, there's no history entry to pop —
  // the parent supplies a close callback that dismisses the in-dialog slide-over.
  onClose?: () => void;
}

export function CategorySettingsClient({ category, rules: initialRules, banks, categories, onClose }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);

  // Route mode leaves this screen via history; embedded mode dismisses the slide-over.
  const close = onClose ?? (() => router.back());

  // A category can only become a parent if it doesn't itself have one (max 2 levels).
  const parentOptions = categories.filter((c) => c.parentCategoryId === null && c.id !== category.id);
  // A category that already has sub-categories can't be nested under another.
  const hasChildren = categories.some((c) => c.parentCategoryId === category.id);

  const parentColorFor = (pid: number | null) =>
    pid != null ? categories.find((c) => c.id === pid)?.color ?? null : null;

  const [form, setForm] = useState({
    name:             category.name             ?? "",
    budgetType:       normalizeBudgetType(category.budgetType) || "willen",
    color:            category.color            ?? PRESET_COLORS[0],
    icon:             category.icon             ?? (null as string | null),
    parentCategoryId: category.parentCategoryId ?? (null as number | null),
  });

  // A sub-category inherits its parent's colour: the colour picker is hidden and the
  // parent's colour is what previews and gets saved.
  const isSubcategory = form.parentCategoryId != null;
  const effectiveColor = isSubcategory ? parentColorFor(form.parentCategoryId) ?? form.color : form.color;

  const [rules, setRules] = useState<CategoryRule[]>(initialRules);

  // Hide the bottom nav on this full-page editor so the sticky Save button isn't
  // covered by it. In embedded mode the dialog already covers the nav, so skip it.
  useEffect(() => {
    if (onClose) return;
    return acquireNavHidden();
  }, [onClose]);

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setLoading(true);
    await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: category.id, ...form, color: (isSubcategory ? effectiveColor : form.color) || null }),
    });
    setLoading(false);
    // The list restores its prior scroll position itself (see MobileCategoryList);
    // refresh re-renders it (route mode remounts, embedded mode gets fresh props).
    router.refresh();
    close();
  }

  async function remove() {
    if (!confirm(`Delete category "${category.name}"? All linked transactions, recurring items, budget targets, and rules will also be deleted.`)) return;
    setLoading(true);
    const res = await fetch("/api/categories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: category.id }),
    });
    if (!res.ok) {
      setLoading(false);
      alert("Failed to delete the category.");
      return;
    }
    router.refresh();
    close();
  }

  // ─── Rules ────────────────────────────────────────────────────────────────
  const [rulesOpen, setRulesOpen] = useState(false);
  const [addRuleOpen, setAddRuleOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<number | null>(null);
  const [ruleLoading, setRuleLoading] = useState(false);
  const emptyRule = { namePattern: "", matchType: "contains" as "contains" | "word" | "exact", direction: "", bankId: "" };
  const [newRule, setNewRule] = useState(emptyRule);
  const [editForm, setEditForm] = useState(emptyRule);

  function matchTypeToFlags(matchType: "contains" | "word" | "exact") {
    return { nameWildcard: matchType === "contains", nameWholeWord: matchType === "word" };
  }
  function ruleToMatchType(rule: CategoryRule): "contains" | "word" | "exact" {
    if (rule.nameWholeWord) return "word";
    if (rule.nameWildcard) return "contains";
    return "exact";
  }

  async function addRule() {
    if (!newRule.namePattern && !newRule.bankId) return;
    setRuleLoading(true);
    const res = await fetch("/api/category-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: category.id,
        namePattern: newRule.namePattern || null,
        ...matchTypeToFlags(newRule.matchType),
        amount: null,
        direction: newRule.direction || null,
        bankId: newRule.bankId ? parseInt(newRule.bankId) : null,
      }),
    });
    const created = await res.json();
    setRules((r) => [...r, created]);
    setNewRule(emptyRule);
    setAddRuleOpen(false);
    await fetch("/api/apply-rules", { method: "POST" });
    setRuleLoading(false);
    router.refresh();
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
    const res = await fetch("/api/category-rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        namePattern: editForm.namePattern || null,
        ...matchTypeToFlags(editForm.matchType),
        amount: null,
        direction: editForm.direction || null,
        bankId: editForm.bankId ? parseInt(editForm.bankId) : null,
      }),
    });
    const updated = await res.json();
    setRules((r) => r.map((x) => (x.id === id ? updated : x)));
    setEditingRule(null);
    await fetch("/api/apply-rules", { method: "POST" });
    router.refresh();
  }

  async function deleteRule(id: number) {
    setRules((r) => r.filter((x) => x.id !== id));
    await fetch("/api/category-rules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  return (
    <div className="relative lg:hidden min-h-[calc(100dvh-var(--nav-clearance))] pb-[calc(6rem+var(--sab))]">
      {/* Color wash — fades from the icon's background color at the top, matching
          the category detail portal's header treatment. */}
      {effectiveColor && (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-90 pointer-events-none z-0"
          style={{ background: `radial-gradient(circle at top, ${effectiveColor}55, transparent 70%)` }}
        />
      )}
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-5 pb-3 pt-4" style={{ paddingTop: `calc(1.1rem + var(--sat))` }}>
        <button
          type="button"
          onClick={close}
          aria-label="Back"
          className="size-11 rounded-full bg-white/70 dark:bg-white/10 backdrop-blur-sm flex items-center justify-center active:scale-[0.97] transition-transform shrink-0"
        >
          <ChevronLeft className="size-5 text-foreground" />
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={loading}
          aria-label="Delete category"
          className="size-11 rounded-full bg-white/70 dark:bg-white/10 backdrop-blur-sm flex items-center justify-center active:scale-[0.97] transition-transform shrink-0 disabled:opacity-50"
        >
          <Trash2 className="size-5 text-foreground" />
        </button>
      </div>

      {/* Hero — big category glyph (tap to change icon), matching the account edit sheet. */}
      <div className="relative z-10 flex flex-col items-center gap-3 px-4 pb-6 pt-1">
        <button
          type="button"
          onClick={() => setIconOpen(true)}
          aria-label="Change icon"
          className="relative active:scale-95 transition-transform"
        >
          <Icon iconKey={form.icon} color={effectiveColor} round size="xxl" glyphSize={44} />
          <span className="absolute -right-1.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-black text-white">
            <Pencil className="size-2.5" />
          </span>
        </button>
        <span className="text-lg font-semibold text-foreground">{form.name || "Category"}</span>
        {/* Controlled — opened by tapping the hero above. */}
        <IconPicker value={form.icon} onChange={(v) => setForm((f) => ({ ...f, icon: v }))} previewColor={effectiveColor} hideBrandTab open={iconOpen} onOpenChange={setIconOpen} hideDefaultTrigger />
      </div>

      <div className="relative z-10 px-4 space-y-6">
        {/* Name + color, matching the account edit sheet. */}
        <div className="flex flex-wrap items-center gap-x-3">
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Name"
            className="flex-1 h-14 rounded-2xl border-0 px-4 text-base bg-white/7"
          />
          {!isSubcategory && !(form.icon && isBrandIcon(form.icon)) && (
            <ColorPicker value={form.color} onChange={(c) => set("color", c)} inline />
          )}
        </div>

        {/* Basics */}
        <Section title="Details">
          <Row label="Budget type">
            <OptionDropdown
              value={form.budgetType}
              onChange={(v) => set("budgetType", v)}
              options={BUDGET_TYPE_OPTIONS}
              title="Budget type"
              triggerClassName="h-9 w-auto mt-0 justify-end text-foreground/60 font-medium"
            />
          </Row>
          {parentOptions.length > 0 && !hasChildren && (
            <>
              <Divider />
              <Row label="Parent category">
                <OptionDropdown
                  value={form.parentCategoryId !== null ? String(form.parentCategoryId) : ""}
                  onChange={(v) => {
                    const pid = v ? Number(v) : null;
                    setForm((f) => ({ ...f, parentCategoryId: pid, color: pid != null ? parentColorFor(pid) ?? f.color : f.color }));
                  }}
                  options={[{ value: "", label: "None" }, ...parentOptions.map((c) => ({ value: String(c.id), label: c.name }))]}
                  title="Parent category"
                  triggerClassName="h-9 w-auto mt-0 justify-end text-foreground/60 font-medium"
                />
              </Row>
            </>
          )}
        </Section>

        {/* Rules — folded by default */}
        <div>
          <button
            type="button"
            onClick={() => setRulesOpen((v) => !v)}
            className="flex items-center justify-between w-full px-1 pb-1.5 text-left cursor-pointer"
          >
            <span className="text-xs font-medium uppercase tracking-wide text-foreground/40">
              Automatic rules{rules.length > 0 ? ` (${rules.length})` : ""}
            </span>
            <ChevronDown className={cn("size-3.5 text-foreground/40 transition-transform", rulesOpen && "rotate-180")} />
          </button>
          {rulesOpen && (
            <div className="bg-card/70 dark:bg-[#2c2c2e] rounded-2xl overflow-hidden">
              {rules.length === 0 && (
                <p className="px-4 py-3 text-sm text-foreground/50">No rules yet.</p>
              )}
              {rules.map((rule) => (
                <div key={rule.id}>
                  <div className="flex items-center justify-between bg-black/80 gap-2 m-1 rounded-xl px-4 py-3">
                    <div className="text-sm text-foreground/60 min-w-0">
                      {rule.namePattern && (
                        <span>
                          Name {rule.nameWholeWord ? "whole word" : rule.nameWildcard ? "contains" : "exact"}{" "}
                          <span className="font-mono text-foreground">&ldquo;{rule.namePattern}&rdquo;</span>
                        </span>
                      )}
                      {ruleAmountLabel(rule) && <span className="ml-1 text-xs">· {ruleAmountLabel(rule)}</span>}
                      {rule.direction && <span className="ml-1 text-xs">· {rule.direction === "income" ? "income" : "expense"}</span>}
                      {rule.bankId && (() => {
                        const bank = banks.find((b) => b.id === rule.bankId);
                        return bank ? <span className="ml-1 text-xs">· {bank.displayName ?? bank.accountNumber}</span> : null;
                      })()}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => startEdit(rule)} className="size-9 flex items-center justify-center rounded-sm bg-white/5 hover:bg-foreground/10 text-foreground cursor-pointer">
                        <EllipsisVertical className="size-5" />
                      </button>
                      <button onClick={() => deleteRule(rule.id)} className="size-9 flex items-center justify-center rounded-sm bg-destructive/10 hover:bg-destructive/20 text-destructive cursor-pointer">
                        <Trash2 className="size-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={() => { setNewRule(emptyRule); setAddRuleOpen(true); }}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium text-foreground/60 active:bg-black/[0.04] dark:active:bg-white/10 transition-colors cursor-pointer"
              >
                <Plus className="size-4" />
                Add rule
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add/edit rule dialog */}
      <Dialog
        open={addRuleOpen || editingRule !== null}
        onOpenChange={(v) => { if (!v) { setAddRuleOpen(false); setEditingRule(null); } }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{addRuleOpen ? "New rule" : "Edit rule"}</DialogTitle>
          </DialogHeader>
          {addRuleOpen ? (
            <RuleForm
              value={newRule}
              onChange={setNewRule}
              banks={banks}
              disabled={ruleLoading || (!newRule.namePattern && !newRule.bankId)}
              onSubmit={addRule}
              onCancel={() => { setAddRuleOpen(false); setNewRule(emptyRule); }}
            />
          ) : editingRule !== null ? (
            <RuleForm
              value={editForm}
              onChange={setEditForm}
              banks={banks}
              disabled={false}
              onSubmit={() => saveEdit(editingRule)}
              onCancel={() => setEditingRule(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Sticky save — embedded mode sits on the dialog's #1c1c1e sheet, not the page's
          pure-black --background, so the fade must match that instead of it, otherwise
          the bar reads as a visibly blacker patch than the rest of the sheet. */}
      <div
        className={cn(
          "fixed bottom-0 inset-x-0 px-4 pb-[calc(1rem+var(--sab))] pt-3 bg-gradient-to-t to-transparent",
          onClose ? "from-[#1c1c1e] via-[#1c1c1e]" : "from-background via-background",
        )}
      >
        <Button onClick={save} disabled={loading || !form.name} className="w-full h-12">
          {loading ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="px-1 pb-1.5 text-xs font-medium uppercase tracking-wide text-foreground/40">{title}</h3>
      <div className="bg-card/70 dark:bg-white/7 rounded-2xl overflow-hidden">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 min-h-[3.25rem]">
      <span className="text-sm font-medium text-foreground shrink-0">{label}</span>
      <div className="min-w-0 flex-1 flex justify-end">{children}</div>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-foreground/8 dark:bg-white/10 mx-4" />;
}

type RuleValue = { namePattern: string; matchType: "contains" | "word" | "exact"; direction: string; bankId: string };

function RuleForm({
  value, onChange, banks, disabled, onSubmit, onCancel,
}: {
  value: RuleValue;
  onChange: React.Dispatch<React.SetStateAction<RuleValue>>;
  banks: Bank[];
  disabled: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const matchOptions = [
    { value: "contains", label: "Contains" },
    { value: "word", label: "Whole word" },
    { value: "exact", label: "Exact" },
  ];
  const dirOptions = [
    { value: "", label: "Both" },
    { value: "income", label: "Income" },
    { value: "expense", label: "Expense" },
  ];
  return (
    <div className="space-y-2.5">
      <Input
        placeholder="Name (optional)"
        value={value.namePattern}
        onChange={(e) => onChange((r) => ({ ...r, namePattern: e.target.value }))}
        className="text-sm bg-white/10"
      />
      <Segmented value={value.matchType} options={matchOptions} onChange={(v) => onChange((r) => ({ ...r, matchType: v as RuleValue["matchType"] }))} />
      <Segmented value={value.direction} options={dirOptions} onChange={(v) => onChange((r) => ({ ...r, direction: v }))} />
      {banks.length > 0 && (
        <select
          value={value.bankId}
          onChange={(e) => onChange((r) => ({ ...r, bankId: e.target.value }))}
          className="h-11 w-full rounded-md px-4 text-sm text-foreground bg-white/10"
        >
          <option value="">All accounts</option>
          {banks.map((bank) => (
            <option key={bank.id} value={String(bank.id)}>
              {bank.displayName ?? bank.accountNumber ?? `Bank ${bank.id}`}
            </option>
          ))}
        </select>
      )}
      <div className="flex gap-2 pt-1">
        <Button size="lg" onClick={onSubmit} disabled={disabled} className="flex-1">
            Save
        </Button>
        <Button size="lg" variant="ghost" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </div>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="flex h-12 rounded-md overflow-hidden text-xs">
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-2 py-2.5 transition-colors ${
            value === opt.value ? "bg-white/20 text-foreground font-medium" : "bg-white/10 text-foreground/60"
          } ${i > 0 ? "" : ""}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
