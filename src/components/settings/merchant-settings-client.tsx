"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconChartLine, IconChevronDown, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import type { Category } from "@/db/schema";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Icon } from "@/components/icon";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { ClearButton } from "@/components/clear/button";
import { ClearDialogFooter, ClearDialogFooterDock, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField, ClearInput } from "@/components/clear/field";
import { Amount } from "@/components/clear/amount";
import { ClearChip } from "@/components/clear/chip";
import { Segmented } from "@/components/clear/segmented";
import { AnchoredTip } from "@/components/anchored-tip";
import { CategoryPickerSheet } from "@/components/category-picker";
import type { PatternMatchType } from "@/lib/merchant-patterns";
import { IconPickerField } from "@/components/icon-picker";
import { PickerField } from "@/components/picker-field";
import { SettingsNotice } from "@/components/settings/settings-ui";
import { detectBrandIcon } from "@/lib/brand-detect";
import { isValidISODate } from "@/lib/date-valid";
import { MERCHANT_ICON_BACKGROUND } from "@/components/merchant-detail-portal";

/** Just the fields the editor needs — satisfied by MerchantListItem (settings list). */
export interface EditableMerchant {
  id: number;
  name: string;
  icon: string | null;
  color: string | null;
  transactionCount: number;
  totalSpent: number;
  lastVisit: string | null;
  defaultCategoryId: number | null;
  patterns: { pattern: string; matchType: PatternMatchType }[];
}

interface Props {
  merchant: EditableMerchant;
  /** For the merchant's own category. */
  categories: Category[];
  onClose: () => void;
  /** Opens this merchant's spending profile. Omitted where there's nowhere to open it. */
  onViewProfile?: () => void;
}

/** The Edit merchant dialog — a centred modal on desktop, a bottom sheet on phones,
 *  like every other editor. `merchant` stays set while it animates closed. */
export function EditMerchantDialog({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const t = useTranslations("settings.merchants");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent hideHeaderRow title={t("editTitle")} className="gap-[18px] pt-6 font-clear text-clear-ink" sheetClassName="lg:max-w-[600px]">
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** The merchant editor: the logo and name, the icon picker, the merchant's activity,
 *  then Delete, Cancel and Save. */
export function MerchantSettingsClient({ merchant, categories, onClose, onViewProfile }: Props) {
  const router = useRouter();
  const t = useTranslations("settings.merchants");
  const locale = useLocale();
  const confirm = useConfirm();
  const ids = useId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Merchants stored before brand detection existed have no icon of their own; show
  // (and, on save, persist) the one their name matches rather than a blank chip.
  const initialBrand = merchant.icon ? null : detectBrandIcon(merchant.name);
  const [name, setName] = useState(merchant.name);
  const [icon, setIcon] = useState<string | null>(merchant.icon ?? initialBrand?.iconKey ?? null);
  const [color, setColor] = useState<string | null>(merchant.color ?? initialBrand?.color ?? null);
  const [patterns, setPatterns] = useState(merchant.patterns);
  const [defaultCategoryId, setDefaultCategoryId] = useState<number | null>(merchant.defaultCategoryId);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const defaultCategory = categories.find((c) => c.id === defaultCategoryId) ?? null;

  /** Typing a name that matches a known brand swaps the logo in as you type. An
   * unrecognised name leaves whatever icon is already set alone, so hand-picking an
   * icon and then fixing a typo in the name doesn't silently throw the icon away. */
  function changeName(value: string) {
    setName(value);
    const brand = detectBrandIcon(value);
    if (brand) {
      setIcon(brand.iconKey);
      setColor(brand.color);
    }
  }

  async function save() {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/merchants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: merchant.id,
        name: name.trim(),
        icon,
        color,
        // Only sent when changed: either one re-runs the rules over every transaction.
        ...(defaultCategoryId !== merchant.defaultCategoryId ? { defaultCategoryId } : {}),
        ...(JSON.stringify(patterns) !== JSON.stringify(merchant.patterns) ? { patterns } : {}),
      }),
    }).catch(() => null);
    setLoading(false);
    if (!res?.ok) {
      setError(t("saveError"));
      return;
    }
    router.refresh();
    onClose();
  }

  async function remove() {
    const ok = await confirm({
      title: t("deleteTitle", { name: merchant.name }),
      body: t("deleteBody", { count: merchant.transactionCount }),
      confirmLabel: t("deleteConfirm"),
      destructive: true,
    });
    if (!ok) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/merchants", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: merchant.id }),
    }).catch(() => null);
    setLoading(false);
    if (!res?.ok) {
      setError(t("deleteError"));
      return;
    }
    router.refresh();
    onClose();
  }

  const lastVisit =
    merchant.lastVisit && isValidISODate(merchant.lastVisit)
      ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${merchant.lastVisit}T12:00:00`))
      : null;

  return (
    <>
      {/* No icon → <Icon>'s neutral placeholder chip; colour and background both go
          with it, or either alone would paint a solid swatch. */}
      <ClearDialogHeader
        title={name || t("namePlaceholder")}
        subtitle={t("editTitle")}
        icon={<Icon iconKey={icon} color={icon ? color : null} background={icon ? MERCHANT_ICON_BACKGROUND : null} soft size="xl" />}
        onClose={onClose}
        closeLabel={t("close")}
      />

      <ClearField label={t("name")} htmlFor={`${ids}-name`} hint={t("nameHint")}>
        <ClearInput id={`${ids}-name`} value={name} onChange={(e) => changeName(e.target.value)} placeholder={t("namePlaceholder")} autoComplete="off" />
      </ClearField>

      <div className="rounded-clear-tile bg-clear-tile px-4 py-3">
        <PickerField label={t("icon")}>
          {/* "Auto" in the picker adopts a logo's own brand colour, so the saved colour
              never drifts from the icon (it drives the profile's wash and chart). */}
          <IconPickerField
            subject={{ kind: "merchant", name: name.trim() || merchant.name, id: merchant.id }}
            value={{ icon, color }}
            background={MERCHANT_ICON_BACKGROUND}
            onChange={(c) => {
              setIcon(c.icon);
              setColor(c.color);
            }}
          />
        </PickerField>
      </div>

      <PatternsField id={`${ids}-patterns`} merchantName={name.trim() || merchant.name} patterns={patterns} onChange={setPatterns} />

      <div className="flex flex-col gap-1.5">
        <span id={`${ids}-category`} className="text-[13px] font-bold text-clear-ink-2">{t("category")}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCategoryOpen(true)}
            aria-labelledby={`${ids}-category`}
            className="flex h-12 min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-clear-row bg-clear-tile px-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-clear-ember/50"
          >
            {defaultCategory && <Icon iconKey={defaultCategory.icon} color={defaultCategory.color} soft size="sm" />}
            <span className={defaultCategory ? "min-w-0 flex-1 truncate text-[15px] font-bold" : "min-w-0 flex-1 truncate text-[15px] font-semibold text-clear-placeholder"}>
              {defaultCategory?.name ?? t("categoryNone")}
            </span>
            {defaultCategory && <ClearChip tone="mint">{t("categoryAlways")}</ClearChip>}
            <IconChevronDown aria-hidden size={16} className="shrink-0 text-clear-muted" />
          </button>
          {defaultCategory && (
            <button
              type="button"
              onClick={() => setDefaultCategoryId(null)}
              aria-label={t("categoryClear")}
              title={t("categoryClear")}
              className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-clear-tile text-clear-ink-2 hover:bg-clear-line"
            >
              <IconX size={18} aria-hidden />
            </button>
          )}
        </div>
        <span className="text-[13px] text-clear-muted">{t("categoryHint", { name: name.trim() || merchant.name })}</span>
      </div>

      <CategoryPickerSheet
        open={categoryOpen}
        onOpenChange={setCategoryOpen}
        categories={categories}
        current={defaultCategoryId != null ? String(defaultCategoryId) : undefined}
        title={t("category")}
        onChange={(v) => {
          setDefaultCategoryId(v && v !== "none" ? Number(v) : null);
          setCategoryOpen(false);
        }}
      />

      <section aria-labelledby={`${ids}-activity`} className="flex flex-col gap-3">
        <h3 id={`${ids}-activity`} className="m-0 text-[15px] font-bold">{t("activity")}</h3>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <Stat label={t("transactions")}>
            <span className="clear-amount text-xl">{merchant.transactionCount}</span>
          </Stat>
          <Stat label={t("totalSpent")}>
            <Amount value={merchant.totalSpent} className="text-xl" />
          </Stat>
          {lastVisit && (
            <Stat label={t("lastVisit")}>
              <span className="text-[15px] font-bold">{lastVisit}</span>
            </Stat>
          )}
        </div>
        {onViewProfile && (
          <ClearButton variant="secondary" className="self-start" onClick={onViewProfile}>
            <IconChartLine aria-hidden stroke={2} />
            {t("viewProfile")}
          </ClearButton>
        )}
      </section>

      {error && <SettingsNotice>{error}</SettingsNotice>}

      <ClearDialogFooterDock className="border-t border-clear-ground pt-[18px] pb-1">
        <ClearDialogFooter
          destructive={
            <ClearButton variant="danger" onClick={remove} disabled={loading}>
              <IconTrash aria-hidden />
              {t("deleteLabel")}
            </ClearButton>
          }
        >
          <ClearButton variant="secondary" onClick={onClose}>{t("cancel")}</ClearButton>
          <ClearButton onClick={save} disabled={loading || !name.trim()}>
            {loading ? t("saving") : t("save")}
          </ClearButton>
        </ClearDialogFooter>
      </ClearDialogFooterDock>
    </>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-clear-tile bg-clear-tile px-4 py-3.5">
      <span className="text-[13px] font-bold text-clear-ink-2">{label}</span>
      {children}
    </div>
  );
}

const MATCH_TYPES: PatternMatchType[] = ["contains", "word", "exact"];

/** "Recognised by": the descriptions that belong to this merchant, as removable chips,
 *  and a field to add one (contains, whole word or exact). */
function PatternsField({
  id,
  merchantName,
  patterns,
  onChange,
}: {
  id: string;
  merchantName: string;
  patterns: { pattern: string; matchType: PatternMatchType }[];
  onChange: (next: { pattern: string; matchType: PatternMatchType }[]) => void;
}) {
  const t = useTranslations("settings.merchants");
  const [draft, setDraft] = useState("");
  const [matchType, setMatchType] = useState<PatternMatchType>("contains");
  const trimmed = draft.trim();
  const duplicate = patterns.some((p) => p.pattern.toLowerCase() === trimmed.toLowerCase());
  const canAdd = trimmed.length >= 2 && !duplicate;

  function add() {
    if (!canAdd) return;
    onChange([...patterns, { pattern: trimmed, matchType }]);
    setDraft("");
    setMatchType("contains");
  }

  return (
    <section aria-labelledby={id} data-tip-anchor="merchantPatterns" className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 id={id} className="m-0 text-[13px] font-bold text-clear-ink-2">{t("patternsLabel")}</h3>
        <p className="m-0 text-[13px] text-clear-muted">{t("patternsHint", { name: merchantName })}</p>
      </div>
      {patterns.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {patterns.map((p) => (
            <li key={p.pattern} className="inline-flex h-8 items-center gap-1 rounded-full bg-clear-tile pr-1 pl-3 text-[13px] font-bold">
              <span>{p.pattern}</span>
              {p.matchType !== "contains" && <span className="font-semibold text-clear-muted">· {t(`match.${p.matchType}`)}</span>}
              <button
                type="button"
                onClick={() => onChange(patterns.filter((x) => x.pattern !== p.pattern))}
                aria-label={t("patternRemove", { pattern: p.pattern })}
                className="inline-flex size-6 cursor-pointer items-center justify-center rounded-full text-clear-ink-2 hover:bg-clear-line"
              >
                <IconX size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <ClearInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={t("patternPlaceholder")}
          aria-label={t("patternPlaceholder")}
          autoComplete="off"
          className="min-w-[160px] flex-1"
        />
        <ClearButton variant="secondary" onClick={add} disabled={!canAdd}>
          <IconPlus aria-hidden />
          {t("patternAdd")}
        </ClearButton>
      </div>
      {trimmed.length > 0 && (
        <Segmented
          label={t("matchLabel")}
          surface="tile"
          size="sm"
          value={matchType}
          onChange={setMatchType}
          className="self-start"
          items={MATCH_TYPES.map((m) => ({ value: m, label: t(`match.${m}`) }))}
        />
      )}
      <AnchoredTip id="merchantPatterns" anchor="merchantPatterns" />
    </section>
  );
}
