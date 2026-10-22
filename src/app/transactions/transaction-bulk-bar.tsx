"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { refreshLayoutAction } from "@/app/actions/refresh-layout";
import { useTranslations } from "next-intl";
import { IconBuildingStore, IconEyeOff, IconEye, IconTag, IconTrash, IconX } from "@tabler/icons-react";
import { bottomDockClass } from "@/components/dock";
import { CategoryPickerSheet } from "@/components/category-picker";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { MerchantPickerDialog } from "./_activity/merchant-picker";
import { acquireNavHidden } from "@/lib/nav-visibility";
import { cn } from "@/lib/utils";
import type { Category } from "@/db/schema";

interface Props {
  selectedIds: number[];
  categories: Category[];
  /** True when every selected row is already excluded from reports, so the button
   *  offers to put them back instead. */
  allExcluded: boolean;
  onDone: () => void;
  onSelectAll: () => void;
  allSelected: boolean;
  total: number;
  /** After a category was set (and the rules, one per merchant, when switched on): every
   *  id it changed. Needs a category takes them out of its queue. */
  onCategorized?: (ids: number[]) => void;
}

/**
 * The action bar for multi-select on the transactions list. Docks where the bottom
 * navigation normally sits — the nav is hidden for the duration, since select mode owns
 * the screen until it's dismissed.
 *
 * Every action goes through the transactions API's existing bulk endpoints
 * (`PATCH { ids, … }` and `DELETE { ids }`), which already handle clearing splits on a
 * re-categorisation and reversing savings-goal contributions on delete.
 */
export function TransactionBulkBar({ selectedIds, categories, allExcluded, onDone, onSelectAll, allSelected, total, onCategorized }: Props) {
  const t = useTranslations("transactions");
  const tActivity = useTranslations("activity");
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [merchantOpen, setMerchantOpen] = useState(false);

  useEffect(() => acquireNavHidden(), []);

  const count = selectedIds.length;

  // The merchant picker get-or-creates the merchant by name; every selected row then
  // moves to it in one bulk update.
  async function pickMerchant(name: string) {
    setError(null);
    const res = await fetch("/api/merchants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const merchant: { id: number } = await res.json();
    setMerchantOpen(false);
    await patch({ merchantId: merchant.id });
  }

  async function patch(data: Record<string, unknown>) {
    if (count === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, ...data }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
      onDone();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (count === 0) return;
    const ok = await confirm({
      title: t("bulkConfirmDelete", { count }),
      body: t("bulkConfirmDeleteBody", { count }),
      confirmLabel: t("bulkConfirmDeleteLabel", { count }),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!res.ok) throw new Error(await res.text());
      await refreshLayoutAction();
      router.refresh();
      onDone();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // The black floating pill from the design: the count in an ember dot, then the
  // actions as light text buttons. It inverts with the theme (primary colours).
  const actionClass =
    "inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full px-3.5 font-clear text-sm font-bold text-clear-primary-ink transition-colors hover:bg-clear-primary-ink/10 disabled:opacity-40 [&_svg]:size-[17px]";

  return (
    <div className={cn(bottomDockClass, "z-50 flex justify-center")}>
      <div
        role="toolbar"
        aria-label={t("bulkSelected", { count })}
        className="flex max-w-full flex-wrap items-center justify-center gap-1 rounded-[28px] bg-clear-primary px-2 py-2 text-clear-primary-ink shadow-clear-float"
      >
        <span className="mr-1 inline-flex items-center gap-2.5 border-r border-clear-primary-ink/20 pl-1.5 pr-3 text-sm font-bold">
          <span aria-hidden className="inline-flex size-[30px] items-center justify-center rounded-full bg-clear-ember text-[13px] font-extrabold text-clear-ember-ink">
            {count}
          </span>
          {t("bulkSelected", { count })}
        </span>

        <button type="button" onClick={() => setPickerOpen(true)} disabled={busy || count === 0} aria-haspopup="dialog" className={actionClass}>
          <IconTag />
          {t("bulkCategory")}
        </button>
        {/* The picker saves the category itself (and the rule, when switched on). */}
        <CategoryPickerSheet
          categories={categories}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          apply={{
            ids: selectedIds,
            onApplied: (categoryId, ids) => {
              if (categoryId != null) onCategorized?.(ids);
              router.refresh();
              onDone();
            },
          }}
        />

        <button type="button" onClick={() => setMerchantOpen(true)} disabled={busy || count === 0} aria-haspopup="dialog" className={actionClass}>
          <IconBuildingStore />
          {t("bulkMerchant")}
        </button>
        <MerchantPickerDialog
          open={merchantOpen}
          currentId={null}
          suggestion=""
          subtitle={t("bulkMerchantFor", { count })}
          footerHint={t("bulkMerchantHint", { count })}
          onOpenChange={setMerchantOpen}
          onPick={pickMerchant}
        />

        <button type="button" onClick={() => patch({ excludeFromReports: !allExcluded })} disabled={busy || count === 0} className={actionClass}>
          {allExcluded ? <IconEye /> : <IconEyeOff />}
          {allExcluded ? t("bulkInclude") : t("bulkExclude")}
        </button>

        <button type="button" onClick={remove} disabled={busy || count === 0} className={cn(actionClass, "text-clear-negative-fill")}>
          <IconTrash />
          {t("bulkDelete")}
        </button>

        <button type="button" onClick={onSelectAll} disabled={total === 0} className={actionClass}>
          {allSelected ? t("bulkSelectNone") : t("bulkSelectAll", { count: total })}
        </button>

        <button type="button" onClick={onDone} className={cn(actionClass, "ml-1 bg-clear-primary-ink/10")}>
          <IconX />
          {tActivity("bulk.deselect")}
        </button>

        {error && <p className="w-full px-3 pt-1 text-xs text-clear-negative-fill">{error}</p>}
      </div>
    </div>
  );
}
