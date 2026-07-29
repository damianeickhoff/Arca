"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { IconTrashFilled as Trash2, IconChartLine as ChartLine } from "@tabler/icons-react";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BrandIconPicker } from "@/components/brand-icon-picker";
import { PickerField } from "@/components/picker-field";
import { brandColorForIconKey, detectBrandIcon } from "@/lib/brand-detect";
import { formatEur, formatDate } from "@/lib/format";
import { MERCHANT_ICON_BACKGROUND } from "@/components/merchant-detail-portal";

/** Just the fields the editor needs — satisfied by both MerchantListItem (settings
 * list) and a MerchantDetail projection (the profile portal's edit action). */
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
  /** Called instead of onClose after a delete, for hosts that must tear down more than
   * this editor (the profile portal has nothing left to show). Defaults to onClose. */
  onDeleted?: () => void;
}

/** Full-screen merchant editor, laid out like CategorySettingsClient: color wash,
 * back + delete header, glyph hero, name field, then a sticky Save. */
export function MerchantSettingsClient({ merchant, onClose, onViewProfile, onDeleted }: Props) {
  const router = useRouter();
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
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not save this merchant.");
      return;
    }
    router.refresh();
    onClose();
  }

  async function remove() {
    if (!confirm(`Delete merchant "${merchant.name}"? Its ${merchant.transactionCount} transaction(s) stay, but lose their merchant.`)) return;
    setLoading(true);
    const res = await fetch("/api/merchants", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: merchant.id }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Failed to delete this merchant.");
      return;
    }
    router.refresh();
    (onDeleted ?? onClose)();
  }

  return (
    <div className="relative min-h-full pb-[calc(6rem+var(--sab))]">
      {/* Color wash from the icon's brand color, matching the category editor. */}
      {color && (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-90 pointer-events-none z-0"
          style={{ background: `radial-gradient(circle at top, ${color}55, transparent 70%)` }}
        />
      )}

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-5 pb-3 pt-4" style={{ paddingTop: "calc(1.1rem + var(--sat))" }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          className="size-11 rounded-full bg-white dark:bg-white/7 backdrop-blur-sm flex items-center justify-center active:scale-[0.97] transition-transform shrink-0"
        >
          <ChevronLeft className="size-5 text-foreground" />
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={loading}
          aria-label="Delete merchant"
          className="size-11 rounded-full bg-white dark:bg-white/7 backdrop-blur-sm flex items-center justify-center active:scale-[0.97] transition-transform shrink-0 disabled:opacity-50"
        >
          <Trash2 className="size-5 text-foreground" />
        </button>
      </div>

      {/* Hero */}
      <div className="relative z-10 flex flex-col items-center gap-3 px-4 pb-6 pt-1">
        {/* No icon → <Icon>'s neutral gray question-mark chip. Both color and
            background have to go with it: either one alone would paint a solid
            swatch instead of the placeholder. */}
        <Icon
          iconKey={icon}
          color={icon ? color : null}
          background={icon ? MERCHANT_ICON_BACKGROUND : null}
          round
          size="xxl"
          glyphSize={44}
        />
        <span className="text-lg font-semibold text-foreground">{name || "Merchant"}</span>
      </div>

      <div className="relative z-10 px-4 space-y-6">
        <Input
          value={name}
          onChange={(e) => changeName(e.target.value)}
          placeholder="Name"
          className="w-full h-14 rounded-2xl border-0 px-4 text-base bg-[var(--dialog-content-background)]"
        />

        <PickerField label="Icon">
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

        <div>
          <h3 className="px-1 pb-1.5 text-xs font-medium uppercase tracking-wide text-foreground/40">Activity</h3>
          <div className="bg-card/70 dark:bg-white/7 rounded-2xl overflow-hidden">
            <Row label="Transactions" value={String(merchant.transactionCount)} />
            <Divider />
            <Row label="Total spent" value={formatEur(merchant.totalSpent)} />
            {merchant.lastVisit && (
              <>
                <Divider />
                <Row label="Last visit" value={formatDate(merchant.lastVisit)} />
              </>
            )}
          </div>
        </div>

        {onViewProfile && (
          <button
            type="button"
            onClick={onViewProfile}
            className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-[var(--dialog-content-background)] text-sm font-medium active:scale-[0.99] transition-transform"
          >
            <ChartLine className="size-4" />
            View spending profile
          </button>
        )}

        {error && <p className="text-xs text-destructive px-1">{error}</p>}
      </div>

      {/* Sticky save */}
      <div className="sticky bottom-0 inset-x-0 px-4 pb-[calc(1rem+var(--sab))] pt-3 bg-gradient-to-t from-[var(--dialog-background)] via-[var(--dialog-background)] to-transparent">
        <Button onClick={save} disabled={loading || !name.trim()} className="w-full h-12">
          {loading ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}

/** Slide-over host for the editor: a full-screen layer that animates in from the right
 * and back out on close, the same motion the settings dialog gives its own panels.
 * `open` drives both directions; the layer stays mounted through the exit transition.
 * Rendered by both hosts (settings list and profile portal) so the animation and the
 * z-index reasoning live in one place. */
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
      className="fixed inset-0 bg-[var(--dialog-background)] overflow-y-auto"
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between bg-[var(--dialog-content-background)] gap-3 px-4 py-3 min-h-[3.25rem]">
      <span className="text-sm font-medium text-foreground shrink-0">{label}</span>
      <span className="text-sm text-foreground/60 tabular-nums">{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-foreground/8 dark:bg-white/10 mx-4" />;
}
