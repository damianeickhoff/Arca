"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconCircleCheck, IconTrash } from "@tabler/icons-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import { formatEur } from "@/lib/format";
import { isValidISODate } from "@/lib/date-valid";
import type { BrokenDateRow } from "@/lib/data-health";

/**
 * Repairs transactions whose stored date isn't a real date — the wreckage of a CSV
 * imported with the date mapped to the wrong column.
 *
 * These rows can't be reached from the transactions list: it filters on a TEXT date
 * column, so a value like "Albert Heijn" falls outside every range. This panel is the
 * only place they can be seen, corrected or removed.
 */
export function DataHealthClient({ rows, panelHeader = true }: { rows: BrokenDateRow[]; panelHeader?: boolean }) {
  const t = useTranslations("dataHealth");
  const router = useRouter();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [fixes, setFixes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function remove(ids: number[]) {
    if (ids.length === 0) return;
    if (!confirm(t("confirmDelete", { count: ids.length }))) return;
    setBusy(true);
    setError(null);
    try {
      // The transactions API already supports bulk delete by ids, and reverses any
      // savings-goal contributions these rows made on the way out.
      const res = await fetch("/api/transactions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function fix(id: number) {
    const date = fixes[id];
    if (!isValidISODate(date)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, date }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {panelHeader && <PanelHeader title={t("title")} />}
      <div className="px-4 pt-1 pb-8 space-y-4">
        {rows.length === 0 ? (
          <div className="rounded-2xl bg-[var(--dialog-content-background)] py-16 text-center">
            <IconCircleCheck className="size-10 mx-auto text-green-600" />
            <p className="text-sm text-muted-foreground mt-3">{t("allClear")}</p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl bg-[var(--dialog-content-background)] p-4 space-y-1">
              <p className="font-semibold">{t("brokenDatesTitle", { count: rows.length })}</p>
              <p className="text-sm text-muted-foreground">{t("brokenDatesBody")}</p>
            </div>

            <div className="space-y-3">
              {rows.map((row) => (
                <div key={row.id} className="rounded-2xl bg-[var(--dialog-content-background)] p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1.5 size-4 shrink-0 accent-[var(--foreground)]"
                      checked={selected.has(row.id)}
                      onChange={() => toggle(row.id)}
                      aria-label={t("selectRow")}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{row.description || "—"}</p>
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {formatEur(row.direction === "expense" ? -row.amount : row.amount)}
                        {row.account ? ` · ${row.account}` : ""}
                      </p>
                      <p className="text-xs text-destructive mt-1 break-all">
                        {t("storedAs")}: <span className="font-mono">{row.date || "—"}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={fixes[row.id] ?? ""}
                      onChange={(e) => setFixes((f) => ({ ...f, [row.id]: e.target.value }))}
                      className="flex-1 text-sm"
                      aria-label={t("correctDate")}
                    />
                    <Button
                      variant="outline"
                      onClick={() => fix(row.id)}
                      disabled={busy || !isValidISODate(fixes[row.id])}
                    >
                      {t("fix")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => remove([...selected])}
                disabled={busy || selected.size === 0}
              >
                <IconTrash className="size-4" />
                {t("deleteSelected", { count: selected.size })}
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => remove(rows.map((r) => r.id))}
                disabled={busy}
              >
                {t("deleteAll", { count: rows.length })}
              </Button>
            </div>
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </>
  );
}
