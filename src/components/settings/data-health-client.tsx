"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconAlertTriangle, IconCircleCheck, IconRepeat, IconTrash } from "@tabler/icons-react";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import { SettingsNotice } from "@/components/settings/settings-ui";
import { DatePicker } from "@/components/date-picker";
import { ClearButton } from "@/components/clear/button";
import { IconTile } from "@/components/clear/icon-tile";
import { Amount } from "@/components/clear/amount";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { DATE_TRIGGER } from "@/app/settings/account-edit-dialogs";
import { isValidISODate } from "@/lib/date-valid";
import { cn } from "@/lib/utils";
import type { BrokenDateRow } from "@/lib/data-health";
import type { ActivityItem } from "@/lib/activity-log";
import { RecentChanges } from "@/components/settings/recent-changes";
import { AnchoredTip } from "@/components/anchored-tip";
import { findRegularPaymentsAction } from "@/app/actions/recurring-suggestions";
import { BackupsCard } from "@/components/settings/backups-card";
import type { BackupInfo } from "@/lib/backups";

/**
 * Repairs transactions whose stored date isn't a real date — the wreckage of a CSV
 * imported with the date mapped to the wrong column.
 *
 * These rows can't be reached from the transactions list: it filters on a TEXT date
 * column, so a value like "Albert Heijn" falls outside every range. This panel is the
 * only place they can be seen, corrected or removed. Below that: the full pass of the
 * recurring detector ("Look for regular payments") and Recent changes, the change log
 * with undo.
 */
export function DataHealthClient({
  rows,
  changes,
  backups,
  canManageBackups,
}: {
  rows: BrokenDateRow[];
  changes: ActivityItem[];
  backups: BackupInfo[];
  canManageBackups: boolean;
}) {
  const t = useTranslations("dataHealth");
  const tPanels = useTranslations("settings.panels");
  const locale = useLocale();
  const router = useRouter();
  const confirm = useConfirm();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [fixes, setFixes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateLabel = (iso: string) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso}T12:00:00`));

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
    const ok = await confirm({
      title: t("confirmDelete", { count: ids.length }),
      body: t("confirmDeleteBody", { count: ids.length }),
      confirmLabel: t("confirmDeleteLabel", { count: ids.length }),
      destructive: true,
    });
    if (!ok) return;
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
      if (!res.ok) throw new Error(String(res.status));
      setSelected(new Set());
      router.refresh();
    } catch {
      setError(t("deleteError"));
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
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setError(t("fixError"));
    } finally {
      setBusy(false);
    }
  }

  const allSelected = rows.length > 0 && selected.size === rows.length;

  return (
    <>
      <PanelHeader title={tPanels("dataHealth.title")} />
      <div className="flex flex-col gap-5 px-4 pt-1 font-clear text-clear-ink">
        {/* Status */}
        <div className="flex items-center gap-3.5 rounded-clear-tile bg-clear-tile p-4">
          <IconTile tone={rows.length === 0 ? "mint" : "peach"} size="md">
            {rows.length === 0 ? <IconCircleCheck stroke={1.9} /> : <IconAlertTriangle stroke={1.9} />}
          </IconTile>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h3 className="m-0 text-[17px] font-extrabold">
              {rows.length === 0 ? t("allClearTitle") : t("brokenDatesTitle", { count: rows.length })}
            </h3>
            <p className="m-0 text-sm text-clear-ink-2">{rows.length === 0 ? t("allClear") : t("brokenDatesBody")}</p>
          </div>
        </div>

        {rows.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-3 px-1">
              <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm font-bold">
                <input
                  type="checkbox"
                  className="size-[18px] shrink-0 cursor-pointer accent-[var(--clr-ink)]"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                />
                {t("selectAll")}
              </label>
              <span className="text-[13px] text-clear-muted">{t("selectedCount", { count: selected.size })}</span>
            </div>

            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {rows.map((row) => {
                const value = fixes[row.id] ?? "";
                return (
                  <li
                    key={row.id}
                    className={cn(
                      "flex flex-col gap-3 rounded-clear-tile border-2 p-4 transition-colors",
                      selected.has(row.id) ? "border-clear-ink bg-clear-card" : "border-transparent bg-clear-tile",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-[var(--clr-ink)]"
                        checked={selected.has(row.id)}
                        onChange={() => toggle(row.id)}
                        aria-label={t("selectRowNamed", { name: row.description || "—" })}
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[15px] font-bold">{row.description || "—"}</span>
                        {row.account && <span className="truncate text-[13px] text-clear-muted">{row.account}</span>}
                        <span className="mt-1 text-[13px] text-clear-negative">
                          {t("storedAs")}: <span className="font-mono break-all">{row.date || "—"}</span>
                        </span>
                      </div>
                      <Amount value={row.direction === "expense" ? -row.amount : row.amount} className="shrink-0 text-[17px]" />
                    </div>

                    <div className="flex flex-wrap items-end gap-2.5">
                      <div role="group" aria-label={t("correctDate")} className="min-w-[200px] flex-1">
                        <DatePicker
                          value={value}
                          onChange={(v) => setFixes((f) => ({ ...f, [row.id]: v }))}
                          label={isValidISODate(value) ? dateLabel(value) : undefined}
                          placeholder={t("correctDate")}
                          triggerClassName={DATE_TRIGGER}
                        />
                      </div>
                      <ClearButton onClick={() => fix(row.id)} disabled={busy || !isValidISODate(value)}>
                        {t("fix")}
                      </ClearButton>
                    </div>
                  </li>
                );
              })}
            </ul>

            {error && <SettingsNotice>{error}</SettingsNotice>}

            <SettingsNotice tone="info">{t("deleteNote")}</SettingsNotice>

            <div className="flex flex-wrap gap-2.5">
              <ClearButton variant="secondary" onClick={() => remove([...selected])} disabled={busy || selected.size === 0}>
                <IconTrash aria-hidden />
                {t("deleteSelected", { count: selected.size })}
              </ClearButton>
              <ClearButton variant="danger" onClick={() => remove(rows.map((r) => r.id))} disabled={busy}>
                {t("deleteAll", { count: rows.length })}
              </ClearButton>
            </div>
          </>
        )}

        <BackupsCard backups={backups} canManage={canManageBackups} />

        <RegularPaymentsScan />

        <RecentChanges changes={changes} />
      </div>
    </>
  );
}

/**
 * "Look for regular payments": runs the recurring detector over the whole history.
 * Imports and bank syncs only re-test the counterparties they touched; this checks
 * everything, and points at Upcoming where the suggestions wait.
 */
function RegularPaymentsScan() {
  const t = useTranslations("dataHealth.regularPayments");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ tone: "success" | "info" | "error"; text: string; review: boolean } | null>(null);

  function scan() {
    setResult(null);
    startTransition(async () => {
      const r = await findRegularPaymentsAction();
      if (r.error) {
        setResult({ tone: "error", text: r.error === "busy" ? t("busy") : t("error"), review: false });
        return;
      }
      const found = r.suggested ?? 0;
      if (found === 0) setResult({ tone: "info", text: t("nothingNew"), review: false });
      else setResult({ tone: "success", text: t("found", { found }), review: true });
    });
  }

  return (
    <section aria-labelledby="regular-payments-title" className="flex flex-col gap-3 rounded-clear-tile bg-clear-tile p-4">
      <div className="flex items-start gap-3.5">
        <IconTile tone="lilac" size="md"><IconRepeat stroke={1.9} /></IconTile>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 id="regular-payments-title" className="m-0 text-[17px] font-extrabold">{t("title")}</h3>
          <p className="m-0 text-sm text-clear-ink-2">{t("body")}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2.5" data-tip-anchor="recurringScan">
        <ClearButton variant="surface" onClick={scan} disabled={pending}>
          {pending ? t("running") : t("run")}
        </ClearButton>
        {result?.review && (
          <Link href="/transactions/upcoming" className="text-sm font-bold text-clear-ember-text no-underline hover:underline">
            {t("review")}
          </Link>
        )}
      </div>
      {result && <SettingsNotice tone={result.tone}>{result.text}</SettingsNotice>}
      <AnchoredTip id="recurringScan" anchor="recurringScan" />
    </section>
  );
}
