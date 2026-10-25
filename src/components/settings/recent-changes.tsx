"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  IconArrowBackUp,
  IconArrowsExchange,
  IconBolt,
  IconBoltOff,
  IconBuildingBank,
  IconBuildingStore,
  IconFileImport,
  IconFolderX,
  IconHistory,
  IconRepeat,
  IconWand,
} from "@tabler/icons-react";
import { ListRow } from "@/components/clear/list-row";
import { IconTile } from "@/components/clear/icon-tile";
import { ClearChip } from "@/components/clear/chip";
import { ClearButton } from "@/components/clear/button";
import { useConfirm } from "@/components/clear/confirm-dialog";
import type { ClearTone } from "@/components/clear/tones";
import { SettingsNotice } from "@/components/settings/settings-ui";
import { useBankErrorText } from "@/components/settings/bank-error-text";
import { AnchoredTip } from "@/components/anchored-tip";
import { ACTIVITY_KINDS, type ActivityKind, type ActivityParams } from "@/lib/activity-log-entries";
import type { ActivityItem } from "@/lib/activity-log";

const KIND_LOOK: Record<ActivityKind, { icon: React.ComponentType<{ stroke?: number }>; tone: ClearTone }> = {
  csvImport: { icon: IconFileImport, tone: "sky" },
  bankSync: { icon: IconBuildingBank, tone: "sky" },
  rulesApplied: { icon: IconWand, tone: "lilac" },
  bulkCategoryMove: { icon: IconArrowsExchange, tone: "butter" },
  ruleCreated: { icon: IconBolt, tone: "mint" },
  ruleDeleted: { icon: IconBoltOff, tone: "rose" },
  merchantDeleted: { icon: IconBuildingStore, tone: "rose" },
  categoryDeleted: { icon: IconFolderX, tone: "rose" },
  // Only older entries: the detector no longer adds items without the user.
  recurringDetected: { icon: IconRepeat, tone: "mint" },
  recurringMigrated: { icon: IconRepeat, tone: "butter" },
};

/** Entries shown before "Show all". */
const COLLAPSED = 8;

/**
 * Settings › Data health › Recent changes: the change log, newest first, with Undo on
 * every entry that can still be reversed. The log itself is written server-side by
 * the code paths that make the changes (src/lib/activity-log.ts).
 */
export function RecentChanges({ changes }: { changes: ActivityItem[] }) {
  const t = useTranslations("dataHealth.recentChanges");
  const bankErrorText = useBankErrorText();
  const locale = useLocale();
  const router = useRouter();
  const confirm = useConfirm();
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  function summary(kind: string, params: ActivityParams): string {
    if (!(ACTIVITY_KINDS as readonly string[]).includes(kind)) return t("kinds.unknown");
    const values = {
      ...params,
      count: Number(params.count ?? 0),
      skipped: Number(params.skipped ?? 0),
      transactions: Number(params.transactions ?? 0),
      category: params.category ?? t("noCategory"),
      pattern: params.pattern ?? t("someRule"),
      name: params.name ?? "—",
      source: params.source ?? t("someBank"),
    };
    if (kind === "bankSync" && typeof params.error === "string") return t("kinds.bankSyncFailed", { ...values, error: bankErrorText(params.error) });
    return t(`kinds.${kind as ActivityKind}`, values);
  }

  // SQLite's datetime('now') is UTC without a zone marker.
  const timeLabel = (at: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(`${at.replace(" ", "T")}Z`));

  async function undo(item: ActivityItem) {
    const text = summary(item.kind, item.params);
    const ok = await confirm({
      title: t("confirmTitle"),
      body: t("confirmBody", { summary: text }),
      confirmLabel: t("confirmLabel"),
    });
    if (!ok) return;
    setBusyId(item.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/activity-log/${item.id}/undo`, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        setNotice({ tone: "success", text: t("result", { restored: Number(body?.restored ?? 0), kept: Number(body?.kept ?? 0) }) });
        router.refresh();
      } else if (body?.error === "conflict" && body.conflict) {
        setNotice({ tone: "error", text: t("conflict", { change: summary(body.conflict.kind, body.conflict.params ?? {}) }) });
      } else if (body?.error === "alreadyUndone") {
        setNotice({ tone: "error", text: t("alreadyUndone") });
        router.refresh();
      } else {
        setNotice({ tone: "error", text: t("error") });
      }
    } catch {
      setNotice({ tone: "error", text: t("error") });
    } finally {
      setBusyId(null);
    }
  }

  const shown = expanded ? changes : changes.slice(0, COLLAPSED);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="recent-changes-title">
      <div className="flex flex-col gap-1 px-1" data-tip-anchor="recentChanges">
        <h3 id="recent-changes-title" className="m-0 text-[18px] font-bold">{t("title")}</h3>
        <p className="m-0 text-sm text-clear-ink-2">{t("body")}</p>
      </div>
      <AnchoredTip id="recentChanges" anchor="recentChanges" active={changes.length > 0} />

      {notice && <SettingsNotice tone={notice.tone}>{notice.text}</SettingsNotice>}

      {changes.length === 0 ? (
        <div className="flex items-center gap-3.5 rounded-clear-tile border-2 border-dashed border-clear-line p-4">
          <IconTile tone="neutral" size="md"><IconHistory stroke={1.9} /></IconTile>
          <p className="m-0 text-sm text-clear-ink-2">{t("empty")}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col">
            {shown.map((item) => {
              const look = KIND_LOOK[item.kind] ?? { icon: IconHistory, tone: "neutral" as const };
              const Icon = look.icon;
              const tone = item.undoneAt ? "neutral" : item.kind === "bankSync" && item.params.error ? "rose" : look.tone;
              const text = summary(item.kind, item.params);
              const meta = [timeLabel(item.at), t("rows", { count: item.affectedCount }), item.userName ? t("byUser", { name: item.userName }) : null]
                .filter(Boolean)
                .join(" · ");
              return (
                <ListRow
                  key={item.id}
                  icon={<IconTile tone={tone} size="md"><Icon stroke={1.9} /></IconTile>}
                  title={<span className={item.undoneAt ? "text-clear-muted line-through" : undefined}>{text}</span>}
                  meta={meta}
                  trailing={
                    item.undoneAt ? (
                      <ClearChip tone="neutral">{t("undone")}</ClearChip>
                    ) : item.reversible ? (
                      <ClearButton
                        variant="secondary"
                        size="sm"
                        onClick={() => undo(item)}
                        disabled={busyId !== null}
                        aria-label={t("undoNamed", { summary: text })}
                      >
                        <IconArrowBackUp aria-hidden />
                        {t("undo")}
                      </ClearButton>
                    ) : null
                  }
                />
              );
            })}
          </div>
          {changes.length > COLLAPSED && (
            <div>
              <ClearButton variant="ghost" size="sm" onClick={() => setExpanded((e) => !e)}>
                {expanded ? t("showFewer") : t("showAll", { count: changes.length })}
              </ClearButton>
            </div>
          )}
        </>
      )}
    </section>
  );
}
