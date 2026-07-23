"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  IconPlus as Plus,
  IconTagFilled as Tag,
  IconArrowsLeftRight as ArrowLeftRight,
  IconRepeat as Repeat,
} from "@tabler/icons-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { IconPicker } from "@/components/icon-picker";
import { BrandIconPicker } from "@/components/brand-icon-picker";
import { CategoryPicker } from "@/components/category-picker";
import { DatePicker } from "@/components/date-picker";
import { OptionDropdown, FORM_TRIGGER_CLASS } from "@/components/option-dropdown";
import type { Category } from "@/db/schema";

type ModalType = "category" | "transaction" | "recurring" | null;

interface QuickAddButtonProps {
  categories: Category[];
}

export function QuickAddButton({ categories }: QuickAddButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<ModalType>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function pick(type: ModalType) {
    setOpen(false);
    setModal(type);
  }

  return (
    <>
      {/* Dropdown trigger */}
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="size-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity shrink-0"
          title="Quick add"
        >
          <Plus className="size-4" />
        </button>

        {open && (
          <div className="absolute left-0 top-full mt-2 z-50 bg-card rounded-xl shadow-lg overflow-hidden w-52">
            <button
              onClick={() => pick("category")}
              className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-muted transition-colors text-left"
            >
              <Tag className="size-4 text-muted-foreground shrink-0" />
              Add category
            </button>
            <button
              onClick={() => pick("transaction")}
              className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-muted transition-colors text-left"
            >
              <ArrowLeftRight className="size-4 text-muted-foreground shrink-0" />
              Add transaction
            </button>
            <button
              onClick={() => pick("recurring")}
              className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-muted transition-colors text-left"
            >
              <Repeat className="size-4 text-muted-foreground shrink-0" />
              Add fixed cost
            </button>
          </div>
        )}
      </div>

      {/* Category modal */}
      <AddCategoryModal open={modal === "category"} onClose={() => setModal(null)} onDone={() => { setModal(null); router.refresh(); }} />

      {/* Transaction modal */}
      <AddTransactionModal open={modal === "transaction"} onClose={() => setModal(null)} onDone={() => { setModal(null); router.refresh(); }} categories={categories} />

      {/* Recurring modal */}
      <AddRecurringModal open={modal === "recurring"} onClose={() => setModal(null)} onDone={() => { setModal(null); router.refresh(); }} />
    </>
  );
}

// ─── Add Category Modal ──────────────────────────────────────────────────────

const PRESET_COLORS = [
  "#22c55e", "#3b82f6", "#ef4444", "#f97316", "#a855f7",
  "#14b8a6", "#f59e0b", "#6366f1", "#ec4899", "#64748b",
];

const GROUP_OPTIONS = [
  { value: "variable",     label: "Variable expenses" },
  { value: "bill",         label: "Accounts" },
  { value: "subscription", label: "Subscriptions" },
  { value: "savings",      label: "Savings" },
  { value: "income",       label: "Income" },
  { value: "debt",         label: "Debts" },
];

const BUDGET_TYPE_OPTIONS = [
  { value: "nodig",  label: "Needs" },
  { value: "willen", label: "Wants" },
  { value: "sparen", label: "Savings" },
];

function AddCategoryModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState("variable");
  const [budgetType, setBudgetType] = useState("willen");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [icon, setIcon] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setLoading(true);
    await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), group, budgetType: group === "income" ? null : budgetType, color: color || null, icon }),
    });
    setLoading(false);
    setName(""); setGroup("variable"); setBudgetType("willen"); setColor(PRESET_COLORS[0]); setIcon(null);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="sm:max-w-lg max-h-[90dvh] overflow-y-auto [scrollbar-gutter:stable] bg-card"
        footer={
          <Button onClick={save} disabled={loading || !name.trim()} className="w-full">
            {loading ? "Saving..." : "Add"}
          </Button>
        }
      >
        <DialogHeader><DialogTitle>Add category</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Name *"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Category name" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Group">
              <OptionDropdown value={group} onChange={setGroup} options={GROUP_OPTIONS} />
            </Field>
            <Field label="Budget type">
              <OptionDropdown
                value={group === "income" ? "" : budgetType}
                onChange={setBudgetType}
                options={BUDGET_TYPE_OPTIONS}
                disabled={group === "income"}
              />
            </Field>
          </div>
          <Field label="Color">
            <div className="flex gap-1.5 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`size-6 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent hover:scale-110"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </Field>
          <Field label="Icon">
            <IconPicker value={icon} onChange={setIcon} previewColor={color} hideBrandTab />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Transaction Modal ───────────────────────────────────────────────────

export function AddTransactionModal({ open, onClose, onDone, categories }: { open: boolean; onClose: () => void; onDone: () => void; categories: Category[] }) {
  const now = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({ date: now, description: "", amount: "", direction: "expense" as "expense" | "income", categoryId: "", notes: "" });
  const [loading, setLoading] = useState(false);

  function set(key: string, value: string) { setForm((f) => ({ ...f, [key]: value })); }

  async function save() {
    if (!form.description.trim() || !form.amount) return;
    setLoading(true);
    await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: form.date,
        description: form.description.trim(),
        amount: parseFloat(form.amount),
        direction: form.direction,
        type: form.direction === "income" ? "inkomen" : "variabel",
        categoryId: form.categoryId ? parseInt(form.categoryId) : null,
        notes: form.notes.trim() || null,
        source: "manual",
      }),
    });
    setLoading(false);
    setForm({ date: now, description: "", amount: "", direction: "expense", categoryId: "", notes: "" });
    onDone();
  }

  const expenseCats = categories.filter((c) => c.group !== "income");
  const incomeCats = categories.filter((c) => c.group === "income");
  const relevantCats = form.direction === "income" ? incomeCats : expenseCats;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        footer={
          <Button onClick={save} disabled={loading || !form.description.trim() || !form.amount} className="w-full">
            {loading ? "Saving..." : "Add"}
          </Button>
        }
      >
        <DialogHeader><DialogTitle>Add transaction</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><DatePicker value={form.date} onChange={(v) => set("date", v)} /></Field>
            <Field label="Transaction type">
              <OptionDropdown
                value={form.direction}
                onChange={(v) => set("direction", v)}
                options={[
                  { value: "expense", label: "Expense" },
                  { value: "income", label: "Income" },
                ]}
                title="Transaction type"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Description"><Input value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Albert Heijn" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (EUR)"><AmountInput value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0,00" /></Field>
            <Field label="Category">
              <CategoryPicker
                categories={relevantCats}
                current={form.categoryId}
                onChange={(v) => set("categoryId", v)}
                triggerClassName={FORM_TRIGGER_CLASS}
              />
            </Field>
          </div>
          <Field label="Notes (optional)">
            <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional note" />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Recurring Modal ─────────────────────────────────────────────────────

const RECURRING_TYPE_OPTIONS = [
  { value: "income",       label: "Income" },
  { value: "bill",         label: "Bill" },
  { value: "subscription", label: "Subscription" },
  { value: "debt",         label: "Debt" },
  { value: "savings",      label: "Savings" },
];

const RECURRING_BUDGET_TYPE_OPTIONS = [
  { value: "nodig",  label: "Needs" },
  { value: "willen", label: "Wants" },
  { value: "sparen", label: "Savings" },
];

const RECURRING_FREQUENCY_OPTIONS = [
  { value: "monthly",   label: "Monthly" },
  { value: "quarterly", label: "Per quarter" },
  { value: "yearly",    label: "Yearly" },
  { value: "weekly",    label: "Weekly" },
];

function AddRecurringModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    name: "", type: "bill", amount: "", frequency: "monthly", budgetType: "nodig",
    dueDay: "", notes: "", icon: null as string | null, iconColor: null as string | null,
  });
  const [loading, setLoading] = useState(false);

  function set(key: string, value: string) { setForm((f) => ({ ...f, [key]: value })); }

  async function save() {
    if (!form.name.trim() || !form.amount) return;
    setLoading(true);
    await fetch("/api/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        budgetType: form.type === "income" ? null : form.budgetType,
        amount: form.amount ? parseFloat(form.amount) : null,
        dueDay: form.dueDay ? parseInt(form.dueDay) : null,
      }),
    });
    setLoading(false);
    setForm({ name: "", type: "bill", amount: "", frequency: "monthly", budgetType: "nodig", dueDay: "", notes: "", icon: null, iconColor: null });
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="sm:max-w-lg max-h-[90dvh] overflow-y-auto [scrollbar-gutter:stable]"
        footer={
          <Button onClick={save} disabled={loading || !form.name.trim() || !form.amount} className="w-full">
            {loading ? "Saving..." : "Add"}
          </Button>
        }
      >
        <DialogHeader><DialogTitle>Add fixed cost</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Name *"><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Netflix" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <OptionDropdown value={form.type} onChange={(v) => set("type", v)} options={RECURRING_TYPE_OPTIONS} />
            </Field>
            <Field label="Budget type">
              <OptionDropdown
                value={form.type === "income" ? "" : form.budgetType}
                onChange={(v) => set("budgetType", v)}
                options={RECURRING_BUDGET_TYPE_OPTIONS}
                disabled={form.type === "income"}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (EUR) *"><AmountInput value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0,00" /></Field>
            <Field label="Frequentie">
              <OptionDropdown value={form.frequency} onChange={(v) => set("frequency", v)} options={RECURRING_FREQUENCY_OPTIONS} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Betaaldag (1–31)">
              <Input type="number" inputMode="numeric" min="1" max="31" value={form.dueDay} onChange={(e) => set("dueDay", e.target.value)} placeholder="bv. 28" />
            </Field>
            <Field label="Notities">
              <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </div>
          <Field label="Brand icon">
            <BrandIconPicker
              value={form.icon}
              onChange={(icon) => setForm((f) => ({ ...f, icon }))}
            />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
