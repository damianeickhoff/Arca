import { useTranslations } from "next-intl";

/** Error codes the bank actions, the callback and a logged sync answer with; anything else reads as "unavailable". */
const ERRORS = ["notConfigured", "invalidKey", "unauthorized", "sessionExpired", "rateLimited", "badRequest", "unavailable", "busy", "expired", "unknownState", "denied", "signedOut"] as const;

/** A bank connection error code as a translated sentence (bankConnection.errors). */
export function useBankErrorText() {
  const t = useTranslations("bankConnection.errors");
  return (code: string) => ((ERRORS as readonly string[]).includes(code) ? t(code as (typeof ERRORS)[number]) : t("unavailable"));
}
