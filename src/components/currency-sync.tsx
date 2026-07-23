"use client";

import { setCurrentCurrency } from "@/lib/format";

// Mirrors the server-fetched "default_currency" app setting into the browser's copy of
// the src/lib/format.ts module (SSR and the client each have their own module instance).
// Set directly in the render body — not a useEffect — so it lands before any sibling/child
// client component (AmountKeypad, AnimatedEur, ...) reads currencySymbol() during the same
// render pass. Render as the first child under RootLayout for that ordering to hold.
export function CurrencySync({ currency }: { currency: string }) {
  setCurrentCurrency(currency);
  return null;
}
