"use client";

import { Fragment, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconBook2, IconBrandGithub, IconBug, IconChevronDown, IconChevronRight, IconDatabase, IconRefresh, IconShieldCheck } from "@tabler/icons-react";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import { SettingsNotice, SettingsSwitchRow } from "@/components/settings/settings-ui";
import { BrandMark } from "@/components/clear/brand-mark";
import { ClearButton } from "@/components/clear/button";
import { ClearChip } from "@/components/clear/chip";
import { IconTile } from "@/components/clear/icon-tile";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { AnchoredTip } from "@/components/anchored-tip";
import { checkForUpdateNowAction, setUpdateCheckAction } from "@/app/actions/update-check";
import { DOCS_URL, ISSUES_URL, LICENSE_URL, RELEASES_URL, REPO_URL } from "@/lib/links";
import type { ChangelogEntry } from "@/lib/changelog";
import type { UpdateCheckState } from "@/lib/update-check";
import type { BuildInfo } from "@/lib/build-info";
import { cn } from "@/lib/utils";

/** What is switched on right now, so the connection tiles show the truth, not a description. */
export interface AboutStatus {
  /** Active bank connections (Enable Banking). */
  bankConnections: number;
  /** AI turned on with a key present. */
  aiOn: boolean;
  /** The server has an Ollama host configured for receipt scanning. */
  ocrConfigured: boolean;
  /** ISO timestamp of the newest backup, or null when there is none yet. */
  newestBackup: string | null;
}

type Connection = { key: "bank" | "ai" | "ocr" | "map" | "update"; state: "on" | "off" | "onTap" };

/**
 * Settings › About: who you are running (version, licence, links), what leaves your
 * server with its live state per connection, the opt-in update check, where the
 * backups are, and the release notes from CHANGELOG.md. Rendering this panel makes no
 * network request; the update check runs on the server, once a day, only when on.
 */
export function AboutPanel({
  version,
  entries,
  status,
  updates,
  canManageUpdates,
  build,
}: {
  version: string;
  entries: ChangelogEntry[];
  status: AboutStatus;
  updates: UpdateCheckState;
  canManageUpdates: boolean;
  build: BuildInfo;
}) {
  const t = useTranslations("about");
  const tPanels = useTranslations("settings.panels");
  const locale = useLocale();

  const connections: Connection[] = [
    { key: "bank", state: status.bankConnections > 0 ? "on" : "off" },
    { key: "ai", state: status.aiOn ? "on" : "off" },
    { key: "ocr", state: status.ocrConfigured ? "on" : "off" },
    { key: "map", state: "onTap" },
    { key: "update", state: updates.enabled ? "on" : "off" },
  ];

  const newest = status.newestBackup
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(status.newestBackup))
    : null;

  return (
    <>
      <PanelHeader title={tPanels("about.title")} />
      <div className="flex flex-col gap-5 px-4 pt-1 pb-4 font-clear text-clear-ink">
        {/* Identity */}
        <section className="flex flex-col gap-4 rounded-clear-tile bg-clear-tile p-5">
          <div className="flex items-center gap-4">
            <BrandMark size="xl" className="size-13" />
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-[26px] font-extrabold leading-none tracking-[-0.03em]">Arca</span>
                <ClearChip tone="stone">{t("version", { version })}</ClearChip>
                {build.prerelease && (
                  <ClearChip tone="butter">
                    {build.channel === "local" ? t("build.local") : t("build.prerelease", { ref: build.ref, sha: build.sha })}
                  </ClearChip>
                )}
                {updates.available && updates.latest && (
                  <a href={updates.latest.url} target="_blank" rel="noreferrer" className="no-underline">
                    <ClearChip tone="butter">{t("updates.available", { version: updates.latest.version })}</ClearChip>
                  </a>
                )}
              </div>
              <p className="m-0 text-sm text-clear-ink-2">{t("tagline")}</p>
            </div>
          </div>
          <p className="m-0 text-sm leading-normal text-clear-ink-2">
            {t.rich("licence", {
              link: (chunks) => (
                <a href={LICENSE_URL} target="_blank" rel="noreferrer" className="font-bold text-clear-ink underline-offset-2 hover:underline">
                  {chunks}
                </a>
              ),
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={DOCS_URL} target="_blank" rel="noreferrer" className={clearButtonVariants({ variant: "primary", size: "sm", className: "no-underline" })}>
              <IconBook2 aria-hidden />
              {t("links.guide")}
            </a>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className={clearButtonVariants({ variant: "surface", size: "sm", className: "no-underline" })}>
              <IconBrandGithub aria-hidden />
              {t("links.source")}
            </a>
            <a href={ISSUES_URL} target="_blank" rel="noreferrer" className={clearButtonVariants({ variant: "surface", size: "sm", className: "no-underline" })}>
              <IconBug aria-hidden />
              {t("links.issues")}
            </a>
          </div>
        </section>

        {/* What leaves your server */}
        <section aria-labelledby="about-network" className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1">
            <h3 id="about-network" className="m-0 text-lg font-bold">{t("network.title")}</h3>
            <p className="m-0 text-[13px] text-clear-muted">{t("network.intro")}</p>
          </div>
          <ul className="m-0 grid list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-2">
            {connections.map((c) => (
              <li
                key={c.key}
                className={cn(
                  "flex flex-col gap-2 rounded-clear-tile p-4",
                  c.state === "on" ? "bg-clear-sky text-clear-sky-ink" : "bg-clear-tile text-clear-ink",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-bold">{t(`network.items.${c.key}.title`)}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full bg-clear-card px-2.5 py-1 text-xs font-bold",
                      c.state === "on" ? "text-clear-positive" : c.state === "onTap" ? "text-clear-warning" : "text-clear-stone-ink",
                    )}
                  >
                    {t(`status.${c.state}`)}
                  </span>
                </div>
                <p className={cn("m-0 text-[13px] leading-normal", c.state === "on" ? "" : "text-clear-ink-2")}>
                  {t(`network.items.${c.key}.body`)}
                </p>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3 rounded-clear-tile bg-clear-mint px-4 py-3 text-[13px] font-bold text-clear-mint-ink">
            <IconShieldCheck size={18} stroke={2} aria-hidden className="shrink-0" />
            {t("network.nothingElse")}
          </div>
        </section>

        <UpdateCheckSection updates={updates} canManage={canManageUpdates} />

        {/* Backups */}
        <Link href="/settings?panel=dataHealth" className="flex items-center gap-3.5 rounded-clear-tile bg-clear-tile p-4 text-clear-ink no-underline transition-colors hover:bg-clear-line">
          <IconTile tone="stone" size="sm"><IconDatabase stroke={1.9} /></IconTile>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-bold">{t("backups.open")}</span>
            <span className="text-[13px] text-clear-ink-2">{newest ? t("backups.bodyNewest", { when: newest }) : t("backups.body")}</span>
          </span>
          <IconChevronRight size={18} stroke={2} aria-hidden className="shrink-0 text-clear-muted" />
        </Link>

        {/* Release notes */}
        <section aria-labelledby="about-changelog" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 id="about-changelog" className="m-0 text-lg font-bold">{t("changelog.title")}</h3>
            <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="text-[13px] font-bold text-clear-ink underline-offset-2 hover:underline">
              {t("changelog.onGitHub")}
            </a>
          </div>
          {entries.length === 0 ? (
            <p className="m-0 text-sm text-clear-muted">{t("changelog.none")}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {entries.map((entry, i) => (
                <ReleaseEntry key={entry.version} entry={entry} current={entry.version === version} defaultOpen={i === 0} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

/**
 * The one connection Arca makes on its own, so it is a switch and off by default. On:
 * the server asks GitHub's releases API once a day; the answer shows next to the
 * version above and once on Home. Admins only, like every app-wide setting.
 */
function UpdateCheckSection({ updates, canManage }: { updates: UpdateCheckState; canManage: boolean }) {
  const t = useTranslations("about.updates");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "success" | "info" | "error"; text: string } | null>(null);

  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  function report(result: { error?: string; state?: UpdateCheckState }, turnedOn: boolean) {
    if (result.error === "denied") setNotice({ tone: "error", text: t("denied") });
    else if (result.error) setNotice({ tone: "error", text: t("unavailable") });
    else if (turnedOn && result.state?.available && result.state.latest) setNotice({ tone: "info", text: t("foundNewer", { version: result.state.latest.version }) });
    else if (turnedOn) setNotice({ tone: "success", text: t("upToDate") });
    router.refresh();
  }

  function toggle(enabled: boolean) {
    setNotice(null);
    startTransition(async () => report(await setUpdateCheckAction(enabled), enabled));
  }

  function checkNow() {
    setNotice(null);
    startTransition(async () => report(await checkForUpdateNowAction(), true));
  }

  const hint = !updates.enabled ? t("hintOff") : updates.checkedAt ? t("lastChecked", { when: when(updates.checkedAt) }) : t("hintOn");

  return (
    <section aria-labelledby="about-updates" className="flex flex-col gap-3">
      <h3 id="about-updates" className="m-0 text-lg font-bold">{t("title")}</h3>
      <div className="rounded-clear-tile bg-clear-tile p-2" data-tip-anchor="updateCheck">
        <SettingsSwitchRow
          icon={<IconTile tone="stone" size="sm"><IconRefresh stroke={1.9} /></IconTile>}
          label={t("switch")}
          hint={hint}
          checked={updates.enabled}
          onCheckedChange={toggle}
          disabled={pending || !canManage}
        />
      </div>
      <p className="m-0 text-[13px] leading-normal text-clear-muted">{t("body")}</p>
      {!canManage && <p className="m-0 text-[13px] text-clear-muted">{t("adminOnly")}</p>}
      {updates.enabled && canManage && (
        <div className="flex flex-wrap items-center gap-2.5">
          <ClearButton variant="surface" size="sm" onClick={checkNow} disabled={pending}>
            {pending ? t("checking") : t("checkNow")}
          </ClearButton>
          {updates.available && updates.latest && (
            <a href={updates.latest.url} target="_blank" rel="noreferrer" className="text-[13px] font-bold text-clear-ink underline-offset-2 hover:underline">
              {t("seeNotes", { version: updates.latest.version })}
            </a>
          )}
        </div>
      )}
      {notice && <SettingsNotice tone={notice.tone}>{notice.text}</SettingsNotice>}
      {canManage && <AnchoredTip id="updateCheck" anchor="updateCheck" />}
    </section>
  );
}

function ReleaseEntry({ entry, current, defaultOpen }: { entry: ChangelogEntry; current: boolean; defaultOpen: boolean }) {
  const t = useTranslations("about.changelog");
  const locale = useLocale();
  const [open, setOpen] = useState(defaultOpen);
  const date = entry.date
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: open ? "numeric" : undefined }).format(new Date(`${entry.date}T12:00:00`))
    : "";

  return (
    <li className={cn("rounded-clear-tile transition-colors", open && "bg-clear-tile")}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 rounded-clear-tile px-4 py-3 text-left text-clear-ink"
      >
        <span className="w-12 shrink-0 text-[15px] font-extrabold tabular-nums">{entry.version}</span>
        <span className={cn("min-w-0 flex-1 text-sm", open ? "font-bold" : "text-clear-ink-2")}>{entry.title}</span>
        {current && <ClearChip tone="mint">{t("current")}</ClearChip>}
        {date && <span className="shrink-0 text-[13px] text-clear-muted">{date}</span>}
        <IconChevronDown size={16} stroke={2} aria-hidden className={cn("shrink-0 text-clear-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="flex flex-col gap-3 px-4 pb-4 text-sm">
          {entry.intro && <p className="m-0 text-clear-ink-2">{inline(entry.intro)}</p>}
          {entry.sections.map((section) => (
            <div key={section.heading} className="flex flex-col gap-1.5">
              <h4 className="m-0 text-[14px] font-bold">{section.heading}</h4>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {section.items.map((item, i) => (
                  <li
                    key={i}
                    className={cn("leading-normal text-clear-ink-2", item.bullet && "relative pl-3.5 before:absolute before:left-0 before:top-[0.6em] before:size-1.5 before:rounded-full before:bg-clear-muted")}
                    style={item.level ? { marginLeft: `${item.level}rem` } : undefined}
                  >
                    {inline(item.text)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|#\d+)/g;

/** The little markdown the notes use: **bold**, `code`, [text](url) and #123. */
function inline(text: string): ReactNode {
  const parts = text.split(INLINE);
  return parts.map((part, i) => {
    if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
    if (part.startsWith("**")) return <strong key={i} className="font-bold text-clear-ink">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`")) return <code key={i} className="rounded-[6px] bg-clear-card px-1 py-0.5 font-mono text-[13px] text-clear-ink">{part.slice(1, -1)}</code>;
    if (part.startsWith("#")) {
      return (
        <a key={i} href={`${ISSUES_URL}/${part.slice(1)}`} target="_blank" rel="noreferrer" className="font-bold text-clear-ink underline-offset-2 hover:underline">
          {part}
        </a>
      );
    }
    const m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (m) {
      return (
        <a key={i} href={m[2]} target="_blank" rel="noreferrer" className="font-bold text-clear-ink underline-offset-2 hover:underline">
          {m[1]}
        </a>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
