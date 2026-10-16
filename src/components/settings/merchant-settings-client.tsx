"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconChartLine, IconChevronLeft, IconTrash } from "@tabler/icons-react";
import { Icon } from "@/components/icon";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { ClearButton } from "@/components/clear/button";
import { ClearField, ClearInput } from "@/components/clear/field";
import { Amount } from "@/components/clear/amount";
import { BrandIconPicker } from "@/components/brand-icon-picker";
import { PickerField } from "@/components/picker-field";
import { RowIconButton, SettingsNotice } from "@/components/settings/settings-ui";
import { cn } from "@/lib/utils";
import { SHEET_COLUMN } from "@/components/page-container";
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

/** Full-screen merchant editor: back + delete, the logo and name, the icon picker,
 *  the merchant's activity, then Cancel / Save. */
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
    <div className="flex min-h-full flex-col font-clear text-clear-ink">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-[calc(var(--sat,0px)+20px)] pb-2 lg:pt-6">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("back")}
          className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-clear-tile text-clear-ink transition-colors hover:bg-clear-line"
        >
          <IconChevronLeft size={20} stroke={2.2} aria-hidden />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-clear-muted">{t("editTitle")}</span>
        <RowIconButton label={t("deleteLabel")} onClick={remove} disabled={loading} danger>
          <IconTrash stroke={2} />
        </RowIconButton>
      </div>

      <div className="flex flex-1 flex-col gap-6 px-4 pt-2 pb-6">
        {/* The logo and name. No icon → <Icon>'s neutral placeholder chip; colour and
            background both go with it, or either alone would paint a solid swatch. */}
        <div className="flex items-center gap-4">
          <Icon
            iconKey={icon}
            color={icon ? color : null}
            background={icon ? MERCHANT_ICON_BACKGROUND : null}
            soft
            size="xl"
          />
          <h2 className="m-0 min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-[-0.02em]">{name || t("namePlaceholder")}</h2>
        </div>

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
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 flex justify-end gap-2.5 border-t border-clear-ground bg-clear-card px-4 pt-3 pb-[calc(1rem+var(--sab,0px))]">
        <ClearButton variant="secondary" onClick={onClose}>{t("cancel")}</ClearButton>
        <ClearButton onClick={save} disabled={loading || !name.trim()}>
          {loading ? t("saving") : t("save")}
        </ClearButton>
      </div>
    </div>
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

/** Slide-over host for the editor: a full-screen layer that animates in from the right
 * and back out on close, the same motion the settings dialog gives its own panels.
 * `open` drives both directions; the layer stays mounted through the exit transition. */
export function MerchantSettingsOverlay({
  open,
  zIndex,
  children,
}: {
  open: boolean;
  zIndex: number;
  children: React.ReactNode;
}) {
  // Mount at translate-x-full, then flip on the next frame so the browser has a
  // starting position to animate *from* (setting both in one paint would just snap).
  // The closed case is handled by mirroring `open` during render rather than in the
  // effect, so exiting doesn't wait a frame — it starts on the same paint.
  const [shown, setShown] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) setShown(false);
  }
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  return (
    <div
      // `fixed inset-0` escapes the sheet it slides over, so it needs the column cap
      // itself to stay aligned with that sheet on desktop.
      className={cn(SHEET_COLUMN, "fixed inset-0 overflow-y-auto bg-clear-card")}
      style={{
        zIndex,
        transform: shown ? "translateX(0)" : "translateX(100%)",
        transition: "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)",
        pointerEvents: open ? "auto" : "none",
      }}
    >
      {children}
    </div>
  );
}
