"use client";

import { useTranslations } from "next-intl";
import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { OptionList } from "@/components/option-list";

const ORDER: ThemeMode[] = ["light", "dark", "system"];

const LIST_ICONS: Record<ThemeMode, React.ComponentType<{ stroke?: number }>> = {
  light: IconSun,
  dark: IconMoon,
  system: IconDeviceDesktop,
};

/** The theme picker on the Appearance settings panel: one row per mode. */
export function ThemeList() {
  const t = useTranslations("settings.options");
  const { mode, setMode } = useTheme();
  return (
    <OptionList
      label={t("themeLabel")}
      options={ORDER.map((m) => {
        const Icon = LIST_ICONS[m];
        return { value: m, label: t(`theme.${m}`), description: t(`theme.${m}Hint`), icon: <Icon stroke={1.9} /> };
      })}
      value={mode}
      onSelect={setMode}
    />
  );
}
