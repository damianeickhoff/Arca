"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconDatabase, IconDownload, IconTrash } from "@tabler/icons-react";
import { SettingsNotice } from "@/components/settings/settings-ui";
import { ClearButton } from "@/components/clear/button";
import { ClearChip } from "@/components/clear/chip";
import { IconTile } from "@/components/clear/icon-tile";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { AnchoredTip } from "@/components/anchored-tip";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { createBackupAction, deleteBackupAction } from "@/app/actions/backups";
import type { BackupInfo } from "@/lib/backups";

/**
 * Settings › Data health › Backups: the copies Arca made before updates and the ones
 * the admin made by hand, each downloadable; "Back up now" for a fresh one.
 * Restoring stays a server-side step (the guide explains it), so nothing here can
 * overwrite the live database.
 */
export function BackupsCard({ backups, canManage }: { backups: BackupInfo[]; canManage: boolean }) {
  const t = useTranslations("dataHealth.backups");
  const locale = useLocale();
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`);

  function backupNow() {
    setNotice(null);
    startTransition(async () => {
      const r = await createBackupAction();
      if (r.error) setNotice({ tone: "error", text: t("error") });
      else {
        setNotice({ tone: "success", text: t("made") });
        router.refresh();
      }
    });
  }

  async function remove(backup: BackupInfo) {
    const ok = await confirm({
      title: t("confirmDelete"),
      body: t("confirmDeleteBody", { when: when(backup.createdAt) }),
      confirmLabel: t("confirmDeleteLabel"),
      destructive: true,
    });
    if (!ok) return;
    setNotice(null);
    startTransition(async () => {
      const r = await deleteBackupAction(backup.name);
      if (r.error) setNotice({ tone: "error", text: t("error") });
      else router.refresh();
    });
  }

  return (
    <section aria-labelledby="backups-title" className="flex flex-col gap-3 rounded-clear-tile bg-clear-tile p-4">
      <div className="flex items-start gap-3.5">
        <IconTile tone="stone" size="md"><IconDatabase stroke={1.9} /></IconTile>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 id="backups-title" className="m-0 text-[17px] font-extrabold">{t("title")}</h3>
          <p className="m-0 text-sm text-clear-ink-2">{t("body")}</p>
        </div>
      </div>

      {canManage ? (
        <div className="flex flex-wrap items-center gap-2.5" data-tip-anchor="backups">
          <ClearButton variant="surface" onClick={backupNow} disabled={pending}>
            {pending ? t("making") : t("makeNow")}
          </ClearButton>
        </div>
      ) : (
        <p className="m-0 text-[13px] text-clear-muted">{t("adminOnly")}</p>
      )}

      {notice && <SettingsNotice tone={notice.tone}>{notice.text}</SettingsNotice>}

      {backups.length === 0 ? (
        <p className="m-0 text-[13px] text-clear-muted">{t("empty")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {backups.map((b) => (
            <li key={b.name} className="flex flex-wrap items-center gap-3 rounded-clear-row bg-clear-card px-3.5 py-2.5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-bold">{when(b.createdAt)}</span>
                  <ClearChip tone={b.reason === "update" ? "sky" : "mint"}>{t(b.reason === "update" ? "reasonUpdate" : "reasonManual")}</ClearChip>
                </div>
                <span className="text-[13px] text-clear-muted">{t("meta", { version: b.version, size: size(b.size) })}</span>
              </div>
              {canManage && (
                <div className="flex shrink-0 items-center gap-1">
                  <a
                    href={`/api/backups/${encodeURIComponent(b.name)}`}
                    download={b.name}
                    aria-label={t("download")}
                    title={t("download")}
                    className={clearButtonVariants({ variant: "ghost", size: "icon", className: "no-underline" })}
                  >
                    <IconDownload aria-hidden />
                  </a>
                  <ClearButton variant="ghost" size="icon" aria-label={t("delete")} title={t("delete")} onClick={() => remove(b)} disabled={pending}>
                    <IconTrash aria-hidden />
                  </ClearButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="m-0 text-[13px] text-clear-muted">{t("restoreHint")}</p>
      {canManage && <AnchoredTip id="backups" anchor="backups" />}
    </section>
  );
}
