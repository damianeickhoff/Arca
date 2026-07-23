"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocale } from "@/app/actions/locale";
import { locales, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { OptionList } from "@/components/option-list";

const SHORT: Record<Locale, string> = { en: "EN", nl: "NL" };
const FULL: Record<Locale, string> = { en: "English", nl: "Nederlands" };

// List-style language picker for the "Language" settings sub-page.
export function LanguageList() {
  const active = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: Locale) {
    if (next === active) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <OptionList
      options={locales.map((l) => ({ value: l, label: FULL[l] }))}
      value={active}
      onSelect={change}
      disabled={pending}
    />
  );
}

// Segmented EN / NL control, styled to sit where ThemeSegmented does in the settings
// rows. Writes the choice to the locale cookie via a server action, then refreshes so
// the new messages (and <html lang>) render.
export function LanguageSegmented() {
  const active = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: Locale) {
    if (next === active) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <span
      role="radiogroup"
      aria-label="Language"
      className="inline-flex shrink-0 items-center rounded-full bg-foreground/15 p-0.5"
    >
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={active === l}
          aria-label={l === "en" ? "English" : "Nederlands"}
          disabled={pending}
          onClick={(e) => {
            e.stopPropagation();
            change(l);
          }}
          className={cn(
            "flex h-7 min-w-9 items-center justify-center rounded-full px-2 text-xs font-semibold transition-colors cursor-pointer disabled:cursor-default",
            active === l ? "bg-card text-foreground shadow" : "text-foreground/40 hover:text-foreground/70",
          )}
        >
          {SHORT[l]}
        </button>
      ))}
    </span>
  );
}
