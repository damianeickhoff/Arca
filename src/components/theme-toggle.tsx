"use client";

import { IconMoonFilled, IconSunFilled, IconSunMoon } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { OptionList } from "@/components/option-list";

const MODES: { mode: ThemeMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { mode: "light", label: "Light theme", icon: IconSunFilled },
  { mode: "system", label: "Follow device theme", icon: IconSunMoon },
  { mode: "dark", label: "Dark theme", icon: IconMoonFilled },
];

const LIST_LABELS: Record<ThemeMode, string> = {
  system: "System Default",
  light: "Light",
  dark: "Dark",
};

// List-style theme picker for the "Appearance" settings sub-page — a full-width
// row per option with a checkmark, replacing the compact pill used inline elsewhere.
export function ThemeList() {
  const { mode, setMode } = useTheme();
  return (
    <OptionList
      options={MODES.map((m) => ({ value: m.mode, label: LIST_LABELS[m.mode] }))}
      value={mode}
      onSelect={setMode}
    />
  );
}

// 3-way Light / Auto / Dark segmented control, sized to sit where ToggleSwitch does
// in sidebar rows.
export function ThemeSegmented() {
  const { mode, setMode } = useTheme();
  return (
    <span role="radiogroup" aria-label="Theme" className="inline-flex shrink-0 items-center rounded-full bg-foreground/15 p-0.5">
      {MODES.map(({ mode: m, label, icon: Icon }) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          aria-label={label}
          title={label}
          onClick={(e) => { e.stopPropagation(); setMode(m); }}
          className={cn(
            "flex size-7 items-center justify-center rounded-full transition-colors cursor-pointer",
            mode === m ? "bg-card text-foreground shadow" : "text-foreground/40 hover:text-foreground/70"
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </span>
  );
}

export function ThemeToggle({ variant = "icon", compact }: { variant?: "icon" | "row"; compact?: boolean }) {
  const { mode, cycle } = useTheme();
  const current = MODES.find((m) => m.mode === mode) ?? MODES[1];

  if (variant === "row") {
    return (
      <div
        className={cn(
          "flex items-center rounded-xl font-medium text-foreground/40 w-full",
          compact ? "gap-2.5 px-3 py-2 text-sm" : "gap-3 px-3 py-2.5 text-base"
        )}
      >
        <span className={cn(
          "flex items-center justify-center rounded-lg shrink-0 text-foreground/40",
          compact ? "size-7" : "size-8"
        )}>
          <IconMoonFilled className={compact ? "size-4" : "size-4.5"} />
        </span>
        <span className="flex-1 text-left">Theme</span>
        <ThemeSegmented />
      </div>
    );
  }

  // Collapsed sidebar: single button cycling light → auto → dark.
  return (
    <button onClick={cycle} title={`Theme: ${mode === "system" ? "Auto" : mode === "dark" ? "Dark" : "Light"}`}
      className={cn("p-3 rounded-md text-foreground/40 hover:text-foreground cursor-pointer")}
    >
      <current.icon className="size-5" />
    </button>
  );
}
