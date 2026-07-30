"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconEyeOff, IconEye, IconTrash, IconX } from "@tabler/icons-react";
import { bottomDockClass } from "@/components/bottom-nav";
import { CategoryPicker } from "@/components/category-picker";
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
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!confirm(t("bulkConfirmDelete", { count }))) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
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

  const actionClass =
    "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-sm font-medium transition-colors active:bg-foreground/10 disabled:opacity-40";

  return (
    <div className={cn(bottomDockClass, "z-50")}>
      <div className="glass-nav rounded-3xl border border-white/10 bg-white/80 dark:bg-white/7 backdrop-blur-lg p-3 shadow-floating">
        <div className="flex items-center justify-between px-1 pb-2">
          <p className="text-sm font-semibold">{t("bulkSelected", { count })}</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onSelectAll}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-foreground/70 active:bg-foreground/10"
            >
              {allSelected ? t("bulkSelectNone") : t("bulkSelectAll", { count: total })}
            </button>
            <button
              type="button"
              onClick={onDone}
              aria-label={t("bulkDone")}
              className="rounded-full p-2 text-foreground/70 active:bg-foreground/10"
            >
              <IconX className="size-5" />
            </button>
          </div>
        </div>

        <div className="flex items-stretch gap-1">
          {/* CategoryPicker brings its own trigger button and full-screen sheet, so it
              only needs to be dressed to match the two buttons beside it. Passing
              onChange puts it in form mode: it reports the picked category instead of
              writing a `category` search param. */}
          <CategoryPicker
            categories={categories}
            placeholder={t("bulkCategory")}
            onChange={(value) => patch({ categoryId: value ? Number(value) : null })}
            triggerClassName={actionClass}
          />

          <button type="button" onClick={() => patch({ excludeFromReports: !allExcluded })} disabled={busy || count === 0} className={actionClass}>
            {allExcluded ? <IconEye className="size-5" /> : <IconEyeOff className="size-5" />}
            {allExcluded ? t("bulkInclude") : t("bulkExclude")}
          </button>

          <button type="button" onClick={remove} disabled={busy || count === 0} className={cn(actionClass, "text-destructive")}>
            <IconTrash className="size-5" />
            {t("bulkDelete")}
          </button>
        </div>

        {error && <p className="px-1 pt-2 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
