"use client";

import { useId, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { ClearSwitch } from "@/components/clear/switch";
import { cn } from "@/lib/utils";

// Privacy mode is the `privacy` class on <html> (the inline script in the root layout
// restores it from localStorage before the first paint); globals.css turns every money
// figure into dots while it is set. The class is the single source of truth, so every
// toggle on screen (Home's eye, the Settings row) stays in step.
const STORAGE_KEY = "privacy";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

const isOn = () => document.documentElement.classList.contains("privacy");

function setPrivacy(next: boolean) {
  document.documentElement.classList.toggle("privacy", next);
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    // Storage blocked: the setting lasts for this page view, which is the harmless way to fail.
  }
}

/**
 * The privacy-mode switch. `icon` (default) is the round eye button the concept draws
 * on the hero card (it takes the colours of what it sits on); `row` is the labelled
 * switch row for Settings.
 */
export function PrivacyToggle({ variant = "icon", className }: { variant?: "icon" | "row"; className?: string }) {
  const t = useTranslations("settings.inline");
  const on = useSyncExternalStore(subscribe, isOn, () => false);
  const labelId = useId();

  if (variant === "row") {
    return (
      <div className={cn("flex items-center gap-3 px-3 py-2.5", className)}>
        <span id={labelId} className="flex-1 text-[15px] font-semibold text-clear-ink">{t("privacyMode")}</span>
        <ClearSwitch checked={on} onCheckedChange={setPrivacy} labelledBy={labelId} />
      </div>
    );
  }

  const label = on ? t("showAmounts") : t("hideAmounts");
  return (
    <button
      type="button"
      onClick={() => setPrivacy(!on)}
      aria-label={label}
      aria-pressed={on}
      title={label}
      data-tip-anchor="privacyEye"
      className={cn(
        "inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-current/14 outline-none transition-[background-color,transform] duration-150 hover:bg-current/20 focus-visible:ring-3 focus-visible:ring-clear-ember/50 active:scale-[0.97]",
        className,
      )}
    >
      {on ? <IconEyeOff className="size-[19px]" aria-hidden /> : <IconEye className="size-[19px]" aria-hidden />}
    </button>
  );
}
