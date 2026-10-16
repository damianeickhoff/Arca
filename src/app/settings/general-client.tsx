"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconCalendarEvent, IconCalendarWeek, IconInfoCircle, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DatePicker } from "@/components/date-picker";
import { ClearButton } from "@/components/clear/button";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField, ClearInput } from "@/components/clear/field";
import { ClearProgress } from "@/components/clear/progress";
import { IconTile } from "@/components/clear/icon-tile";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { AnchoredTip } from "@/components/anchored-tip";
import { RowIconButton, SettingsEmpty, SettingsNotice, SettingsSwitchRow } from "@/components/settings/settings-ui";
import { DATE_TRIGGER, FIELD_LABEL } from "@/app/settings/account-edit-dialogs";
import { cn } from "@/lib/utils";
import {
  currentFinancialMonth,
  daysInclusive,
  financialMonthRangeByMonth,
  shiftDate,
  todayStr,
  type DateRange,
  type FinancialMonthConfig,
} from "@/lib/date-range";

type MonthOverride = {
  month: string;
  startDay: number;
};

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

function isValidStartDay(value: string) {
  const n = parseInt(value, 10);
  return !isNaN(n) && n >= 1 && n <= 28;
}

function isValidMonth(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function sortOverrides(rows: MonthOverride[]) {
  return [...rows].sort((left, right) => right.month.localeCompare(left.month));
}

/** Dates in the user's language: "25 Sep", "24 Oct 2026", "December 2026". */
function useDateFormats() {
  const locale = useLocale();
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const dayYear = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const month = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
  const at = (iso: string) => new Date(`${iso}T12:00:00`);
  return {
    day: (iso: string) => day.format(at(iso)),
    month: (m: string) => month.format(at(`${m}-01`)),
    range: (r: DateRange) => `${day.format(at(r.from))} – ${dayYear.format(at(r.to))}`,
  };
}

async function saveSetting(key: string, value: string | number) {
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  }).catch(() => null);
  return !!res?.ok;
}

// ── Financial month ──────────────────────────────────────────────────────────

/**
 * The Financial month panel: the day the month starts (a grid of 1–28 that saves on
 * tap), where today sits in the current period, and the weekend rollback switch.
 */
export function FinancialMonthForm({
  currentStartDay,
  currentWeekendRollback,
  overrides = {},
}: {
  currentStartDay: number;
  currentWeekendRollback: boolean;
  /** The saved month overrides, so the current period shown is the real one. */
  overrides?: Record<string, number>;
}) {
  const t = useTranslations("settings.financialMonth");
  const router = useRouter();
  const fmt = useDateFormats();
  const titleId = useId();
  const [startDay, setStartDay] = useState(currentStartDay);
  const [weekendRollback, setWeekendRollback] = useState(currentWeekendRollback);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [savingRollback, setSavingRollback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const config: FinancialMonthConfig = { defaultStartDay: startDay, overrides, weekendRollback };
  const range = financialMonthRangeByMonth(currentFinancialMonth(config), config);
  const today = todayStr();
  const total = Math.max(1, daysInclusive(range.from, range.to));
  const dayNo = Math.min(total, Math.max(1, daysInclusive(range.from, today)));
  const daysLeft = total - dayNo + 1;
  // The marker sits in the middle of today's slice of the bar.
  const marker = (dayNo - 0.5) / total;

  async function chooseDay(n: number) {
    if (n === startDay || status === "saving") return;
    const previous = startDay;
    setStartDay(n);
    setError(null);
    setStatus("saving");
    const ok = await saveSetting("month_start_day", n);
    if (!ok) {
      setStartDay(previous);
      setStatus("idle");
      setError(t("startDayError"));
      return;
    }
    setStatus("saved");
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setStatus("idle"), 2000);
    router.refresh();
  }

  async function toggleWeekendRollback(checked: boolean) {
    setWeekendRollback(checked);
    setError(null);
    setSavingRollback(true);
    const ok = await saveSetting("month_start_weekend_rollback", checked ? "1" : "0");
    setSavingRollback(false);
    if (!ok) {
      setError(t("weekendError"));
      setWeekendRollback(!checked);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6 px-4 pt-2 font-clear text-clear-ink">
      <section aria-labelledby={titleId} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 id={titleId} className="m-0 text-lg font-bold">{t("title")}</h3>
            <span className="text-sm text-clear-muted">{t("subtitle")}</span>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[13px] font-bold text-clear-ink-2">{t("startDay")}</span>
            <span className="text-[26px] leading-tight font-extrabold tracking-[-0.03em]">{t("startDayValue", { day: startDay })}</span>
          </div>
        </div>

        <div role="radiogroup" aria-labelledby={titleId} data-tip-anchor="financialMonthDays" className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {DAYS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === startDay}
              aria-label={t("dayLabel", { day: n })}
              onClick={() => chooseDay(n)}
              className={cn(
                "h-10 cursor-pointer rounded-full text-[15px] tabular-nums outline-none transition-colors focus-visible:ring-3 focus-visible:ring-clear-ember/50 sm:h-12",
                n === startDay ? "bg-clear-ember font-extrabold text-clear-ember-ink" : "bg-clear-tile font-semibold text-clear-ink hover:bg-clear-line",
              )}
            >
              {n}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-sm text-clear-ink-2">
            <IconInfoCircle aria-hidden size={16} stroke={2} className="shrink-0" />
            {t("periodHint", { range: fmt.range(range) })}
          </span>
          <span role="status" aria-live="polite" className="text-[13px] font-semibold text-clear-muted">
            {status === "saving" ? t("saving") : status === "saved" ? t("saved") : ""}
          </span>
        </div>

        {error && <SettingsNotice>{error}</SettingsNotice>}

        {/* Where today sits in the period. */}
        <div className="flex flex-col gap-3.5 rounded-clear-tile bg-clear-tile px-5 py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[15px] font-bold">{t("currentPeriod")}</span>
            <span className="text-[13px] text-clear-ink-2">{t("dayOf", { day: dayNo, total, left: daysLeft })}</span>
          </div>
          <div
            role="img"
            aria-label={t("timelineAria", { from: fmt.day(range.from), to: fmt.day(range.to), today: fmt.day(today), day: dayNo, total })}
            className="relative pt-9"
          >
            <span
              aria-hidden
              className="absolute top-0 inline-flex h-[26px] -translate-x-1/2 items-center whitespace-nowrap rounded-full bg-clear-primary px-2.5 text-xs font-bold text-clear-primary-ink"
              // Kept inside the bar near either end, where centring it would hang it off.
              style={{ left: `${Math.min(0.86, Math.max(0.14, marker)) * 100}%` }}
            >
              {t("today", { date: fmt.day(today) })}
            </span>
            <ClearProgress value={dayNo / total} marker={marker} hatchRemainder />
          </div>
          <div className="flex justify-between gap-3">
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-bold">{fmt.day(range.from)}</span>
              <span className="text-xs text-clear-muted">{t("periodStarts")}</span>
            </span>
            <span className="flex flex-col items-end gap-0.5 text-right">
              <span className="text-sm font-bold">{fmt.day(range.to)}</span>
              <span className="text-xs text-clear-muted">{t("nextStarts", { date: fmt.day(shiftDate(range.to, 1)) })}</span>
            </span>
          </div>
        </div>
      </section>

      <SettingsSwitchRow
        icon={<IconCalendarWeek stroke={1.9} />}
        label={t("weekendLabel")}
        hint={t("weekendHint")}
        checked={weekendRollback}
        onCheckedChange={toggleWeekendRollback}
        disabled={savingRollback}
      />

      {/* The start day used to be a number field with a Save button; it is now a
          tap-to-save grid — say so once. */}
      <AnchoredTip id="financialMonthDays" anchor="financialMonthDays" />
    </div>
  );
}

// ── Month overrides ──────────────────────────────────────────────────────────

/** The Month overrides panel: one start day for a single month, e.g. when payday
 *  moves for a holiday. Add, edit and delete each open a dialog. */
export function MonthOverridesPanel({
  currentStartDay,
  initialOverrides,
}: {
  currentStartDay: number;
  initialOverrides: MonthOverride[];
}) {
  const router = useRouter();
  const t = useTranslations("settings.monthOverrides");
  const fmt = useDateFormats();
  const confirm = useConfirm();
  const [overrides, setOverrides] = useState(sortOverrides(initialOverrides));
  const [error, setError] = useState<string | null>(null);
  // The override being added (month null) or edited; kept while the dialog animates out.
  const [editor, setEditor] = useState<{ month: string | null; startDay: number } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  // Bumped per opening so every opening starts from the override as saved.
  const [session, setSession] = useState(0);

  const previewConfig: FinancialMonthConfig = {
    defaultStartDay: currentStartDay,
    overrides: Object.fromEntries(overrides.map((row) => [row.month, row.startDay])),
    weekendRollback: false,
  };

  function openEditor(row: MonthOverride | null) {
    setEditor(row ? { month: row.month, startDay: row.startDay } : { month: null, startDay: currentStartDay });
    setSession((n) => n + 1);
    setEditorOpen(true);
  }

  async function save(month: string, startDay: number): Promise<string | null> {
    const res = await fetch("/api/settings/financial-month-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, startDay }),
    }).catch(() => null);
    if (!res?.ok) return t("saveError", { month: fmt.month(month) });
    setOverrides((cur) => sortOverrides([...cur.filter((r) => r.month !== month), { month, startDay }]));
    setError(null);
    router.refresh();
    return null;
  }

  async function remove(month: string): Promise<boolean> {
    const ok = await confirm({
      title: t("deleteTitle", { month: fmt.month(month) }),
      body: t("deleteBody"),
      confirmLabel: t("deleteConfirm"),
      destructive: true,
    });
    if (!ok) return false;
    setError(null);
    const res = await fetch(`/api/settings/financial-month-overrides?month=${encodeURIComponent(month)}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setError(t("deleteError", { month: fmt.month(month) }));
      return false;
    }
    setOverrides((cur) => cur.filter((r) => r.month !== month));
    router.refresh();
    return true;
  }

  return (
    <div className="flex flex-col gap-5 px-4 pt-2 font-clear text-clear-ink">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 min-w-0 flex-1 text-sm text-clear-ink-2">{t("intro")}</p>
        <ClearButton size="sm" onClick={() => openEditor(null)}>
          <IconPlus aria-hidden stroke={2.2} />
          {t("add")}
        </ClearButton>
      </div>

      {error && <SettingsNotice>{error}</SettingsNotice>}

      {overrides.length === 0 ? (
        <SettingsEmpty
          icon={<IconCalendarEvent stroke={1.9} />}
          action={
            <ClearButton size="sm" variant="secondary" onClick={() => openEditor(null)}>
              <IconPlus aria-hidden stroke={2.2} />
              {t("add")}
            </ClearButton>
          }
        >
          {t("empty")}
        </SettingsEmpty>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {overrides.map((row) => {
            const usual = `${row.month}-${String(currentStartDay).padStart(2, "0")}`;
            const range = financialMonthRangeByMonth(row.month, previewConfig);
            const label = fmt.month(row.month);
            return (
              <li key={row.month} className="flex min-h-[72px] items-center gap-3.5 border-b border-clear-ground py-2 pr-1 pl-2 last:border-b-0">
                <IconTile tone="peach" size="md"><IconCalendarEvent stroke={1.9} /></IconTile>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-bold first-letter:uppercase">{label}</span>
                  <span className="text-[13px] text-clear-muted">
                    {row.startDay === currentStartDay
                      ? t("rowSame", { range: fmt.range(range) })
                      : t("row", { start: fmt.day(range.from), usual: fmt.day(usual), range: fmt.range(range) })}
                  </span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <RowIconButton label={t("editLabel", { month: label })} onClick={() => openEditor(row)}>
                    <IconPencil stroke={2} />
                  </RowIconButton>
                  <RowIconButton label={t("deleteLabel", { month: label })} onClick={() => remove(row.month)} danger>
                    <IconTrash stroke={2} />
                  </RowIconButton>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent
          hideHeaderRow
          title={editor?.month ? t("editTitle") : t("addTitle")}
          className="gap-[18px] pt-6 font-clear text-clear-ink"
          sheetClassName="lg:max-w-[520px]"
        >
          {editor && (
            <OverrideForm
              key={session}
              month={editor.month}
              startDay={editor.startDay}
              currentStartDay={currentStartDay}
              existing={overrides.map((o) => o.month)}
              onClose={() => setEditorOpen(false)}
              onSave={save}
              onDelete={async (month) => {
                if (await remove(month)) setEditorOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OverrideForm({
  month: editingMonth,
  startDay: initialStartDay,
  currentStartDay,
  existing,
  onClose,
  onSave,
  onDelete,
}: {
  /** null when adding. */
  month: string | null;
  startDay: number;
  currentStartDay: number;
  existing: string[];
  onClose: () => void;
  onSave: (month: string, startDay: number) => Promise<string | null>;
  onDelete: (month: string) => void;
}) {
  const t = useTranslations("settings.monthOverrides");
  const fmt = useDateFormats();
  const ids = useId();
  const [month, setMonth] = useState(() => {
    if (editingMonth) return editingMonth;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [startDay, setStartDay] = useState(String(initialStartDay));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dayOk = isValidStartDay(startDay);
  const valid = isValidMonth(month) && dayOk;
  const preview = valid
    ? financialMonthRangeByMonth(month, { defaultStartDay: currentStartDay, overrides: { [month]: parseInt(startDay, 10) }, weekendRollback: false })
    : null;
  const replaces = !editingMonth && existing.includes(month);

  async function submit() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    const failure = await onSave(month, parseInt(startDay, 10));
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  }

  return (
    <>
      <ClearDialogHeader
        title={editingMonth ? t("editTitle") : t("addTitle")}
        subtitle={t("dialogSubtitle")}
        onClose={onClose}
        closeLabel={t("close")}
      />

      {editingMonth ? (
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>{t("month")}</span>
          <span className="flex h-12 items-center rounded-clear-row bg-clear-tile px-4 text-[15px] font-bold first-letter:uppercase">{fmt.month(editingMonth)}</span>
        </div>
      ) : (
        <div role="group" aria-labelledby={`${ids}-month`} className="flex flex-col gap-1.5">
          <span id={`${ids}-month`} className={FIELD_LABEL}>{t("month")}</span>
          <DatePicker granularity="month" value={month} onChange={setMonth} triggerClassName={DATE_TRIGGER} />
        </div>
      )}

      <ClearField
        label={t("startDay")}
        htmlFor={`${ids}-day`}
        hint={t("startDayHint", { usual: currentStartDay })}
        error={startDay !== "" && !dayOk ? t("startDayInvalid") : undefined}
      >
        <ClearInput
          id={`${ids}-day`}
          type="number"
          inputMode="numeric"
          min={1}
          max={28}
          value={startDay}
          onChange={(e) => setStartDay(e.target.value)}
          aria-invalid={startDay !== "" && !dayOk}
        />
      </ClearField>

      {preview && (
        <div className="flex items-center gap-3 rounded-clear-tile bg-clear-tile px-4 py-3.5">
          <IconInfoCircle aria-hidden size={18} stroke={2} className="shrink-0 text-clear-ink-2" />
          <span className="text-sm text-clear-ink-2">{t("preview", { range: fmt.range(preview) })}</span>
        </div>
      )}
      {replaces && <SettingsNotice tone="warning">{t("replaces", { month: fmt.month(month) })}</SettingsNotice>}
      {error && <SettingsNotice>{error}</SettingsNotice>}

      <div className="border-t border-clear-ground pt-[18px] pb-1">
        <ClearDialogFooter
          destructive={
            editingMonth && (
              <ClearButton variant="danger" onClick={() => onDelete(editingMonth)} disabled={busy}>
                <IconTrash aria-hidden />
                {t("delete")}
              </ClearButton>
            )
          }
        >
          <ClearButton variant="secondary" onClick={onClose}>{t("cancel")}</ClearButton>
          <ClearButton onClick={submit} disabled={busy || !valid}>
            {busy ? t("saving") : editingMonth ? t("save") : t("addConfirm")}
          </ClearButton>
        </ClearDialogFooter>
      </div>
    </>
  );
}
