"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { IconRefresh } from "@tabler/icons-react";
import { ClearButton } from "@/components/clear/button";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { MoneyText } from "@/components/clear/money";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { daysBetween, parseValueInput } from "@/lib/net-worth-history";
import { cn } from "@/lib/utils";
import { updateManualBalancesAction } from "./actions";

export interface ManualValue {
  id: number;
  name: string;
  value: number;
  lastUpdated: string | null;
  stale: boolean;
}

const inputValue = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ","));

/**
 * The values you keep by hand (investments, a car), each with how old it is and a
 * field for today's value; older than 60 days gets the orange ring. Saving the same
 * value again confirms it. Synced accounts follow the imports and aren't listed.
 */
function UpdateBalancesForm({ items, today, lastImport, onSaved }: { items: ManualValue[]; today: string; lastImport: string | null; onSaved?: () => void }) {
  const t = useTranslations("insights.netWorthTab.update");
  const locale = useLocale();
  const router = useRouter();
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dayMonth = (date: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));

  const dirty = Object.keys(draft).map(Number);
  const invalid = dirty.filter((id) => parseValueInput(draft[id]) == null);

  function save() {
    if (invalid.length > 0) {
      setError(t("invalid"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateManualBalancesAction(dirty.map((id) => ({ id, value: parseValueInput(draft[id])! })));
      if (result.error) {
        setError(t("failed"));
        return;
      }
      setDraft({});
      router.refresh();
      onSaved?.();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <ul className="m-0 flex list-none flex-col p-0">
        {items.map((item) => {
          const age = item.lastUpdated ? daysBetween(item.lastUpdated, today) : null;
          const id = `manual-value-${item.id}`;
          const bad = invalid.includes(item.id);
          return (
            <li key={item.id} className="flex items-center gap-3 py-[7px]">
              <label htmlFor={id} className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold">{item.name}</span>
                <span className={cn("truncate text-xs", item.stale ? "font-semibold text-clear-ember-text" : "text-clear-muted")}>
                  {item.lastUpdated && age != null ? t("age", { date: dayMonth(item.lastUpdated), count: age }) : t("never")}
                </span>
              </label>
              <span className="relative shrink-0">
                <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-semibold text-clear-muted">€</span>
                <input
                  id={id}
                  inputMode="decimal"
                  autoComplete="off"
                  value={draft[item.id] ?? inputValue(item.value)}
                  onChange={(e) => setDraft((d) => ({ ...d, [item.id]: e.target.value }))}
                  aria-invalid={bad || undefined}
                  className={cn(
                    "h-9 w-[120px] rounded-clear-row border-[1.5px] border-transparent bg-clear-tile pr-3 pl-7 text-right font-clear text-sm font-semibold tabular-nums text-clear-ink outline-none transition-colors focus:border-clear-ink",
                    item.stale && draft[item.id] == null && "border-clear-ember",
                    bad && "border-clear-negative-fill",
                  )}
                />
              </span>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="m-0 text-[13px] font-semibold text-clear-negative">{error}</p>}
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span className="text-xs text-clear-muted">{lastImport ? t("syncedLast", { date: dayMonth(lastImport) }) : t("synced")}</span>
        <ClearButton size="sm" onClick={save} disabled={pending || dirty.length === 0}>
          {pending ? t("saving") : t("save")}
        </ClearButton>
      </div>
    </div>
  );
}

/** The Update balances card in the page's right column (also the target of the table's "Update value" mark). */
export function UpdateBalancesCard({ items, today, lastImport }: { items: ManualValue[]; today: string; lastImport: string | null }) {
  const t = useTranslations("insights.netWorthTab.update");
  return (
    <ClearCard id="update-balances" aria-labelledby="networth-update-title" className="scroll-mt-24 gap-2">
      <ClearCardHeader title={<span id="networth-update-title">{t("title")}</span>} subtitle={items.length > 0 ? t("subtitle", { count: items.length }) : undefined} />
      {items.length > 0 ? (
        <UpdateBalancesForm items={items} today={today} lastImport={lastImport} />
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="m-0 text-sm text-clear-ink-2">{t("none")}</p>
          <Link href="/settings?panel=accounts" className={clearButtonVariants({ variant: "secondary", size: "sm" })}>
            {t("addAsset")}
          </Link>
        </div>
      )}
    </ClearCard>
  );
}

/** "Update balances" for the page heading: the same form in a dialog (a sheet on phones). */
export function UpdateBalancesButton({ items, today, lastImport, className }: { items: ManualValue[]; today: string; lastImport: string | null; className?: string }) {
  const t = useTranslations("insights.netWorthTab.update");
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const stale = items.filter((i) => i.stale).length;
  return (
    <>
      <ClearButton size="sm" onClick={() => setOpen(true)} className={className}>
        <IconRefresh aria-hidden />
        {t("title")}
        {stale > 0 && <span className="ml-0.5 inline-flex size-5 items-center justify-center rounded-full bg-clear-ember text-xs font-bold text-clear-ember-ink">{stale}</span>}
      </ClearButton>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent hideHeaderRow title={t("title")} className="gap-4 pt-7 font-clear text-clear-ink">
          <ClearDialogHeader title={t("title")} subtitle={<MoneyText>{t("subtitle", { count: items.length })}</MoneyText>} onClose={() => setOpen(false)} closeLabel={t("close")} />
          <UpdateBalancesForm items={items} today={today} lastImport={lastImport} onSaved={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
