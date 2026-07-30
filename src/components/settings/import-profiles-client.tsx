"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconTrash } from "@tabler/icons-react";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import type { ColumnMapping } from "@/lib/import-parse";

export interface ImportProfileListItem {
  id: number;
  label: string;
  headerSignature: string;
  mapping: ColumnMapping;
}

const FORMAT_LABELS: Record<ColumnMapping["dateFormat"], string> = {
  iso: "YYYY-MM-DD",
  dmy: "DD-MM-YYYY",
  mdy: "MM-DD-YYYY",
  custom: "custom",
};

/**
 * The saved column mappings, one per bank export shape. Until now these were invisible:
 * a mapping was remembered on first use and reapplied forever to every file with the same
 * header, with no way to see or remove it — so one wrong mapping kept being wrong.
 */
export function ImportProfilesClient({ profiles, panelHeader = true }: { profiles: ImportProfileListItem[]; panelHeader?: boolean }) {
  const t = useTranslations("importProfiles");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(profile: ImportProfileListItem) {
    if (!confirm(t("confirmDelete", { label: profile.label }))) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/import/profiles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: profile.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  /** The header of the column this profile treats as the date — the single field most
   *  worth double-checking, since getting it wrong is what breaks an import. */
  function dateColumnLabel(profile: ImportProfileListItem) {
    const headers = profile.headerSignature.split("|");
    const header = headers[profile.mapping.dateColumn];
    const format = profile.mapping.dateFormat === "custom"
      ? (profile.mapping.customDateFormat ?? FORMAT_LABELS.custom)
      : FORMAT_LABELS[profile.mapping.dateFormat];
    return `${header || `#${profile.mapping.dateColumn + 1}`} · ${format}`;
  }

  return (
    <>
      {panelHeader && <PanelHeader title={t("title")} />}
      <div className="px-4 pt-1 pb-8 space-y-4">
        <p className="text-sm text-muted-foreground px-1">{t("description")}</p>

        {profiles.length === 0 ? (
          <div className="rounded-2xl bg-[var(--dialog-content-background)] py-16 text-center text-muted-foreground">
            <p className="text-sm">{t("empty")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {profiles.map((profile) => (
              <div key={profile.id} className="flex items-center gap-3 rounded-2xl bg-[var(--dialog-content-background)] px-4 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{profile.label}</p>
                  <p className="text-sm text-foreground/50 truncate mt-0.5">
                    {t("dateColumn")}: {dateColumnLabel(profile)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(profile)}
                  disabled={busy}
                  aria-label={t("delete")}
                  className="shrink-0 rounded-full p-2 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  <IconTrash className="size-5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </>
  );
}
