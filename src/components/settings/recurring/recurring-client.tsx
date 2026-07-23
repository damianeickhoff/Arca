"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  IconPlusFilled as Plus,
  IconDotsVerticalFilled as EllipsisVertical,
  IconTrashFilled as Trash2,
  IconChevronRight as ChevronRight,
  IconCircleCheckFilled as CheckCircle,
  IconCheck as Check,
  IconCoinEuro as Coin,
  IconRepeat as Repeat,
  IconCalendarEvent as Calendar,
  IconTag as TagIcon,
  IconCategory2 as CategoryIcon,
  IconNote as Note,
  IconAdjustments as Adjust,
} from "@tabler/icons-react";
import type { RecurringItem, Category } from "@/db/schema";
import { FloatingAddButton } from "@/components/floating-add-button";
import { Icon } from "@/components/icon";
import { DatePicker } from "@/components/date-picker";
import { AmountKeypad } from "@/components/amount-keypad";
import { WarningBanner } from "@/components/warning-banner";
import { SubSheet } from "@/components/sub-sheet";
import { OptionList } from "@/components/option-list";
import { groupCategoriesByParent } from "@/lib/category-tree";
import { formatEur } from "@/lib/format";
import { evaluateExpression } from "@/lib/amount-expression";
import { cn } from "@/lib/utils";

interface AddProps { action: "add"; variant?: "default" | "icon" | "fab" }
interface EditProps { action: "edit"; item: RecurringItem; trigger?: React.ReactNode; open?: boolean; onOpenChange?: (v: boolean) => void }
type Props = AddProps | EditProps;

const TYPE_OPTIONS = [
  { value: "income",       label: "Income" },
  { value: "bill",         label: "Bill" },
  { value: "subscription", label: "Subscription" },
  { value: "debt",         label: "Debt" },
  { value: "savings",      label: "Savings" },
];

const BUDGET_TYPE_OPTIONS = [
  { value: "nodig",  label: "Needs" },
  { value: "willen", label: "Wants" },
  { value: "sparen", label: "Savings" },
];

const FREQUENCY_OPTIONS = [
  { value: "daily",     label: "Daily" },
  { value: "weekly",    label: "Weekly" },
  { value: "monthly",   label: "Monthly" },
  { value: "quarterly", label: "Per quarter" },
  { value: "yearly",    label: "Yearly" },
];

const SUB_TITLES: Record<string, string> = {
  amount: "Amount", period: "Period", frequency: "Frequency", category: "Category",
  name: "Name", type: "Type", notes: "Notes & Tags", match: "Auto-match",
};

const todayISO = () => new Date().toISOString().slice(0, 10);
function fmtShort(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function RecurringClient(props: Props) {
  const router = useRouter();
  const controlled = props.action === "edit" && props.open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlled ? (props as EditProps).open! : internalOpen;
  const setOpen = (v: boolean) => {
    if (controlled) (props as EditProps).onOpenChange?.(v);
    else setInternalOpen(v);
  };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = props.action === "edit";
  const item = isEdit ? props.item : null;

  const [cats, setCats] = useState<Category[]>([]);
  useEffect(() => {
    if (!open || cats.length) return;
    fetch("/api/categories").then((r) => r.json()).then(setCats).catch(() => {});
  }, [open, cats.length]);

  const [amountExpr, setAmountExpr] = useState(item?.amount != null ? String(item.amount).replace(".", ",") : "");
  const [calcEnabled, setCalcEnabled] = useState(true);
  const [subpage, setSubpage] = useState<string | null>(null);
  const [subVisible, setSubVisible] = useState(false);

  const [form, setForm] = useState({
    name: item?.name ?? "",
    type: item?.type ?? "bill",
    frequency: item?.frequency ?? "monthly",
    budgetType: item?.budgetType ?? "nodig",
    active: item?.active ?? true,
    notes: item?.notes ?? "",
    dueDay: item?.dueDay?.toString() ?? "",
    startDate: item?.startDate ?? (isEdit ? "" : todayISO()),
    endDate: item?.endDate ?? "",
    matchPattern: item?.matchPattern ?? "",
    matchAmount: item?.matchAmount?.toString() ?? "",
    matchMode: (item?.matchAmountMin != null || item?.matchAmountMax != null) ? "range" : "exact",
    matchAmountMin: item?.matchAmountMin?.toString() ?? "",
    matchAmountMax: item?.matchAmountMax?.toString() ?? "",
    categoryId: item?.categoryId != null ? String(item.categoryId) : "",
    friendlyName: item?.friendlyName ?? "",
  });
  function set(key: string, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Reset the subpage stack whenever the dialog closes.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) { setSubVisible(false); setSubpage(null); }
    setError(null);
  }

  function openSub(k: string) {
    setSubpage(k);
    requestAnimationFrame(() => setSubVisible(true));
  }
  function closeSub() {
    setSubVisible(false);
    setTimeout(() => setSubpage(null), 300);
  }

  const amountVal = evaluateExpression(amountExpr);

  async function save() {
    if (!form.name.trim() || amountVal == null) return;
    setLoading(true);
    setError(null);
    // Start date is the recurrence's due date — derive dueDay from it (fall back to a
    // manually-entered dueDay if no start date was set).
    const dueDay = form.startDate ? Number(form.startDate.slice(8, 10)) : (form.dueDay ? parseInt(form.dueDay) : null);
    const payload = {
      name: form.name,
      type: form.type,
      frequency: form.frequency,
      budgetType: form.type === "income" ? null : form.budgetType,
      active: form.active,
      notes: form.notes || null,
      amount: amountVal,
      dueDay,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      matchPattern: form.matchPattern || null,
      matchAmount: form.matchMode === "exact" && form.matchAmount ? parseFloat(form.matchAmount) : null,
      matchAmountMin: form.matchMode === "range" && form.matchAmountMin ? parseFloat(form.matchAmountMin) : null,
      matchAmountMax: form.matchMode === "range" && form.matchAmountMax ? parseFloat(form.matchAmountMax) : null,
      categoryId: form.categoryId ? parseInt(form.categoryId) : null,
      friendlyName: form.friendlyName.trim() || null,
      ...(isEdit ? { id: item!.id } : {}),
    };
    const res = await fetch("/api/recurring", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (res.status === 409) {
      const data = await res.json().catch(() => null);
      setError(data?.message ?? "A recurring item with this name already exists.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Delete "${item?.name}"?`)) return;
    setLoading(true);
    await fetch("/api/recurring", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item!.id }),
    });
    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  const editTrigger = props.action === "edit" ? props.trigger : undefined;
  const catObj = cats.find((c) => String(c.id) === form.categoryId);
  const typeLabel = TYPE_OPTIONS.find((t) => t.value === form.type)?.label ?? form.type;
  const freqLabel = FREQUENCY_OPTIONS.find((f) => f.value === form.frequency)?.label ?? form.frequency;
  const periodLabel = form.startDate
    ? (form.endDate ? `${fmtShort(form.startDate)} – ${fmtShort(form.endDate)}` : `From ${fmtShort(form.startDate)}`)
    : "—";

  return (
    <>
      {!controlled && (isEdit ? (
        editTrigger ? (
          <button type="button" onClick={() => setOpen(true)} className="block w-full text-left">
            {editTrigger}
          </button>
        ) : (
          <button className="flex items-center justify-center p-1.5 hover:bg-foreground/10 text-foreground rounded-sm bg-foreground/3 hover:text-foreground shrink-0 size-9" onClick={() => setOpen(true)}>
            <EllipsisVertical className="size-4" />
          </button>
        )
      ) : props.variant === "fab" ? (
        <FloatingAddButton onClick={() => setOpen(true)} ariaLabel="Add fixed cost" />
      ) : props.variant === "icon" ? (
        <button onClick={() => setOpen(true)} className="glass-icon-btn size-12" aria-label="Add fixed cost">
          <Plus className="size-5 text-foreground dark:text-gray-300" />
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="size-11 rounded-full bg-white/70 dark:bg-white/10 backdrop-blur-sm flex items-center justify-center text-foreground active:scale-[0.97] transition-transform shrink-0"
          aria-label="Add recurrence"
        >
          <Plus className="size-5" />
        </button>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="px-0"
          title={isEdit ? "Edit Recurrence" : "New recurrence"}
          headerAction={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => set("active", !form.active)}
                aria-label={form.active ? "Enabled" : "Disabled"}
                className="size-11 rounded-full bg-foreground/10 flex items-center justify-center active:scale-[0.95] transition-transform"
              >
                <Check className={cn("size-5", form.active ? "text-[#1fb651]" : "text-foreground/30")} /> 
              </button>
              {isEdit && (
                <button
                  type="button"
                  onClick={remove}
                  disabled={loading}
                  aria-label="Delete"
                  className="size-11 rounded-full bg-foreground/10 flex items-center justify-center text-foreground active:scale-[0.95] transition-transform"
                >
                  <Trash2 className="size-4.5" />
                </button>
              )}
            </div>
          }
          footer={
            <Button
              onClick={save}
              disabled={loading || !form.name.trim() || amountVal == null}
              className="w-full h-13 rounded-full bg-foreground text-background hover:bg-foreground/90 text-base font-semibold"
            >
              {loading ? "Saving..." : "Save"}
            </Button>
          }
        >
          <div className="space-y-3 px-5 pb-2">
            {error && (
              <WarningBanner severity="danger">
                <span>{error}</span>
              </WarningBanner>
            )}
            <Row icon={<Coin className="size-5" />} label="Amount" value={amountVal != null ? formatEur(amountVal) : "—"} onClick={() => openSub("amount")} />
            <Row icon={<Calendar className="size-5" />} label="Period" value={periodLabel} onClick={() => openSub("period")} />
            <Row icon={<Repeat className="size-5" />} label="Frequency" value={freqLabel} onClick={() => openSub("frequency")} />
            <Row
              icon={<CategoryIcon className="size-5" />}
              label="Category"
              value={catObj?.name ?? "—"}
              valueIcon={catObj ? <Icon iconKey={catObj.icon} color={catObj.color} size="xs" round /> : null}
              onClick={() => openSub("category")}
            />
            <Row icon={<TagIcon className="size-5" />} label="Name" value={form.name || "—"} onClick={() => openSub("name")} />
            <Row icon={<Adjust className="size-5" />} label="Type" value={typeLabel} onClick={() => openSub("type")} />
            <Row icon={<Note className="size-5" />} label="Notes & Tags" value={form.notes || form.friendlyName || "—"} onClick={() => openSub("notes")} />
            <Row icon={<Adjust className="size-5" />} label="Auto-match" value={form.matchPattern || "—"} onClick={() => openSub("match")} />
          </div>

          {/* Slide-in subpage — fixed against the (transformed) dialog panel */}
          {subpage && (
            <SubSheet title={SUB_TITLES[subpage]} visible={subVisible} onClose={closeSub}>
                {subpage === "amount" && (
                  <AmountKeypad expr={amountExpr} onChange={setAmountExpr} sign={form.type === "income" ? "+" : "−"} calcEnabled={calcEnabled} onToggleCalc={() => setCalcEnabled((c) => !c)} />
                )}

                {subpage === "period" && (
                  <div className="space-y-5 pt-2">
                    <div>
                      <p className="text-sm font-medium mb-1.5">Start date</p>
                      <DatePicker value={form.startDate || todayISO()} onChange={(v) => set("startDate", v)} triggerClassName="w-full justify-between border rounded-xl px-4 h-12 bg-[#2e2e30]" />
                      <p className="text-xs text-foreground/50 mt-1.5">This becomes the due date of the recurrence.</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-sm font-medium">End date</p>
                        <button type="button" onClick={() => set("endDate", form.endDate ? "" : todayISO())} className="text-sm font-medium text-primary">
                          {form.endDate ? "Remove" : "Add"}
                        </button>
                      </div>
                      {form.endDate ? (
                        <>
                          <DatePicker value={form.endDate} onChange={(v) => set("endDate", v)} triggerClassName="w-full justify-between border rounded-xl px-4 h-12 bg-[#2e2e30]" />
                          <p className="text-xs text-foreground/50 mt-1.5">After this date the recurrence is automatically disabled.</p>
                        </>
                      ) : (
                        <p className="text-sm text-foreground/45">No end date — runs indefinitely.</p>
                      )}
                    </div>
                  </div>
                )}

                {subpage === "frequency" && (
                  <OptionList options={FREQUENCY_OPTIONS} value={form.frequency} onSelect={(v) => { set("frequency", v); closeSub(); }} />
                )}

                {subpage === "type" && (
                  <div className="space-y-5 pt-1">
                    <OptionList options={TYPE_OPTIONS} value={form.type} onSelect={(v) => set("type", v)} />
                    {form.type !== "income" && (
                      <div>
                        <p className="text-sm font-medium mb-2 px-1">Budget type</p>
                        <OptionList options={BUDGET_TYPE_OPTIONS} value={form.budgetType} onSelect={(v) => set("budgetType", v)} />
                      </div>
                    )}
                  </div>
                )}

                {subpage === "category" && (
                  <CategorySubpage cats={cats} value={form.categoryId} onSelect={(v) => { set("categoryId", v); closeSub(); }} />
                )}

                {subpage === "name" && (
                  <div className="pt-2">
                    <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Rent" data-autofocus data-no-keyboard-scroll className="h-12" />
                  </div>
                )}

                {subpage === "notes" && (
                  <div className="space-y-4 pt-2">
                    <div>
                      <p className="text-sm font-medium mb-1.5">Notes</p>
                      <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Notes" className="h-12" />
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-1.5">Friendly name</p>
                      <Input value={form.friendlyName} onChange={(e) => set("friendlyName", e.target.value)} placeholder="e.g. Amazon Prime" className="h-12" />
                      <p className="text-xs text-foreground/50 mt-1.5">Overrides name cleanup on matched transactions.</p>
                    </div>
                  </div>
                )}

                {subpage === "match" && (
                  <div className="space-y-4 pt-2">
                    <div>
                      <p className="text-sm font-medium mb-1.5">Match pattern</p>
                      <Input value={form.matchPattern} onChange={(e) => set("matchPattern", e.target.value)} placeholder="Text in the description, e.g. Netflix" className="h-12" />
                    </div>
                    <div>
                      <div className="grid grid-cols-2 gap-1 rounded-lg bg-foreground/5 p-1 mb-2">
                        {(["exact", "range"] as const).map((m) => (
                          <button key={m} type="button" onClick={() => set("matchMode", m)} className={cn("rounded-md py-2 text-sm transition-colors", form.matchMode === m ? "bg-background shadow-sm font-medium" : "text-foreground/60")}>
                            {m === "exact" ? "Exact amount" : "Between"}
                          </button>
                        ))}
                      </div>
                      {form.matchMode === "exact" ? (
                        <Input type="number" step="0.01" value={form.matchAmount} onChange={(e) => set("matchAmount", e.target.value)} placeholder="e.g. 12.99" className="h-12" />
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          <Input type="number" step="0.01" value={form.matchAmountMin} onChange={(e) => set("matchAmountMin", e.target.value)} placeholder="Min" className="h-12" />
                          <Input type="number" step="0.01" value={form.matchAmountMax} onChange={(e) => set("matchAmountMax", e.target.value)} placeholder="Max" className="h-12" />
                        </div>
                      )}
                    </div>
                  </div>
                )}
            </SubSheet>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({
  icon,
  label,
  value,
  valueIcon,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueIcon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 rounded-2xl bg-[#2e2e30] px-4 py-4 text-left active:bg-foreground/[0.04] transition-colors">
      <span className="text-foreground/40 shrink-0">{icon}</span>
      <span className="flex-1 font-medium text-foreground">{label}</span>
      <span className="flex items-center gap-1.5 text-foreground/60 min-w-0">
        {valueIcon}
        <span className="truncate max-w-[45vw]">{value}</span>
      </span>
      <ChevronRight className="size-5 text-foreground/30 shrink-0" />
    </button>
  );
}

function CategorySubpage({ cats, value, onSelect }: { cats: Category[]; value: string; onSelect: (v: string) => void }) {
  const { topLevel, childrenByParentId } = groupCategoriesByParent(cats);
  return (
    <div className="space-y-4 pt-1">
      <button type="button" onClick={() => onSelect("")} className="w-full flex items-center gap-3 rounded-2xl bg-[#2e2e30] px-4 py-3.5 text-left active:bg-foreground/[0.04] transition-colors">
        <span className="flex-1 font-medium text-foreground/60">No category</span>
        {!value && <Check className="size-5 text-white/70 shrink-0" />}
      </button>
      {topLevel.map((parent) => {
        const children = childrenByParentId.get(parent.id) ?? [];
        const rows = children.length > 0 ? children : [parent];
        return (
          <section key={parent.id}>
            <h3 className="text-sm font-medium text-foreground/45 px-1 mb-2">{parent.name}</h3>
            <div className="rounded-2xl bg-[#2e2e30] overflow-hidden divide-y divide-border/50">
              {rows.map((c) => (
                <button key={c.id} type="button" onClick={() => onSelect(String(c.id))} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-foreground/[0.04] transition-colors">
                  <Icon iconKey={c.icon} color={c.color} size="sm" round />
                  <span className="flex-1 font-medium truncate">{c.name}</span>
                  {value === String(c.id) && <Check className="size-5 text-white/70 shrink-0" />}
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Brings a dismissed auto-detected item back: clears the dismissed flag and reactivates it. */
export function RecurringRestoreButton({ item }: { item: RecurringItem }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function restore() {
    setLoading(true);
    await fetch("/api/recurring", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, dismissed: false, active: true }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" onClick={restore} disabled={loading} className="shrink-0">
      {loading ? "…" : "Restore"}
    </Button>
  );
}
