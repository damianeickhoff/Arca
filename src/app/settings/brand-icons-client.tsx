"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconPencil, IconPhoto, IconPlus, IconTrash } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ColorPicker } from "@/components/color-picker";
import { BrandIconPicker } from "@/components/brand-icon-picker";
import { PickerField } from "@/components/picker-field";
import { Icon } from "@/components/icon";
import type { BrandIconRule } from "@/db/schema";
import { ClearButton } from "@/components/clear/button";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField, ClearInput } from "@/components/clear/field";
import { ListRow } from "@/components/clear/list-row";
import { Segmented } from "@/components/clear/segmented";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { FIELD_LABEL } from "@/app/settings/account-edit-dialogs";
import { SettingsEmpty, SettingsNotice, SettingsSection } from "@/components/settings/settings-ui";

type MatchType = "contains" | "word" | "exact";

function matchTypeToFlags(mt: MatchType) {
  return { nameWildcard: mt === "contains", nameWholeWord: mt === "word" };
}
function flagsToMatchType(rule: BrandIconRule): MatchType {
  if (rule.nameWholeWord) return "word";
  if (rule.nameWildcard) return "contains";
  return "exact";
}

interface RuleDraft {
  id: number | null;
  pattern: string;
  matchType: MatchType;
  icon: string | null;
  bgColor: string | null;
}

/** The brand-icon rules ("names containing KFC get the KFC logo"), shown as the
 *  second section of the Merchants settings panel, under the merchant list. */
export function BrandIconsClient({ initialRules }: { initialRules: BrandIconRule[] }) {
  const t = useTranslations("settings.brandIcons");
  const [rules, setRules] = useState<BrandIconRule[]>(initialRules);

  // router.refresh() re-runs the server component and passes a new initialRules array,
  // but useState only consumes its initial value once — sync it in during render (like
  // the pathname-close tracking elsewhere in this app) instead of an effect.
  const [prevInitialRules, setPrevInitialRules] = useState(initialRules);
  if (initialRules !== prevInitialRules) {
    setPrevInitialRules(initialRules);
    setRules(initialRules);
  }

  // The rule being added (id null) or edited; kept while the dialog animates out.
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);

  function openRule(rule: BrandIconRule | null) {
    setDraft(
      rule
        ? { id: rule.id, pattern: rule.namePattern, matchType: flagsToMatchType(rule), icon: rule.brandIcon, bgColor: rule.iconBgColor ?? null }
        : { id: null, pattern: "", matchType: "contains", icon: null, bgColor: null },
    );
    setSession((n) => n + 1);
    setOpen(true);
  }

  const addButton = (
    <ClearButton variant="secondary" size="sm" onClick={() => openRule(null)}>
      <IconPlus aria-hidden stroke={2.2} />
      {t("addRule")}
    </ClearButton>
  );

  return (
    <div className="px-4 pt-6 pb-8">
      <SettingsSection title={t("title")} subtitle={t("subtitle")} action={addButton}>
        {rules.length > 0 ? (
          <div className="flex flex-col">
            {rules.map((rule) => (
              <ListRow
                key={rule.id}
                onClick={() => openRule(rule)}
                icon={<Icon iconKey={rule.brandIcon} background={rule.iconBgColor ?? null} soft size="md" />}
                title={rule.namePattern}
                meta={t(rule.nameWholeWord ? "matchWord" : rule.nameWildcard ? "matchContains" : "matchExact")}
                trailing={
                  <span aria-hidden title={t("editRule", { name: rule.namePattern })} className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-clear-tile text-clear-ink">
                    <IconPencil size={18} stroke={2} />
                  </span>
                }
              />
            ))}
          </div>
        ) : (
          <SettingsEmpty icon={<IconPhoto stroke={1.9} />}>{t("empty")}</SettingsEmpty>
        )}
      </SettingsSection>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          hideHeaderRow
          title={draft?.id != null ? t("editTitle") : t("newTitle")}
          className="gap-[18px] pt-6 font-clear text-clear-ink"
          sheetClassName="lg:max-w-[560px]"
        >
          {draft && (
            <RuleForm
              key={session}
              draft={draft}
              onClose={() => setOpen(false)}
              onSaved={(saved) =>
                setRules((list) => (list.some((r) => r.id === saved.id) ? list.map((r) => (r.id === saved.id ? saved : r)) : [...list, saved]))
              }
              onDeleted={(id) => setRules((list) => list.filter((r) => r.id !== id))}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RuleForm({
  draft,
  onClose,
  onSaved,
  onDeleted,
}: {
  draft: RuleDraft;
  onClose: () => void;
  onSaved: (rule: BrandIconRule) => void;
  onDeleted: (id: number) => void;
}) {
  const t = useTranslations("settings.brandIcons");
  const router = useRouter();
  const confirm = useConfirm();
  const ids = useId();
  const [pattern, setPattern] = useState(draft.pattern);
  const [matchType, setMatchType] = useState<MatchType>(draft.matchType);
  const [icon, setIcon] = useState<string | null>(draft.icon);
  const [bgColor, setBgColor] = useState<string | null>(draft.bgColor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = draft.id != null;
  const canSave = !!pattern.trim() && !!icon && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const body = { namePattern: pattern.trim(), ...matchTypeToFlags(matchType), brandIcon: icon, iconColor: null, iconBgColor: bgColor };
    try {
      const res = await fetch("/api/brand-icon-rules", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { id: draft.id, ...body } : body),
      });
      if (!res.ok) throw new Error(String(res.status));
      const saved = (await res.json().catch(() => null)) as BrandIconRule | null;
      if (saved?.id != null) onSaved(saved);
      await fetch("/api/apply-brand-rules", { method: "POST" });
      router.refresh();
      onClose();
    } catch {
      setError(t("saveError"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (draft.id == null) return;
    const ok = await confirm({
      title: t("deleteRuleTitle"),
      body: t("deleteRuleBody"),
      confirmLabel: t("deleteRuleConfirm"),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/brand-icon-rules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draft.id }),
      });
      if (!res.ok) throw new Error(String(res.status));
      onDeleted(draft.id);
      await fetch("/api/apply-brand-rules", { method: "POST" });
      router.refresh();
      onClose();
    } catch {
      setError(t("deleteError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ClearDialogHeader
        title={isEdit ? t("editTitle") : t("newTitle")}
        subtitle={t("dialogSubtitle")}
        icon={<Icon iconKey={icon} background={bgColor} soft size="md" />}
        onClose={onClose}
        closeLabel={t("close")}
      />

      <ClearField label={t("pattern")} htmlFor={`${ids}-pattern`}>
        <ClearInput
          id={`${ids}-pattern`}
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder={t("patternPlaceholder")}
          autoComplete="off"
        />
      </ClearField>

      <div className="flex flex-col gap-1.5">
        <span id={`${ids}-match`} className={FIELD_LABEL}>{t("matchLabel")}</span>
        <Segmented
          label={t("matchLabel")}
          surface="tile"
          size="sm"
          value={matchType}
          onChange={setMatchType}
          className="w-full [&>button]:flex-1"
          items={[
            { value: "contains", label: t("matchContains") },
            { value: "word", label: t("matchWord") },
            { value: "exact", label: t("matchExact") },
          ]}
        />
        <span className="text-[13px] text-clear-muted">{t(`matchHint.${matchType}`)}</span>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="rounded-clear-tile bg-clear-tile px-4 py-3">
          <PickerField label={t("icon")}>
            <BrandIconPicker value={icon} onChange={setIcon} />
          </PickerField>
        </div>
        <div className="rounded-clear-tile bg-clear-tile px-4 py-3">
          <PickerField label={t("background")}>
            <ColorPicker value={bgColor ?? ""} onChange={(v) => setBgColor(v || null)} previewIcon={icon} />
          </PickerField>
        </div>
      </div>

      {error && <SettingsNotice>{error}</SettingsNotice>}

      <div className="border-t border-clear-ground pt-[18px] pb-1">
        <ClearDialogFooter
          destructive={
            isEdit && (
              <ClearButton variant="danger" onClick={remove} disabled={busy}>
                <IconTrash aria-hidden />
                {t("delete")}
              </ClearButton>
            )
          }
        >
          <ClearButton variant="secondary" onClick={onClose}>{t("cancel")}</ClearButton>
          <ClearButton onClick={save} disabled={!canSave}>
            {busy ? t("saving") : isEdit ? t("save") : t("addRule")}
          </ClearButton>
        </ClearDialogFooter>
      </div>
    </>
  );
}
