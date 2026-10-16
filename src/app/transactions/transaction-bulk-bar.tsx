"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { refreshLayoutAction } from "@/app/actions/refresh-layout";
import { useTranslations } from "next-intl";
import { IconEyeOff, IconEye, IconTag, IconTrash, IconX } from "@tabler/icons-react";
import { bottomDockClass } from "@/components/dock";
import { CategoryPickerSheet } from "@/components/category-picker";
import { useConfirm } from "@/components/clear/confirm-dialog";
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
export function TransactionBulkBar({ selectedIds, categories, allExcluded, onDone, onSelectAll, allSelected, total }: Props) {
  const t = useTranslations("transactions");
  const tActivity = useTranslations("activity");
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => acquireNavHidden(), []);

  const count = selectedIds.length;

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
            onApplied: () => {
              router.refresh();
              onDone();
            },
          }}
        />

        <button type="button" onClick={() => patch({ excludeFromReports: !allExcluded })} disabled={busy || count === 0} className={actionClass}>
          {allExcluded ? <IconEye /> : <IconEyeOff />}
          {allExcluded ? t("bulkInclude") : t("bulkExclude")}
        </button>

        <button type="button" onClick={remove} disabled={busy || count === 0} className={cn(actionClass, "text-clear-negative-fill")}>
          <IconTrash />
          {t("bulkDelete")}
        </button>

        {/* Desktop has the select-all checkbox in the list header. */}
        <button type="button" onClick={onSelectAll} className={cn(actionClass, "lg:hidden")}>
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
