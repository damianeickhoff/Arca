"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconArrowRight, IconChevronRight, IconFileUpload, IconTableOptions, IconTrash } from "@tabler/icons-react";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import { SettingsEmpty, SettingsNotice } from "@/components/settings/settings-ui";
import { ClearButton } from "@/components/clear/button";
import { IconTile } from "@/components/clear/icon-tile";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { useConfirm } from "@/components/clear/confirm-dialog";
import type { ColumnMapping } from "@/lib/import-parse";

export interface ImportProfileListItem {
  id: number;
  label: string;
  headerSignature: string;
  mapping: ColumnMapping;
}

const FORMAT_LABELS: Record<Exclude<ColumnMapping["dateFormat"], "custom">, string> = {
  iso: "YYYY-MM-DD",
  dmy: "DD-MM-YYYY",
  mdy: "MM-DD-YYYY",
};

type Role = "date" | "description" | "amount" | "direction" | "account" | "counterAccount" | "balance";

/** Which column each field reads, in the order the import dialog asks for them. */
function columnMap(mapping: ColumnMapping): { role: Role; column: number }[] {
  const entries: { role: Role; column: number | null | undefined }[] = [
    { role: "date", column: mapping.dateColumn },
    { role: "description", column: mapping.descriptionColumn },
    { role: "amount", column: mapping.amountColumn },
    { role: "direction", column: mapping.directionColumn },
    { role: "account", column: mapping.accountColumn },
    { role: "counterAccount", column: mapping.counterAccountColumn },
    { role: "balance", column: mapping.balanceColumn },
  ];
  return entries.filter((e): e is { role: Role; column: number } => e.column != null && e.column >= 0);
}

/**
 * The saved column mappings, one per bank export shape. A mapping is remembered on
 * first use and reapplied to every file with the same header — this is where it can
 * be checked, and deleted so the next import asks again.
 */
export function ImportProfilesClient({ profiles }: { profiles: ImportProfileListItem[] }) {
  const t = useTranslations("importProfiles");
  const tPanels = useTranslations("settings.panels");
  const tRoles = useTranslations("importMapping.roles");
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(profile: ImportProfileListItem) {
    const ok = await confirm({
      title: t("confirmDelete", { label: profile.label }),
      body: t("confirmDeleteBody"),
      confirmLabel: t("delete"),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/import/profiles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: profile.id }),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setError(t("deleteError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PanelHeader title={tPanels("importProfiles.title")} />
      <div className="flex flex-col gap-5 px-4 pt-1 font-clear text-clear-ink">
        <p className="m-0 text-sm text-clear-ink-2">{t("description")}</p>

        {error && <SettingsNotice>{error}</SettingsNotice>}

        {profiles.length === 0 ? (
          <SettingsEmpty
            icon={<IconTableOptions stroke={1.9} />}
            action={
              <Link href="/import" className={clearButtonVariants({ size: "sm" })}>
                <IconFileUpload aria-hidden stroke={2} />
                {t("importFile")}
              </Link>
            }
          >
            {t("empty")}
          </SettingsEmpty>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2 px-1">
              <h3 className="m-0 text-[15px] font-bold">{t("saved")}</h3>
              <span className="text-sm font-bold text-clear-muted tabular-nums">{profiles.length}</span>
            </div>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {profiles.map((profile) => {
                const headers = profile.headerSignature.split("|");
                const columnName = (i: number) => headers[i] || t("columnNumber", { index: i + 1 });
                const format =
                  profile.mapping.dateFormat === "custom"
                    ? (profile.mapping.customDateFormat ?? t("customFormat"))
                    : FORMAT_LABELS[profile.mapping.dateFormat];
                return (
                  <li key={profile.id} className="flex flex-col gap-4 rounded-clear-tile bg-clear-tile p-4">
                    <div className="flex items-center gap-3.5">
                      <IconTile tone="sky" size="md"><IconTableOptions stroke={1.9} /></IconTile>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <h4 className="m-0 truncate text-[15px] font-bold">{profile.label}</h4>
                        <span className="text-[13px] text-clear-muted">{t("columns", { count: headers.length })}</span>
                      </div>
                      <ClearButton variant="danger" size="sm" onClick={() => remove(profile)} disabled={busy} aria-label={t("deleteNamed", { label: profile.label })}>
                        <IconTrash aria-hidden />
                        {t("deleteShort")}
                      </ClearButton>
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className="text-[13px] font-bold text-clear-ink-2">{t("columnMap")}</span>
                      <ul aria-label={t("columnMapLabel", { label: profile.label })} className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                        {columnMap(profile.mapping).map(({ role, column }) => (
                          <li key={role} className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full bg-clear-card px-3 text-[13px]">
                            <span className="truncate font-semibold text-clear-ink-2">{columnName(column)}</span>
                            <IconArrowRight aria-hidden size={14} stroke={2} className="shrink-0 text-clear-muted" />
                            <span className="shrink-0 font-bold">{tRoles(role)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <dl className="m-0 grid grid-cols-2 gap-2.5">
                      <div className="flex flex-col gap-0.5 rounded-clear-row bg-clear-card px-3.5 py-2.5">
                        <dt className="text-[13px] font-bold text-clear-ink-2">{t("dateFormat")}</dt>
                        <dd className="m-0 font-mono text-sm">{format}</dd>
                      </div>
                      <div className="flex flex-col gap-0.5 rounded-clear-row bg-clear-card px-3.5 py-2.5">
                        <dt className="text-[13px] font-bold text-clear-ink-2">{t("decimalSeparator")}</dt>
                        <dd className="m-0 text-sm">{profile.mapping.decimalSeparator === "," ? t("decimalComma") : t("decimalDot")}</dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {profiles.length > 0 && (
        <Link
          href="/import"
          className="flex items-center gap-3.5 rounded-clear-tile border-2 border-dashed border-clear-line px-4 py-3.5 text-clear-ink no-underline transition-colors hover:bg-clear-tile"
        >
          <IconTile size="md"><IconFileUpload stroke={1.9} /></IconTile>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-bold">{t("importNew")}</span>
            <span className="text-[13px] text-clear-muted">{t("importNewHint")}</span>
          </span>
          <IconChevronRight aria-hidden size={18} stroke={2} className="shrink-0 text-clear-placeholder" />
        </Link>
        )}
      </div>
    </>
  );
}
