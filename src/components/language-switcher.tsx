"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocale } from "@/app/actions/locale";
import { locales, type Locale } from "@/i18n/config";
import { OptionList } from "@/components/option-list";

// Each language is offered under its own name, so it can be found whatever the app
// speaks right now; the hint under it names it in the current language.
const ENDONYM: Record<Locale, string> = { en: "English", nl: "Nederlands" };
const MONOGRAM: Record<Locale, string> = { en: "EN", nl: "NL" };

/** The language picker on the Language settings panel. Writes the locale cookie via a
 *  server action, then refreshes so the new messages (and <html lang>) render. */
export function LanguageList() {
  const t = useTranslations("settings.options");
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
      label={t("languageLabel")}
      options={locales.map((l) => ({
        value: l,
        label: ENDONYM[l],
        lang: l,
        description: l === active ? t("currentLanguage") : t(`languages.${l}`),
        icon: MONOGRAM[l],
      }))}
      value={active}
      onSelect={change}
      disabled={pending}
    />
  );
}
