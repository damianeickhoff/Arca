"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Segmented } from "@/components/clear/segmented";
import { setLocale } from "@/app/actions/locale";
import { localeNames, locales, type Locale } from "@/i18n/config";

/** EN · NL under the sign-in card. Saves the locale cookie and re-renders the page. */
export function LanguageSwitch() {
  const t = useTranslations("auth.signIn");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Segmented<Locale>
      label={t("language")}
      surface="tile"
      size="sm"
      value={locale}
      className={pending ? "opacity-60" : undefined}
      onChange={(next) => {
        if (next === locale) return;
        startTransition(async () => {
          await setLocale(next);
          router.refresh();
        });
      }}
      items={locales.map((l) => ({
        value: l,
        label: (
          <span lang={l}>
            <span aria-hidden>{l.toUpperCase()}</span>
            <span className="sr-only">{localeNames[l]}</span>
          </span>
        ),
      }))}
    />
  );
}
