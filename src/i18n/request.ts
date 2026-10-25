import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, parseLocale } from "./config";

// Runs for every request (Server Components and the client provider both read from
// here). We read the locale from the cookie set by the settings switcher instead of
// from the URL, so there is no [locale] route segment to maintain.
export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
