import type { ComponentType } from "react";
import {
  IconBuildingStore,
  IconCalendar,
  IconCalendarEvent,
  IconCoin,
  IconCreditCard,
  IconFileUpload,
  IconHelpCircle,
  IconKey,
  IconLanguage,
  IconLock,
  IconMoon,
  IconReload,
  IconShield,
  IconStethoscope,
  IconTableOptions,
  IconTag,
  IconUser,
  IconUsers,
  IconWallet,
} from "@tabler/icons-react";

// The one list of settings sections, shared by the phone SettingsDialog and the
// /settings page. Labels are translation keys: `settings.sections.<section>` for the
// group headings and `settings.panels.<panel>.title` for the rows.

export type SettingsPanelKey =
  | "profile" | "security"
  | "accounts" | "categories" | "recurring" | "merchants"
  | "financialMonth" | "monthOverrides" | "budgetRecurring"
  | "import" | "importProfiles" | "dataHealth"
  | "appearance" | "privacy" | "appLock" | "language" | "currency"
  | "help" | "users";

export type SettingsSectionKey = "account" | "manage" | "data" | "app" | "about";

export interface SettingsRow {
  key: SettingsPanelKey;
  icon: ComponentType<{ className?: string; size?: number; stroke?: number }>;
}

export interface SettingsSection {
  key: SettingsSectionKey;
  rows: SettingsRow[];
}

const SECTIONS: SettingsSection[] = [
  {
    key: "manage",
    rows: [
      { key: "accounts", icon: IconCreditCard },
      { key: "categories", icon: IconTag },
      { key: "recurring", icon: IconReload },
      { key: "merchants", icon: IconBuildingStore },
      { key: "financialMonth", icon: IconCalendar },
      { key: "monthOverrides", icon: IconCalendarEvent },
      { key: "budgetRecurring", icon: IconWallet },
    ],
  },
  {
    key: "data",
    rows: [
      { key: "import", icon: IconFileUpload },
      { key: "importProfiles", icon: IconTableOptions },
      { key: "dataHealth", icon: IconStethoscope },
    ],
  },
  {
    key: "app",
    rows: [
      { key: "appearance", icon: IconMoon },
      { key: "privacy", icon: IconShield },
      { key: "appLock", icon: IconLock },
      { key: "language", icon: IconLanguage },
      { key: "currency", icon: IconCoin },
    ],
  },
  {
    key: "about",
    rows: [{ key: "help", icon: IconHelpCircle }],
  },
];

const USERS_ROW: SettingsRow = { key: "users", icon: IconUsers };

/**
 * The sections to show. `withAccount` adds an Account group on top (Profile, Password
 * & 2FA and, for admins, Users) — the /settings page has no other place for those,
 * while the dialog edits the profile from its header and lists Users under App.
 */
export function settingsSections({ isAdmin, withAccount }: { isAdmin: boolean; withAccount: boolean }): SettingsSection[] {
  if (withAccount) {
    const account: SettingsSection = {
      key: "account",
      rows: [
        { key: "profile", icon: IconUser },
        { key: "security", icon: IconKey },
        ...(isAdmin ? [USERS_ROW] : []),
      ],
    };
    return [account, ...SECTIONS];
  }
  if (!isAdmin) return SECTIONS;
  return SECTIONS.map((s) => (s.key === "app" ? { ...s, rows: [...s.rows, USERS_ROW] } : s));
}

/** Panels whose content is server-rendered (settings-panel-content.tsx) and passed in
 *  as nodes; the rest are client-only and built by SettingsPanelBody. */
export const HEAVY_PANELS = ["accounts", "categories", "recurring", "merchants", "users", "dataHealth", "importProfiles"] as const;
export type HeavyPanelKey = (typeof HEAVY_PANELS)[number];

export function isHeavyPanel(key: SettingsPanelKey): key is HeavyPanelKey {
  return (HEAVY_PANELS as readonly string[]).includes(key);
}

/** The heavy panels draw their own PanelHeader (with panel-specific actions), so the
 *  host skips the generic one for them. */
export const SELF_CHROMED_PANELS: ReadonlySet<SettingsPanelKey> = new Set<SettingsPanelKey>(HEAVY_PANELS);

/** The panel /settings opens on when none is named. */
export const DEFAULT_SETTINGS_PANEL: SettingsPanelKey = "accounts";

/** The old /settings?tab= values, kept so existing links and bookmarks still land. */
const LEGACY_TABS: Record<string, SettingsPanelKey> = {
  categories: "categories",
  recurring: "recurring",
  brandicons: "merchants",
  banks: "accounts",
  accounts: "accounts",
  general: "financialMonth",
  profile: "profile",
};

export function legacyTabPanel(tab: string | undefined): SettingsPanelKey | null {
  return tab ? (LEGACY_TABS[tab] ?? null) : null;
}

/** The `?panel=` value when it names a row this user can see, else null. */
export function parseSettingsPanel(value: string | undefined, isAdmin: boolean): SettingsPanelKey | null {
  if (!value) return null;
  for (const section of settingsSections({ isAdmin, withAccount: true })) {
    const row = section.rows.find((r) => r.key === value);
    if (row) return row.key;
  }
  return null;
}
