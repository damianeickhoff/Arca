import { createTranslator } from "next-intl";
import en from "../../messages/en.json";
import nl from "../../messages/nl.json";
import { defaultLocale, locales, type Locale } from "@/i18n/config";
import { formatEur } from "@/lib/format";
import type { NoticeParams } from "@/lib/notification-rules";

// Renders a stored notice (translation keys + params) in one language: for the
// /notifications page in the reader's language, and for a push in the language of the
// device it goes to. `amount` and `threshold` render as money (the currency set for this
// process, see setCurrentCurrency), `date` as a short date; other params as they are.

const MESSAGES = { en, nl } as const;

export function parseParams(value: string | null | undefined): NoticeParams {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as NoticeParams) : {};
  } catch {
    return {};
  }
}

function formatParams(params: NoticeParams, locale: Locale): NoticeParams {
  const out: NoticeParams = { ...params };
  for (const key of ["amount", "threshold"]) {
    if (typeof out[key] === "number") out[key] = formatEur(out[key] as number);
  }
  if (typeof out.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(out.date)) {
    out.date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(`${out.date}T12:00:00`));
  }
  return out;
}

export function renderNotice(notice: { title: string; body: string; params: string | null }, localeIn: string): { title: string; body: string } {
  const locale = locales.includes(localeIn as Locale) ? (localeIn as Locale) : defaultLocale;
  const t = createTranslator({ locale, messages: MESSAGES[locale] as Record<string, unknown> });
  const params = formatParams(parseParams(notice.params), locale);
  const say = (key: string) => {
    try {
      return (t as unknown as (key: string, values: NoticeParams) => string)(key, params);
    } catch {
      // A key removed in a later version: show nothing rather than break the page.
      return "";
    }
  };
  return { title: say(notice.title), body: say(notice.body) };
}
