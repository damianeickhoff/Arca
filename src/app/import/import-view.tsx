"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { IconAdjustmentsHorizontal, IconBuildingBank, IconCheck, IconChevronLeft, IconChevronRight, IconUpload } from "@tabler/icons-react";
import { ContextualTip } from "@/components/contextual-tip";
import { AnchoredTip } from "@/components/anchored-tip";
import { ImportFlow, useCsvImport, type CsvImporter, type ImportStep } from "@/components/import-csv-card";
import { ClearCard, ClearCardHeader, ClearCardLink } from "@/components/clear/card";
import { ClearChip } from "@/components/clear/chip";
import { IconTile } from "@/components/clear/icon-tile";
import { clearButtonVariants } from "@/components/clear/button-variants";
import type { ClearTone } from "@/components/clear/tones";
import { cn } from "@/lib/utils";

export interface ImportViewData {
  /** The banks a built-in parser recognises ("ING", "Rabobank", …). */
  builtInBanks: string[];
  profiles: { id: number; label: string; columns: number; savedOn: string | null }[];
  /** Earlier imports, newest first: one account on one day. */
  recent: { day: string; account: string | null; rows: number }[];
}

const PROFILE_TONES: ClearTone[] = ["peach", "sky", "lilac", "mint", "butter", "rose"];

/** "15 Oct" in the user's locale. */
function useShortDate() {
  const locale = useLocale();
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  return (date: string) => {
    const d = new Date(`${date}T12:00:00`);
    return Number.isNaN(d.getTime()) ? date : fmt.format(d);
  };
}

/**
 * Import a bank export: the Upload → Check → Done flow (components/import-csv-card)
 * in the main column, and beside it the saved import profiles, "Map columns" for a
 * bank that isn't recognised and the most recent imports.
 */
export function ImportView({ data }: { data: ImportViewData }) {
  const t = useTranslations("importPage");
  const tCommon = useTranslations("common");
  const importer = useCsvImport();

  return (
    <div className="flex flex-col gap-5 px-4 pt-[calc(var(--sat)+16px)] font-clear text-clear-ink lg:gap-7 lg:px-8 lg:pt-7 lg:pb-12">
      <ContextualTip id="csvImport" />

      <div className="flex flex-wrap items-center justify-between gap-3 lg:items-end lg:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            aria-label={tCommon("back")}
            className={cn(clearButtonVariants({ variant: "surface", size: "icon" }), "size-12 lg:hidden")}
          >
            <IconChevronLeft aria-hidden />
          </Link>
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.03em] lg:text-[40px]">{t("title")}</h1>
            <span className="hidden text-base text-clear-ink-2 lg:inline">{t("subtitle")}</span>
          </div>
        </div>
        <ImportSteps step={importer.step} />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-5 xl:col-span-2">
          <ImportFlow importer={importer} variant="page" />
        </div>
        <div className="grid min-w-0 gap-5 lg:grid-cols-2 xl:grid-cols-1">
          <ProfilesCard data={data} importer={importer} />
          <UnrecognisedCard importer={importer} />
          <RecentCard recent={data.recent} />
        </div>
      </div>
    </div>
  );
}

const STEPS: ImportStep[] = ["upload", "check", "done"];

/** Upload · Check · Done — the current step black, finished ones ticked. */
function ImportSteps({ step }: { step: ImportStep }) {
  const t = useTranslations("importPage.steps");
  const current = STEPS.indexOf(step);
  return (
    <ol aria-label={t("label")} className="m-0 flex max-w-full list-none items-center gap-1 overflow-x-auto rounded-full bg-clear-card p-1.5">
      {STEPS.map((s, i) => {
        const done = i < current || step === "done";
        const active = i === current && step !== "done";
        return (
          <li key={s} className="contents">
            {i > 0 && <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full bg-clear-line lg:w-5" />}
            <span
              aria-current={active ? "step" : undefined}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-2.5 rounded-full py-0 pr-3.5 pl-1.5 text-sm font-bold lg:h-11 lg:pr-4",
                active ? "bg-clear-primary text-clear-primary-ink" : done ? "text-clear-ink-2" : "text-clear-muted",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-full text-sm font-extrabold lg:size-8",
                  active ? "bg-clear-ember text-clear-ember-ink" : done ? "bg-clear-mint text-clear-mint-ink" : "bg-clear-tile text-clear-ink-2",
                )}
              >
                {done ? <IconCheck size={16} stroke={2.8} /> : i + 1}
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

function ProfilesCard({ data, importer }: { data: ImportViewData; importer: CsvImporter }) {
  const t = useTranslations("importPage.profiles");
  const short = useShortDate();
  const { phase } = importer;
  const inUse = phase.step === "check" && phase.preview.source.kind === "profile" ? phase.preview.source.id : null;
  const bankInUse = phase.step === "check" && phase.preview.source.kind === "bank" ? phase.preview.source.label : null;

  return (
    <ClearCard className="gap-3">
      <ClearCardHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={<ClearCardLink href="/settings?panel=importProfiles">{t("manage")}</ClearCardLink>}
      />

      {data.profiles.length === 0 ? (
        <p className="m-0 rounded-clear-tile border-2 border-dashed border-clear-line p-4 text-sm text-clear-muted">{t("empty")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {data.profiles.map((p, i) => (
            <li
              key={p.id}
              className={cn("flex min-h-16 items-center gap-3 rounded-clear-tile px-3 py-2", p.id === inUse && "bg-clear-tile")}
            >
              <IconTile tone={PROFILE_TONES[i % PROFILE_TONES.length]} size="sm"><IconBuildingBank stroke={1.9} /></IconTile>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-bold">{p.label}</span>
                <span className="text-[13px] text-clear-muted">
                  {p.savedOn ? t("meta", { columns: p.columns, date: short(p.savedOn) }) : t("metaNoDate", { columns: p.columns })}
                </span>
              </span>
              {p.id === inUse && <ClearChip tone="ink" className="h-[26px] px-2.5 text-xs">{t("inUse")}</ClearChip>}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 pt-1">
        <span className="text-[13px] font-bold text-clear-ink-2">{t("builtIn")}</span>
        <div className="flex flex-wrap gap-1.5">
          {data.builtInBanks.map((bank) => (
            <ClearChip key={bank} tone={bank === bankInUse ? "ink" : "neutral"} className="h-[26px] px-2.5 text-xs">{bank}</ClearChip>
          ))}
        </div>
      </div>
    </ClearCard>
  );
}

function UnrecognisedCard({ importer }: { importer: CsvImporter }) {
  const t = useTranslations("importPage.unrecognised");
  return (
    <ClearCard className="gap-3.5">
      <div className="flex items-center gap-3">
        <IconTile tone="lilac" size="sm"><IconAdjustmentsHorizontal stroke={1.9} /></IconTile>
        <h2 className="m-0 text-lg font-bold">{t("title")}</h2>
      </div>
      <p className="m-0 text-sm leading-normal text-clear-ink-2">{t("body")}</p>
      <button
        type="button"
        data-tip-anchor="importMapColumns"
        onClick={() => importer.choose({ map: true })}
        disabled={importer.phase.step === "reading"}
        className={cn(clearButtonVariants({ variant: "secondary" }), "self-start")}
      >
        {t("action")}
        <IconChevronRight aria-hidden />
      </button>
      <AnchoredTip id="importMapColumns" anchor="importMapColumns" />
    </ClearCard>
  );
}

function RecentCard({ recent }: { recent: ImportViewData["recent"] }) {
  const t = useTranslations("importPage.recent");
  const short = useShortDate();
  return (
    <ClearCard className="gap-1.5">
      <h2 className="m-0 mb-1.5 text-lg font-bold">{t("title")}</h2>
      {recent.length === 0 ? (
        <p className="m-0 rounded-clear-tile border-2 border-dashed border-clear-line p-4 text-sm text-clear-muted">{t("empty")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {recent.map((r) => (
            <li key={`${r.day}-${r.account ?? ""}`} className="flex min-h-14 items-center gap-3 border-b border-clear-line last:border-b-0">
              <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-clear-tile text-clear-ink-2">
                <IconUpload size={17} stroke={2} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-bold">{short(r.day)}</span>
                <span className="truncate text-[13px] text-clear-muted">{r.account ?? t("unknownAccount")}</span>
              </span>
              <span className="text-sm font-bold text-clear-ink-2 tabular-nums">{t("rows", { count: r.rows })}</span>
            </li>
          ))}
        </ul>
      )}
    </ClearCard>
  );
}
