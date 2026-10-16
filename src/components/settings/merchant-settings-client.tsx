"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconChartLine, IconTrash } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Icon } from "@/components/icon";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { ClearButton } from "@/components/clear/button";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField, ClearInput } from "@/components/clear/field";
import { Amount } from "@/components/clear/amount";
import { BrandIconPicker } from "@/components/brand-icon-picker";
import { PickerField } from "@/components/picker-field";
import { SettingsNotice } from "@/components/settings/settings-ui";
import { brandColorForIconKey, detectBrandIcon } from "@/lib/brand-detect";
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
}

interface Props {
  merchant: EditableMerchant;
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
export function MerchantSettingsClient({ merchant, onClose, onViewProfile }: Props) {
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
      body: JSON.stringify({ id: merchant.id, name: name.trim(), icon, color }),
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
        icon={<Icon iconKey={icon} color={icon ? color : null} background={icon ? MERCHANT_ICON_BACKGROUND : null} soft size="md" />}
        onClose={onClose}
        closeLabel={t("close")}
      />

      <ClearField label={t("name")} htmlFor={`${ids}-name`} hint={t("nameHint")}>
        <ClearInput id={`${ids}-name`} value={name} onChange={(e) => changeName(e.target.value)} placeholder={t("namePlaceholder")} autoComplete="off" />
      </ClearField>

      <div className="rounded-clear-tile bg-clear-tile px-4 py-3">
        <PickerField label={t("icon")}>
          {/* Picking a logo also adopts that brand's own color, so the saved color
              never drifts from the icon (it drives the profile's wash and chart). */}
          <BrandIconPicker
            value={icon}
            onChange={(next) => {
              setIcon(next);
              setColor(brandColorForIconKey(next) ?? null);
            }}
          />
        </PickerField>
      </div>

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

      <div className="border-t border-clear-ground pt-[18px] pb-1">
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
      </div>
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
