"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconTrash } from "@tabler/icons-react";
import type { Category } from "@/db/schema";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { Icon } from "@/components/icon";
import { ColorPicker } from "@/components/color-picker";
import { IconPickerField } from "@/components/icon-picker";
import { PickerField } from "@/components/picker-field";
import { ClearButton } from "@/components/clear/button";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField, ClearInput } from "@/components/clear/field";
import { Segmented } from "@/components/clear/segmented";
import { FIELD_LABEL } from "@/app/settings/account-edit-dialogs";
import { SettingsNotice } from "@/components/settings/settings-ui";
import { BudgetTypeField, DEFAULT_CATEGORY_COLOR, nameConflictFrom, useNameConflictMessage } from "@/components/settings/categories/category-form-parts";
import { findNameConflict, type NameConflict } from "@/lib/category-name-conflict";
import { normalizeBudgetType } from "@/lib/format";

const KINDS = ["", "savings", "income"] as const;
type Kind = (typeof KINDS)[number];

/**
 * New group / Edit group: name, icon and colour (every category in the group shows
 * that colour), what its money counts as, and the budget type its new categories
 * start with. A group can only be deleted once it's empty.
 */
export function GroupDialog({
  open,
  onClose,
  group,
  categories,
  categoryCount = 0,
}: {
  open: boolean;
  onClose: () => void;
  /** The group being edited; null for a new group. */
  group: Category | null;
  /** Every group and category, to flag a name that's already taken while typing. */
  categories: Category[];
  categoryCount?: number;
}) {
  const t = useTranslations("settings.categories.groupDialog");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent hideHeaderRow title={group ? t("editTitle") : t("newTitle")} className="gap-[18px] pt-6 font-clear text-clear-ink" sheetClassName="lg:max-w-[600px]">
        <GroupForm key={group?.id ?? "new"} group={group} categories={categories} categoryCount={categoryCount} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function GroupForm({ group, categories, categoryCount, onClose }: { group: Category | null; categories: Category[]; categoryCount: number; onClose: () => void }) {
  const t = useTranslations("settings.categories.groupDialog");
  const tCat = useTranslations("settings.categories");
  const router = useRouter();
  const confirm = useConfirm();
  const ids = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(group?.name ?? "");
  const [icon, setIcon] = useState<string | null>(group?.icon ?? null);
  const [color, setColor] = useState(group?.color ?? DEFAULT_CATEGORY_COLOR);
  const [kind, setKind] = useState<Kind>((KINDS as readonly string[]).includes(group?.group ?? "") ? (group?.group as Kind) ?? "" : "");
  const [budgetType, setBudgetType] = useState<string>(normalizeBudgetType(group?.budgetType ?? null) || "willen");

  // A name already used in the chosen kind is flagged while typing (the group's own
  // categories move along, so they don't count); the API's 409 is the fallback and
  // also catches one of its categories clashing when the kind changes.
  const describeConflict = useNameConflictMessage();
  const [serverConflict, setServerConflict] = useState<NameConflict | null>(null);
  const others = group ? categories.filter((c) => c.id !== group.id && c.parentCategoryId !== group.id) : categories;
  const nameError = describeConflict(findNameConflict(others, { name, kind }) ?? serverConflict);

  async function save() {
    if (!name.trim() || nameError) return;
    setBusy(true);
    setError(null);
    const body = { name: name.trim(), icon, color, group: kind, budgetType };
    const res = await fetch("/api/categories", {
      method: group ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(group ? { id: group.id, ...body } : { ...body, isGroup: true }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const conflict = await nameConflictFrom(res);
      if (conflict) setServerConflict(conflict);
      else setError(t("saveError"));
      return;
    }
    router.refresh();
    onClose();
  }

  async function remove() {
    if (!group) return;
    const ok = await confirm({ title: t("deleteTitle", { name: group.name }), body: t("deleteBody"), confirmLabel: t("deleteConfirm"), destructive: true });
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/categories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: group.id }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError(t("deleteError"));
      return;
    }
    router.refresh();
    onClose();
  }

  const kindKey = kind === "" ? "spending" : kind;

  return (
    <>
      <ClearDialogHeader
        title={group ? name.trim() || group.name : t("newTitle")}
        subtitle={group ? t("editSubtitle", { count: categoryCount }) : t("newSubtitle")}
        icon={<Icon iconKey={icon} color={color} soft size="md" />}
        onClose={onClose}
        closeLabel={tCat("close")}
      />

      <ClearField label={tCat("name")} htmlFor={`${ids}-name`} error={nameError}>
        <ClearInput id={`${ids}-name`} autoFocus={!group} value={name} onChange={(e) => { setName(e.target.value); setServerConflict(null); }} placeholder={t("namePlaceholder")} autoComplete="off" aria-invalid={nameError ? true : undefined} />
      </ClearField>

      <div className="flex flex-col gap-2.5">
        <div className="rounded-clear-tile bg-clear-tile px-4 py-3">
          <PickerField label={tCat("icon")}>
            <IconPickerField
              subject={{ kind: "group", name: name.trim() || group?.name || "" }}
              value={{ icon, color }}
              onChange={(c) => {
                setIcon(c.icon);
                if (c.color) setColor(c.color);
              }}
            />
          </PickerField>
        </div>
        <div className="rounded-clear-tile bg-clear-tile px-4 py-3">
          <PickerField label={tCat("color")}>
            <ColorPicker value={color} onChange={setColor} previewIcon={icon} />
          </PickerField>
        </div>
        <p className="m-0 text-[13px] text-clear-muted">{t("colorHint")}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL} aria-hidden>{t("kind")}</span>
        <Segmented
          label={t("kind")}
          surface="tile"
          size="sm"
          value={kindKey}
          onChange={(v) => { setKind(v === "spending" ? "" : v); setServerConflict(null); }}
          className="w-full [&>button]:flex-1"
          items={(["spending", "savings", "income"] as const).map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
        />
        <span className="text-[13px] text-clear-muted">{t(`kindHints.${kindKey}`)}</span>
      </div>

      {kind !== "income" && (
        <div className="flex flex-col gap-1.5">
          <BudgetTypeField value={budgetType} onChange={setBudgetType} />
          <span className="text-[13px] text-clear-muted">{t("budgetTypeHint")}</span>
        </div>
      )}

      {group && categoryCount > 0 && <p className="m-0 text-[13px] text-clear-muted">{t("deleteBlocked", { count: categoryCount })}</p>}
      {error && <SettingsNotice>{error}</SettingsNotice>}

      <div className="border-t border-clear-ground pt-[18px] pb-1">
        <ClearDialogFooter
          destructive={
            group && (
              <ClearButton variant="danger" onClick={remove} disabled={busy || categoryCount > 0}>
                <IconTrash aria-hidden />
                {t("delete")}
              </ClearButton>
            )
          }
        >
          <ClearButton variant="secondary" onClick={onClose}>{tCat("cancel")}</ClearButton>
          <ClearButton onClick={save} disabled={busy || !name.trim() || !!nameError}>
            {busy ? tCat("saving") : group ? tCat("save") : t("create")}
          </ClearButton>
        </ClearDialogFooter>
      </div>
    </>
  );
}
