"use client";

import { useEffect, useState } from "react";
import { IconSearch, IconPlus, IconCheck, IconChevronLeft } from "@tabler/icons-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { IconPicker } from "@/components/icon-picker";
import { ColorPicker } from "@/components/color-picker";
import { PickerField } from "@/components/picker-field";
import { Icon } from "@/components/icon";
import { groupCategoriesByParent } from "@/lib/category-tree";
import { cn } from "@/lib/utils";
import type { Category } from "@/db/schema";

const BUDGET_TYPE_OPTIONS = [
  { value: "nodig", label: "Needs" },
  { value: "willen", label: "Wants" },
  { value: "sparen", label: "Savings" },
];

/**
 * Category picker used when auto-creating a recurring bill from a debt. Adds a search
 * bar over the list and an inline "Create new category" form, then hands the chosen
 * (or freshly created) category back through onSelect.
 */
export function RecurringCategoryPicker({
  open,
  onOpenChange,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedId: number | null;
  onSelect: (cat: Category) => void;
}) {
  const [cats, setCats] = useState<Category[]>([]);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  // New-category form state.
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState<string | null>(null);
  const [newColor, setNewColor] = useState("#3b82f6");
  const [newBudgetType, setNewBudgetType] = useState("nodig");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/categories").then((r) => r.json()).then(setCats).catch(() => {});
  }, [open]);

  // Reset transient view state whenever the dialog opens/closes.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setCreating(false);
      setNewName("");
      setNewIcon(null);
      setNewColor("#3b82f6");
      setNewBudgetType("nodig");
    }
  }, [open]);

  const q = query.trim().toLowerCase();
  const { topLevel, childrenByParentId } = groupCategoriesByParent(cats);

  async function createCategory() {
    if (!newName.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          group: "",
          budgetType: newBudgetType,
          icon: newIcon,
          color: newColor,
        }),
      });
      if (res.ok) {
        const created: Category = await res.json();
        onSelect(created);
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{creating ? "New category" : "Choose a category"}</DialogTitle>
        </DialogHeader>

        {creating ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="flex items-center gap-1 text-sm font-medium text-foreground/60"
            >
              <IconChevronLeft className="size-4" /> Back
            </button>

            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Category name"
              autoFocus
              className="h-12"
            />

            <div className="flex items-center gap-6">
              <div className="flex-1">
                <PickerField label="Icon">
                  <IconPicker value={newIcon} onChange={setNewIcon} previewColor={newColor} />
                </PickerField>
              </div>
              <div className="flex-1">
                <PickerField label="Color">
                  <ColorPicker value={newColor} onChange={setNewColor} previewIcon={newIcon} />
                </PickerField>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Budget type</p>
              <div className="grid grid-cols-3 gap-2">
                {BUDGET_TYPE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setNewBudgetType(o.value)}
                    className={cn(
                      "rounded-xl py-2.5 text-sm font-medium transition-colors",
                      newBudgetType === o.value ? "bg-foreground text-background" : "bg-foreground/5 text-foreground/70",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={createCategory}
              disabled={!newName.trim() || saving}
              className="h-12 w-full rounded-full bg-foreground text-background text-base font-semibold disabled:opacity-40"
            >
              {saving ? "Creating…" : "Create & select"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Search bar */}
            <div className="relative">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-foreground/40" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search categories"
                className="h-11 pl-9"
              />
            </div>

            {/* Create new category */}
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-3 rounded-2xl bg-foreground/5 px-4 py-3 text-left active:bg-foreground/[0.08] transition-colors"
            >
              <span className="flex items-center justify-center size-8 rounded-full bg-foreground/10">
                <IconPlus className="size-4.5" />
              </span>
              <span className="flex-1 font-medium">Create new category</span>
            </button>

            {/* List */}
            <div className="max-h-[50vh] overflow-y-auto space-y-4 -mx-1 px-1">
              {topLevel.map((parent) => {
                const children = childrenByParentId.get(parent.id) ?? [];
                const rows = (children.length > 0 ? children : [parent]).filter(
                  (c) => !q || c.name.toLowerCase().includes(q) || parent.name.toLowerCase().includes(q),
                );
                if (rows.length === 0) return null;
                return (
                  <section key={parent.id}>
                    <h3 className="text-sm font-medium text-foreground/45 px-1 mb-2">{parent.name}</h3>
                    <div className="rounded-2xl bg-foreground/[0.03] overflow-hidden divide-y divide-border/50">
                      {rows.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { onSelect(c); onOpenChange(false); }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-foreground/[0.06] transition-colors"
                        >
                          <Icon iconKey={c.icon} color={c.color} size="sm" round />
                          <span className="flex-1 font-medium truncate">{c.name}</span>
                          {selectedId === c.id && <IconCheck className="size-5 text-foreground/60 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
