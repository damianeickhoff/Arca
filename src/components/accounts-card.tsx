"use client";

import { formatEurSignFirst } from "@/lib/format";
import { BalanceSparkline } from "@/components/dashboard-charts";
import { useSettingsPortal } from "@/lib/settings-portal-state";
import type { VermogenAccount } from "@/db/schema";
import type { BankBalance, BalancePoint } from "@/lib/account-balances";

// Tapping this opens the same Settings > Accounts panel directly, so the dashboard
// entry point and the settings-menu entry point always show the identical page.
export function AccountsCard({
  bankBalances,
  vermogenRows,
  accountsTotal,
  accountHistory,
}: {
  bankBalances: BankBalance[];
  vermogenRows: VermogenAccount[];
  accountsTotal: number;
  accountHistory: BalancePoint[];
}) {
  const { requestPanel } = useSettingsPortal();

  if (bankBalances.length === 0 && vermogenRows.length === 0) return null;

  return (
    <div className="mt-5">
      <p className="mx-6 mb-2 text-base font-semibold text-foreground">Accounts</p>
      <button
        type="button"
        onClick={() => requestPanel("accounts")}
        className="mx-3 rounded-xl bg-card p-5 text-left active:scale-[0.99] transition-transform w-[calc(100%-1.5rem)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-foreground/50">Total</p>
            <p className="text-xl font-semibold tabular-nums tracking-tight">{formatEurSignFirst(accountsTotal)}</p>
          </div>
          {accountHistory.length > 1 && (
            <div className="w-28 h-12 shrink-0">
              <BalanceSparkline data={accountHistory} />
            </div>
          )}
        </div>
        <div className="pt-4 mt-2 border-t border-foreground/10 space-y-3">
          {bankBalances.map((b) => (
            <div key={`bank-${b.id}`} className="flex items-center gap-3">
              <span
                className="flex size-7 items-center justify-center rounded-[5px] text-white text-sm font-normal shrink-0"
                style={{ backgroundColor: b.color ?? "#2f7bf6" }}
              >
                {(b.displayName ?? b.accountNumber ?? "?").charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 text-sm font-medium text-foreground truncate">{b.displayName ?? b.accountNumber ?? `Bank ${b.id}`}</span>
              <span className="text-sm font-semibold tabular-nums text-foreground">{formatEurSignFirst(b.balance)}</span>
            </div>
          ))}
          {vermogenRows.map((a) => (
            <div key={`asset-${a.id}`} className="flex items-center gap-3">
              <span className="flex size-7 items-center justify-center rounded-[5px] text-white text-sm font-normal shrink-0" style={{ backgroundColor: a.color ?? "#0f9d8c" }}>
                {a.name.charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 text-sm font-medium text-foreground truncate">{a.name}</span>
              <span className="text-sm font-semibold tabular-nums text-foreground">{formatEurSignFirst(a.value)}</span>
            </div>
          ))}
        </div>
      </button>
    </div>
  );
}
