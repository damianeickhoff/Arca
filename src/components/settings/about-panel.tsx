"use client";

import { Fragment, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  IconBook2,
  IconBrandGithub,
  IconBug,
  IconBuildingBank,
  IconCamera,
  IconChevronDown,
  IconDatabase,
  IconMapPin,
  IconSearch,
  IconShieldCheck,
  IconSparkles,
} from "@tabler/icons-react";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import { SettingsSection } from "@/components/settings/settings-ui";
import { BrandMark } from "@/components/clear/brand-mark";
import { ClearChip } from "@/components/clear/chip";
import { IconTile } from "@/components/clear/icon-tile";
import { ListRow } from "@/components/clear/list-row";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { DOCS_URL, ISSUES_URL, LICENSE_URL, RELEASES_URL, REPO_URL } from "@/lib/links";
import type { ChangelogEntry } from "@/lib/changelog";
import type { ClearTone } from "@/components/clear/tones";
import { cn } from "@/lib/utils";

/**
 * Settings › About: the version, what leaves your server (the whole list, so a
 * careful self-hoster can check it against the code), where backups live, and the
 * release notes. The notes come from CHANGELOG.md inside the image, never from the
 * network: this page makes no request anywhere.
 */
export function AboutPanel({ version, entries }: { version: string; entries: ChangelogEntry[] }) {
  const t = useTranslations("about");
  const tPanels = useTranslations("settings.panels");

  const network: Array<{ key: "bank" | "ai" | "ocr" | "map" | "search"; icon: ReactNode; tone: ClearTone }> = [
    { key: "bank", icon: <IconBuildingBank stroke={1.9} />, tone: "sky" },
    { key: "ai", icon: <IconSparkles stroke={1.9} />, tone: "lilac" },
    { key: "ocr", icon: <IconCamera stroke={1.9} />, tone: "peach" },
    { key: "map", icon: <IconMapPin stroke={1.9} />, tone: "mint" },
    { key: "search", icon: <IconSearch stroke={1.9} />, tone: "butter" },
  ];

  return (
    <>
      <PanelHeader title={tPanels("about.title")} />
      <div className="flex flex-col gap-6 px-4 pt-1 pb-4 font-clear text-clear-ink">
        {/* Identity */}
        <div className="flex flex-col gap-4 rounded-clear-tile bg-clear-tile p-5">
          <div className="flex items-center gap-4">
            <BrandMark size="lg" />
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[22px] font-extrabold tracking-[-0.02em]">Arca</span>
                <ClearChip tone="neutral">{t("version", { version })}</ClearChip>
              </div>
              <p className="m-0 text-sm text-clear-ink-2">{t("tagline")}</p>
            </div>
          </div>
          <p className="m-0 text-sm text-clear-ink-2">
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
        </div>

        {/* What leaves your server */}
        <SettingsSection title={t("network.title")} subtitle={t("network.intro")}>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {network.map((item) => (
              <li key={item.key} className="flex items-start gap-3.5 rounded-clear-tile bg-clear-tile p-4">
                <IconTile tone={item.tone} size="md">{item.icon}</IconTile>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[15px] font-bold">{t(`network.items.${item.key}.title`)}</span>
                  <span className="text-sm text-clear-ink-2">{t(`network.items.${item.key}.body`)}</span>
                </div>
              </li>
            ))}
            <li className="flex items-start gap-3.5 rounded-clear-tile bg-clear-mint p-4 text-clear-mint-ink">
              <IconTile tone="mint" size="md"><IconShieldCheck stroke={1.9} /></IconTile>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[15px] font-bold">{t("network.nothingElseTitle")}</span>
                <span className="text-sm">{t("network.nothingElse")}</span>
              </div>
            </li>
          </ul>
        </SettingsSection>

        {/* Backups */}
        <SettingsSection title={t("backups.title")}>
          <ListRow
            href="/settings?panel=dataHealth"
            icon={<IconTile tone="stone" size="sm"><IconDatabase stroke={1.9} /></IconTile>}
            title={t("backups.open")}
            meta={t("backups.body")}
          />
        </SettingsSection>

        {/* Release notes */}
        <SettingsSection
          title={t("changelog.title")}
          subtitle={t("changelog.intro")}
          action={
            <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="text-sm font-bold text-clear-ink underline-offset-2 hover:underline">
              {t("changelog.onGitHub")}
            </a>
          }
        >
          {entries.length === 0 ? (
            <p className="m-0 text-sm text-clear-muted">{t("changelog.none")}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {entries.map((entry, i) => (
                <ReleaseEntry key={entry.version} entry={entry} current={entry.version === version} defaultOpen={i === 0} />
              ))}
            </ul>
          )}
        </SettingsSection>
      </div>
    </>
  );
}

function ReleaseEntry({ entry, current, defaultOpen }: { entry: ChangelogEntry; current: boolean; defaultOpen: boolean }) {
  const t = useTranslations("about.changelog");
  const locale = useLocale();
  const [open, setOpen] = useState(defaultOpen);
  const date = entry.date
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${entry.date}T12:00:00`))
    : "";

  return (
    <li className="rounded-clear-tile bg-clear-tile">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 rounded-clear-tile p-4 text-left text-clear-ink"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-extrabold tabular-nums">{entry.version}</span>
            {current && <ClearChip tone="mint">{t("current")}</ClearChip>}
            {date && <span className="text-[13px] text-clear-muted">{date}</span>}
          </div>
          {entry.title && <span className="text-sm text-clear-ink-2">{entry.title}</span>}
        </div>
        <IconChevronDown aria-hidden className={cn("size-5 shrink-0 text-clear-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="flex flex-col gap-4 px-4 pb-4 text-sm">
          {entry.intro && <p className="m-0 text-clear-ink-2">{inline(entry.intro)}</p>}
          {entry.sections.map((section) => (
            <div key={section.heading} className="flex flex-col gap-1.5">
              <h4 className="m-0 text-[15px] font-bold">{section.heading}</h4>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {section.items.map((item, i) => (
                  <li
                    key={i}
                    className={cn("text-clear-ink-2", item.bullet && "relative pl-4 before:absolute before:left-0 before:top-[0.6em] before:size-1.5 before:rounded-full before:bg-clear-muted")}
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
