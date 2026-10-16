"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { IconChevronLeft, IconChevronRight, IconHelpCircle, IconLogout } from "@tabler/icons-react";
import type { User } from "@/db/schema";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/app/actions/auth";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { AnchoredTip } from "@/components/anchored-tip";
import { PanelChromeContext } from "@/components/settings/settings-panel-chrome";
import { SettingsPanelBody, type SettingsPanelSettings } from "@/components/settings/settings-panel-body";
import { settingsSections, type SettingsPanelKey } from "@/components/settings/settings-sections";

const noop = () => {};

/**
 * The Settings page (Clear): every settings section in a navigation card on the left,
 * the open one in a card on the right. The open panel lives in the URL (?panel=).
 *
 * Phones show the navigation as a list until a panel is picked, then only that panel
 * with a link back to the list. (The Home avatar's SettingsDialog stays the main way
 * in on phones; this keeps /settings links working there too.)
 */
export function SettingsView({
  user,
  active,
  explicit,
  heavy,
  settings,
}: {
  user: User;
  active: SettingsPanelKey;
  /** The URL named the panel (rather than falling back to the default). */
  explicit: boolean;
  heavy: React.ReactNode;
  settings: SettingsPanelSettings;
}) {
  const t = useTranslations("settings");
  const sections = settingsSections({ isAdmin: user.isAdmin, withAccount: true });
  const title = t(`panels.${active}.title`);

  return (
    <div className="flex flex-col gap-5 px-4 pt-[calc(var(--sat)+16px)] font-clear text-clear-ink lg:gap-7 lg:px-8 lg:pt-7 lg:pb-12">
      {/* Heading */}
      <div className="flex flex-wrap items-center justify-between gap-3 lg:items-end lg:gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          {explicit && (
            <Link
              href="/settings"
              className="-ml-1 inline-flex items-center gap-1 text-sm font-bold text-clear-ink-2 no-underline lg:hidden"
            >
              <IconChevronLeft size={18} stroke={2.2} aria-hidden />
              {t("allSettings")}
            </Link>
          )}
          <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.03em] lg:text-[40px]">{t("title")}</h1>
          <span className="hidden text-base text-clear-ink-2 lg:inline">{t("subtitle", { name: user.name, email: user.email })}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href="/settings?panel=help"
            className={cn(clearButtonVariants({ variant: "surface", size: "md" }), "hidden no-underline lg:inline-flex")}
          >
            <IconHelpCircle aria-hidden />
            {t("helpAndTips")}
          </Link>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(260px,1fr)_minmax(0,2.4fr)] lg:items-start">
        {/* Navigation */}
        <nav
          aria-label={t("navLabel")}
          data-tip-anchor="settingsNav"
          className={cn(
            "flex min-w-0 flex-col gap-0.5 rounded-clear-card bg-clear-card p-4 lg:sticky lg:top-7 lg:max-h-[calc(100dvh-56px)] lg:overflow-y-auto",
            explicit && "hidden lg:flex",
          )}
        >
          {sections.map((section) => (
            <div key={section.key} className="flex flex-col gap-0.5">
              <span className="px-3 pt-4 pb-2 text-[13px] font-bold text-clear-muted">{t(`sections.${section.key}`)}</span>
              {section.rows.map(({ key, icon: Icon }) => {
                const isActive = key === active;
                return (
                  <Link
                    key={key}
                    href={`/settings?panel=${key}`}
                    aria-current={isActive && explicit ? "page" : undefined}
                    className={cn(
                      "group flex h-12 shrink-0 items-center gap-3 rounded-clear-row px-3 text-[15px] no-underline transition-colors",
                      !isActive && "font-semibold text-clear-ink hover:bg-clear-tile",
                      // The default panel only shows as selected where it is on screen
                      // (desktop); on phones the list comes first.
                      isActive && explicit && "bg-clear-primary font-bold text-clear-primary-ink",
                      isActive && !explicit && "font-semibold text-clear-ink hover:bg-clear-tile lg:bg-clear-primary lg:font-bold lg:text-clear-primary-ink lg:hover:bg-clear-primary",
                    )}
                  >
                    <Icon size={20} stroke={1.9} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{t(`panels.${key}.title`)}</span>
                    <IconChevronRight
                      size={18}
                      stroke={2}
                      aria-hidden
                      className={cn(
                        isActive && explicit ? "text-current" : "text-clear-placeholder",
                        isActive && !explicit && "lg:text-current",
                      )}
                    />
                  </Link>
                );
              })}
            </div>
          ))}

          <span aria-hidden className="mx-3 my-2.5 h-px shrink-0 bg-clear-line" />
          <button
            type="button"
            onClick={() => logoutAction()}
            className="flex h-12 shrink-0 cursor-pointer items-center gap-3 rounded-clear-row px-3 text-left text-[15px] font-bold text-clear-negative transition-colors hover:bg-clear-tile"
          >
            <IconLogout size={20} stroke={1.9} aria-hidden />
            <span className="flex-1">{t("signOut")}</span>
          </button>
        </nav>

        {/* The open panel. On desktop the card keeps to the window height and scrolls
            inside, and translateZ(0) makes it the containing block for the panels'
            `fixed inset-0` overlays (category detail, merchant settings), so those
            cover the card instead of the whole window. Panels pad their own content
            by 16px; the card adds --panel-gutter, which PanelHeader bleeds over. */}
        <section
          aria-label={title}
          className={cn(
            "flex min-w-0 flex-col overflow-clip rounded-clear-card bg-clear-card text-clear-ink lg:sticky lg:top-7 lg:max-h-[calc(100dvh-56px)] lg:[transform:translateZ(0)]",
            !explicit && "hidden lg:flex",
          )}
        >
          <div className="min-h-0 flex-1 px-[var(--panel-gutter)] pb-6 [--panel-gutter:0.5rem] lg:overflow-y-auto lg:[--panel-gutter:0.75rem]">
            <PanelChromeContext.Provider value={{ closePanel: noop, variant: "page", title, subtitle: t(`panels.${active}.subtitle`) }}>
              <SettingsPanelBody key={active} panelKey={active} heavy={heavy} user={user} settings={settings} />
            </PanelChromeContext.Provider>
          </div>
        </section>
      </div>

      {/* The page itself is new on desktop: say once that every section is listed here,
          even to someone who turned tips off (see IGNORES_DISABLED). */}
      <AnchoredTip id="settingsNav" anchor="settingsNav" />
    </div>
  );
}
