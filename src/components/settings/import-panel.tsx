"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconAdjustmentsHorizontal, IconBuildingBank, IconCheck, IconRefresh, IconUpload } from "@tabler/icons-react";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import { BankConnectionSection } from "@/components/settings/bank-connection-section";
import { ImportFlow, useCsvImport, type CsvImporter, type ImportStep } from "@/components/import-csv-card";
import { ContextualTip } from "@/components/contextual-tip";
import { AnchoredTip } from "@/components/anchored-tip";
import { Segmented } from "@/components/clear/segmented";
import { ClearChip } from "@/components/clear/chip";
import { IconTile } from "@/components/clear/icon-tile";
import { clearButtonVariants } from "@/components/clear/button-variants";
import type { ClearTone } from "@/components/clear/tones";
import { useBankSyncText } from "@/components/shell/bank-sync-line";
import type { BankSyncStatus } from "@/lib/bank-sync-status";
import type { ImportOverview } from "@/lib/import-overview";
import { cn } from "@/lib/utils";

type Tab = "csv" | "bank";

const PROFILE_TONES: ClearTone[] = ["peach", "sky", "lilac", "mint", "butter", "rose"];

/**
 * Settings › Import: one panel, two tabs. "CSV file" is the Upload → Check → Done flow
 * (components/import-csv-card) with the saved profiles and recent imports under it;
 * "Bank connection" is the Enable Banking section with the sync log under it. The bank
 * callback lands here with ?bank= or ?bankError=, which opens the bank tab; a dot on
 * that tab says a consent ran out. The CSV flow's state lives in this component, so
 * switching tabs mid-import does not lose the file.
 */
export function ImportPanel({ overview, bankSync, bankSyncNow }: { overview: ImportOverview; bankSync: BankSyncStatus | null; bankSyncNow: string }) {
  const t = useTranslations("importPage");
  const tPanels = useTranslations("settings.panels");
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(() =>
    params.get("tab") === "bank" || params.has("bank") || params.has("bankError") ? "bank" : "csv",
  );
  const importer = useCsvImport();
  const sync = useBankSyncText(bankSync, bankSyncNow);

  return (
    <>
      <PanelHeader title={tPanels("import.title")} action={tab === "csv" ? <ImportSteps step={importer.step} /> : undefined} />
      <div className="flex flex-col gap-5 px-4 pt-1 pb-4 font-clear text-clear-ink">
        <div data-tip-anchor="importTabs" className="self-start">
          <Segmented<Tab>
            label={t("tabs.label")}
            surface="tile"
            value={tab}
            onChange={setTab}
            items={[
              { value: "csv", label: t("tabs.csv") },
              {
                value: "bank",
                label: (
                  <span className="inline-flex items-center gap-2">
                    {t("tabs.bank")}
                    {sync?.attention && <span aria-hidden className="size-2 rounded-full bg-clear-warning-fill" />}
                  </span>
                ),
              },
            ]}
          />
        </div>
        <AnchoredTip id="importTabs" anchor="importTabs" />

        {tab === "csv" ? (
          <>
            <ContextualTip id="csvImport" />
            <ImportFlow importer={importer} variant="panel" />
            {importer.step === "upload" && <MapColumnsTile importer={importer} />}
            <div className="grid gap-4 sm:grid-cols-2">
              <ProfilesTile overview={overview} importer={importer} />
              <RecentTile recent={overview.recent} />
            </div>
          </>
        ) : (
          <>
            <BankConnectionSection className="" />
            <SyncLogTile log={overview.syncLog} />
          </>
        )}
      </div>
    </>
  );
}

const STEPS: ImportStep[] = ["upload", "check", "done"];

/** Upload · Check · Done — the current step black, finished ones ticked. */
function ImportSteps({ step }: { step: ImportStep }) {
  const t = useTranslations("importPage.steps");
  const current = STEPS.indexOf(step);
  return (
    <ol aria-label={t("label")} className="m-0 flex max-w-full list-none items-center gap-0.5 overflow-x-auto rounded-full bg-clear-tile p-1">
      {STEPS.map((s, i) => {
        const done = i < current || step === "done";
        const active = i === current && step !== "done";
        return (
          <li key={s} className="contents">
            <span
              aria-current={active ? "step" : undefined}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-2 rounded-full py-0 pr-3 pl-1 text-[13px] font-bold",
                active ? "bg-clear-primary text-clear-primary-ink" : done ? "text-clear-ink-2" : "text-clear-muted",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-full text-xs font-extrabold",
                  active ? "bg-clear-ember text-clear-ember-ink" : done ? "bg-clear-mint text-clear-mint-ink" : "bg-clear-card text-clear-ink-2",
                )}
              >
                {done ? <IconCheck size={14} stroke={2.8} /> : i + 1}
              </span>
              {t(s)}
              {done && <span className="sr-only"> {t("completed")}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** "15 Oct" in the user's locale. */
function useShortDate() {
  const locale = useLocale();
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  return (date: string) => {
    const d = new Date(`${date}T12:00:00`);
    return Number.isNaN(d.getTime()) ? date : fmt.format(d);
  };
}

function MapColumnsTile({ importer }: { importer: CsvImporter }) {
  const t = useTranslations("importPage.unrecognised");
  return (
    <div className="flex items-start gap-3.5 rounded-clear-tile bg-clear-tile p-4">
      <IconTile tone="lilac" size="md"><IconAdjustmentsHorizontal stroke={1.9} /></IconTile>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-bold">{t("title")}</span>
          <p className="m-0 text-sm leading-normal text-clear-ink-2">{t("body")}</p>
        </div>
        <button
          type="button"
          data-tip-anchor="importMapColumns"
          onClick={() => importer.choose({ map: true })}
          disabled={importer.phase.step === "reading"}
          className={cn(clearButtonVariants({ variant: "surface", size: "sm" }), "self-start")}
        >
          {t("action")}
        </button>
        <AnchoredTip id="importMapColumns" anchor="importMapColumns" />
      </div>
    </div>
  );
}

function ProfilesTile({ overview, importer }: { overview: ImportOverview; importer: CsvImporter }) {
  const t = useTranslations("importPage.profiles");
  const short = useShortDate();
  const { phase } = importer;
  const inUse = phase.step === "check" && phase.preview.source.kind === "profile" ? phase.preview.source.id : null;
  const bankInUse = phase.step === "check" && phase.preview.source.kind === "bank" ? phase.preview.source.label : null;

  return (
    <section aria-labelledby="import-profiles" className="flex flex-col gap-3 rounded-clear-tile bg-clear-tile p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="import-profiles" className="m-0 text-[15px] font-bold">{t("title")}</h3>
        <Link href="/settings?panel=importProfiles" className="text-[13px] font-bold text-clear-ink underline-offset-2 hover:underline">
          {t("manage")}
        </Link>
      </div>
      {overview.profiles.length === 0 ? (
        <p className="m-0 rounded-clear-row border-2 border-dashed border-clear-line p-3 text-[13px] text-clear-muted">{t("empty")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {overview.profiles.map((p, i) => (
            <li key={p.id} className={cn("flex min-h-12 items-center gap-3 rounded-clear-row px-2 py-1.5", p.id === inUse && "bg-clear-card")}>
              <IconTile tone={PROFILE_TONES[i % PROFILE_TONES.length]} size="sm"><IconBuildingBank stroke={1.9} /></IconTile>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-bold">{p.label}</span>
                <span className="text-xs text-clear-muted">
                  {p.savedOn ? t("meta", { columns: p.columns, date: short(p.savedOn) }) : t("metaNoDate", { columns: p.columns })}
                </span>
              </span>
              {p.id === inUse && <ClearChip tone="ink" className="h-6 px-2 text-xs">{t("inUse")}</ClearChip>}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-clear-ink-2">{t("builtIn")}</span>
        <div className="flex flex-wrap gap-1.5">
          {overview.builtInBanks.map((bank) => (
            <ClearChip key={bank} tone={bank === bankInUse ? "ink" : "neutral"} className="h-6 bg-clear-card px-2 text-xs">{bank}</ClearChip>
          ))}
        </div>
      </div>
    </section>
  );
}

function RecentTile({ recent }: { recent: ImportOverview["recent"] }) {
  const t = useTranslations("importPage.recent");
  const short = useShortDate();
  return (
    <section aria-labelledby="import-recent" className="flex flex-col gap-3 rounded-clear-tile bg-clear-tile p-4">
      <h3 id="import-recent" className="m-0 text-[15px] font-bold">{t("title")}</h3>
      {recent.length === 0 ? (
        <p className="m-0 rounded-clear-row border-2 border-dashed border-clear-line p-3 text-[13px] text-clear-muted">{t("empty")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {recent.map((r) => (
            <li key={`${r.day}-${r.account ?? ""}`} className="flex min-h-12 items-center gap-3 border-b border-clear-line last:border-b-0">
              <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-clear-card text-clear-ink-2">
                <IconUpload size={15} stroke={2} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-bold">{short(r.day)}</span>
                <span className="truncate text-xs text-clear-muted">{r.account ?? t("unknownAccount")}</span>
              </span>
              <span className="text-[13px] font-bold text-clear-ink-2 tabular-nums">{t("rows", { count: r.rows })}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SyncLogTile({ log }: { log: ImportOverview["syncLog"] }) {
  const t = useTranslations("importPage.syncLog");
  const locale = useLocale();
  const when = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  return (
    <section aria-labelledby="import-synclog" className="flex flex-col gap-3 rounded-clear-tile bg-clear-tile p-4">
      <h3 id="import-synclog" className="m-0 text-[15px] font-bold">{t("title")}</h3>
      {log.length === 0 ? (
        <p className="m-0 rounded-clear-row border-2 border-dashed border-clear-line p-3 text-[13px] text-clear-muted">{t("empty")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {log.map((entry) => (
            <li key={entry.id} className="flex min-h-12 items-center gap-3 border-b border-clear-line last:border-b-0">
              <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-clear-card text-clear-ink-2">
                <IconRefresh size={15} stroke={2} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-bold">{when(entry.at)}</span>
                <span className="truncate text-xs text-clear-muted">{entry.source ?? t("allBanks")}</span>
              </span>
              <span className="text-[13px] font-bold text-clear-ink-2 tabular-nums">{t("entry", { imported: entry.imported, skipped: entry.skipped })}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
