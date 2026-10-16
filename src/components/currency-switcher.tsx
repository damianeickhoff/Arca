"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SUPPORTED_CURRENCIES, type SupportedCurrencyCode, getCurrentCurrency, setCurrentCurrency } from "@/lib/format";
import { OptionList } from "@/components/option-list";
import { SettingsNotice } from "@/components/settings/settings-ui";

/**
 * The currency picker on the Currency settings panel. Reads its initial value straight
 * from the format.ts module (set app-wide by CurrencySync before any descendant
 * renders — see src/components/currency-sync.tsx), so it needs no prop.
 */
export function CurrencyList() {
  const t = useTranslations("settings.options");
  const router = useRouter();
  const [active, setActive] = useState<SupportedCurrencyCode>(() => getCurrentCurrency());
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function change(next: SupportedCurrencyCode) {
    if (next === active || pending) return;
    const previous = active;
    setPending(true);
    setFailed(false);
    setActive(next);
    // Optimistic: every formatEur()/currencySymbol() call elsewhere in the app reflects the
    // new symbol immediately, before the settings save round-trip finishes.
    setCurrentCurrency(next);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "default_currency", value: next }),
    }).catch(() => null);
    setPending(false);
    if (!res?.ok) {
      setActive(previous);
      setCurrentCurrency(previous);
      setFailed(true);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <OptionList
        label={t("currencyLabel")}
        options={SUPPORTED_CURRENCIES.map((c) => ({
          value: c.code,
          label: t(`currencies.${c.code}`),
          // An example in the app's own number format, so the symbol is seen in place.
          description: `${c.code} · ${c.symbol}1.234,56`,
          icon: c.symbol,
        }))}
        value={active}
        onSelect={change}
        disabled={pending}
      />
      {failed && <SettingsNotice>{t("currencyError")}</SettingsNotice>}
    </div>
  );
}
