"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { ClearButton } from "@/components/clear/button";
import { useConfirm } from "@/components/clear/confirm-dialog";

type MatchType = "contains" | "word" | "exact";

function matchTypeToFlags(mt: MatchType) {
  return { nameWildcard: mt === "contains", nameWholeWord: mt === "word" };
}
function flagsToMatchType(rule: BrandIconRule): MatchType {
  if (rule.nameWholeWord) return "word";
  if (rule.nameWildcard) return "contains";
  return "exact";
}

/** The brand-icon rules ("names containing KFC get the KFC logo"), shown as the
 *  second section of the Merchants settings panel, under the merchant list. */
export function BrandIconsClient({ initialRules }: { initialRules: BrandIconRule[] }) {
  const t = useTranslations("settings.brandIcons");
  const router = useRouter();
  const confirm = useConfirm();
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
    const ok = await confirm({
      title: t("deleteRuleTitle"),
      body: t("deleteRuleBody"),
      confirmLabel: t("deleteRuleConfirm"),
      destructive: true,
    });
    if (!ok) return;
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
      <div className="px-4 pt-2 pb-8 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 font-clear text-clear-ink">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="m-0 text-lg font-bold">{t("title")}</h3>
            <span className="text-sm text-clear-muted">{t("subtitle")}</span>
          </div>
          <BrandIconRuleAddButton />
        </div>
        {rules.length > 0 ? (
          <section>
            <div className="flex items-baseline justify-between px-1 mb-2.5">
              <h4 className="m-0 text-sm font-bold text-clear-muted">{t("rules")}</h4>
              <span className="text-sm font-bold text-clear-muted tabular-nums">{rules.length}</span>
            </div>
            <div className="space-y-3">
              {rules.map((rule) => (
                <button
                  key={rule.id}
                  type="button"
                  onClick={() => startEdit(rule)}
                  className="w-full flex items-center gap-4 rounded-clear-row bg-clear-tile px-4 py-3.5 text-left active:scale-[0.99] transition-transform"
                >
                  <span className="size-12 shrink-0">
                    <Icon iconKey={rule.brandIcon} round size="xl" background={rule.iconBgColor ?? null} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-lg truncate leading-tight">{rule.namePattern}</p>
                    <p className="text-sm text-ink-3 truncate mt-0.5">
                      {t(rule.nameWholeWord ? "matchWord" : rule.nameWildcard ? "matchContains" : "matchExact")}
                    </p>
                  </div>
                  <Pencil className="size-4 text-ink-3 shrink-0" />
                </button>
              ))}
            </div>
          </section>
        ) : (
          <div className="rounded-clear-tile bg-clear-tile py-10 text-center text-clear-muted">
            <p className="text-sm">{t("empty")}</p>
          </div>
        )}
      </div>

      {/* Edit rule dialog */}
      <Dialog open={editingId !== null} onOpenChange={(v) => !v && setEditingId(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto [scrollbar-gutter:stable]">
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

function BrandIconRuleAddButton() {
  const t = useTranslations("settings.brandIcons");
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
      <ClearButton variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        {t("addRule")}
      </ClearButton>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
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
              {saving ? t("saving") : t("addRule")}
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
