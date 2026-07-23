"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconTrashFilled as Trash2,
  IconCheckFilled as Check,
  IconPlusFilled as Plus,
  IconPencilFilled as Pencil,
} from "@tabler/icons-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ColorPicker } from "@/components/color-picker";
import { BrandIconPicker } from "@/components/brand-icon-picker";
import { PickerField } from "@/components/picker-field";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import type { BrandIconRule } from "@/db/schema";
import { FloatingAddButton } from "@/components/floating-add-button";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import { cn } from "@/lib/utils";

type MatchType = "contains" | "word" | "exact";

function matchTypeToFlags(mt: MatchType) {
  return { nameWildcard: mt === "contains", nameWholeWord: mt === "word" };
}
function flagsToMatchType(rule: BrandIconRule): MatchType {
  if (rule.nameWholeWord) return "word";
  if (rule.nameWildcard) return "contains";
  return "exact";
}

interface Props {
  initialRules: BrandIconRule[];
  /** Renders the shared sticky PanelHeader (title + add button) — on for the settings-
   *  dialog panel, which supplies no chrome of its own. The legacy standalone /settings
   *  page draws its own header/add-button around this component, so it opts out. */
  panelHeader?: boolean;
}

export function BrandIconsClient({ initialRules, panelHeader = true }: Props) {
  const router = useRouter();
  const [rules, setRules] = useState<BrandIconRule[]>(initialRules);

  // router.refresh() re-runs the server component and passes a new initialRules array,
  // but useState only consumes its initial value once — sync it in during render (like
  // the pathname-close tracking elsewhere in this app) instead of an effect.
  const [prevInitialRules, setPrevInitialRules] = useState(initialRules);
  if (initialRules !== prevInitialRules) {
    setPrevInitialRules(initialRules);
    setRules(initialRules);
  }

  // Edit state
  const [editingId, setEditingId]         = useState<number | null>(null);
  const [editPattern, setEditPattern]     = useState("");
  const [editMatchType, setEditMatchType] = useState<MatchType>("contains");
  const [editIcon, setEditIcon]           = useState<string | null>(null);
  const [editBgColor, setEditBgColor]     = useState<string | null>(null);

  async function deleteRule(id: number) {
    if (!confirm("Delete this rule?")) return;
    await fetch("/api/brand-icon-rules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setRules((r) => r.filter((x) => x.id !== id));
    setEditingId((current) => (current === id ? null : current));
    await fetch("/api/apply-brand-rules", { method: "POST" });
    router.refresh();
  }

  function startEdit(rule: BrandIconRule) {
    setEditingId(rule.id);
    setEditPattern(rule.namePattern);
    setEditMatchType(flagsToMatchType(rule));
    setEditIcon(rule.brandIcon);
    setEditBgColor(rule.iconBgColor ?? null);
  }

  async function saveEdit(id: number) {
    if (!editPattern || !editIcon) return;
    const res = await fetch("/api/brand-icon-rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, namePattern: editPattern, ...matchTypeToFlags(editMatchType), brandIcon: editIcon, iconColor: null, iconBgColor: editBgColor }),
    });
    const updated = await res.json();
    setRules((r) => r.map((x) => (x.id === id ? updated : x)));
    setEditingId(null);
    await fetch("/api/apply-brand-rules", { method: "POST" });
    router.refresh();
  }

  return (
    <>
      {panelHeader && <PanelHeader title="Brand Icons" action={<BrandIconRuleAddButton variant="header" />} />}
      <div className="px-4 pt-1 pb-8 space-y-6">
        {rules.length > 0 ? (
          <section>
            <div className="flex items-baseline justify-between px-1 mb-2.5">
              <h2 className="text-sm font-medium text-foreground/45">Rules</h2>
              <span className="text-sm font-medium text-foreground/45 tabular-nums">{rules.length}</span>
            </div>
            <div className="space-y-3">
              {rules.map((rule) => (
                <button
                  key={rule.id}
                  type="button"
                  onClick={() => startEdit(rule)}
                  className={cn(
                    "w-full flex items-center gap-4 rounded-2xl px-4 py-3.5 text-left active:scale-[0.99] transition-transform",
                    panelHeader ? "bg-[var(--dialog-content-background)]" : "bg-card",
                  )}
                >
                  <span className="size-12 shrink-0">
                    <Icon iconKey={rule.brandIcon} round size="xl" background={rule.iconBgColor ?? null} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-lg truncate leading-tight">{rule.namePattern}</p>
                    <p className="text-sm text-foreground/50 truncate mt-0.5">
                      {rule.nameWholeWord ? "Whole word" : rule.nameWildcard ? "Contains" : "Exact"}
                    </p>
                  </div>
                  <Pencil className="size-4 text-foreground/30 shrink-0" />
                </button>
              ))}
            </div>
          </section>
        ) : (
          <div className={cn("rounded-2xl py-16 text-center text-muted-foreground", panelHeader ? "bg-[var(--dialog-content-background)]" : "bg-card")}>
            <p className="text-sm">No rules yet</p>
          </div>
        )}
      </div>

      {/* Edit rule dialog */}
      <Dialog open={editingId !== null} onOpenChange={(v) => !v && setEditingId(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto [scrollbar-gutter:stable]">
          <DialogHeader>
            <DialogTitle>Edit rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Name">
              <Input
                value={editPattern}
                onChange={(e) => setEditPattern(e.target.value)}
                placeholder="Name contains..."
                className="text-sm"
              />
            </Field>
            <MatchTypePicker value={editMatchType} onChange={setEditMatchType} />
            <div className="space-y-3">
              <PickerField label="Icon">
                <BrandIconPicker value={editIcon} onChange={setEditIcon} />
              </PickerField>
              <PickerField label="Achtergrond">
                <ColorPicker value={editBgColor ?? ""} onChange={(v) => setEditBgColor(v || null)} previewIcon={editIcon} />
              </PickerField>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => editingId !== null && saveEdit(editingId)}
                disabled={!editPattern || !editIcon}
                className="flex-1"
              >
                <Check className="size-4 mr-1" />
                Save
              </Button>
              <Button
                variant="destructive"
                size="icon"
                className="size-12"
                onClick={() => editingId !== null && deleteRule(editingId)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Add rule (popup) ────────────────────────────────────────────────────────

export function BrandIconRuleAddButton({ variant = "default" }: { variant?: "default" | "icon" | "fab" | "header" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newPattern, setNewPattern]     = useState("");
  const [newMatchType, setNewMatchType] = useState<MatchType>("contains");
  const [newIcon, setNewIcon]           = useState<string | null>(null);
  const [newBgColor, setNewBgColor]     = useState<string | null>(null);

  async function addRule() {
    if (!newPattern || !newIcon) return;
    setSaving(true);
    await fetch("/api/brand-icon-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ namePattern: newPattern, ...matchTypeToFlags(newMatchType), brandIcon: newIcon, iconColor: null, iconBgColor: newBgColor }),
    });
    await fetch("/api/apply-brand-rules", { method: "POST" });
    setNewPattern(""); setNewMatchType("contains"); setNewIcon(null); setNewBgColor(null);
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {variant === "fab" ? (
        <FloatingAddButton onClick={() => setOpen(true)} ariaLabel="Add rule" />
      ) : variant === "icon" ? (
        <button
          onClick={() => setOpen(true)}
          className="glass-icon-btn size-12"
          aria-label="Add rule"
        >
          <Plus className="size-5 text-foreground dark:text-gray-300" />
        </button>
      ) : variant === "header" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Add rule"
          className="size-11 rounded-full bg-white/70 dark:bg-white/10 backdrop-blur-sm flex items-center justify-center active:scale-[0.97] transition-transform shrink-0"
        >
          <Plus className="size-5 text-foreground" />
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="size-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity shrink-0"
          title="Add rule"
        >
          <Plus className="size-5" />
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Name">
              <Input
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                placeholder="Name contains... (bijv. KFC)"
                className="text-sm"
              />
            </Field>
            <MatchTypePicker value={newMatchType} onChange={setNewMatchType} />
            <div className="space-y-3">
              <PickerField label="Icon">
                <BrandIconPicker value={newIcon} onChange={setNewIcon} />
              </PickerField>
              <PickerField label="Achtergrond">
                <ColorPicker value={newBgColor ?? ""} onChange={(v) => setNewBgColor(v || null)} previewIcon={newIcon} />
              </PickerField>
            </div>
            <Button
              onClick={addRule}
              disabled={saving || !newPattern || !newIcon}
              className="w-full"
            >
              {saving ? "Opslaan…" : "Add rule"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MatchTypePicker({ value, onChange }: { value: MatchType; onChange: (v: MatchType) => void }) {
  const options: { value: MatchType; label: string; title: string }[] = [
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
