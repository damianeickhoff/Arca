"use client";

import { useEffect, useState } from "react";
import {
  IconDotsVerticalFilled as EllipsisVertical,
  IconWallet as Wallet,
  IconBuildingBank as Landmark
} from "@tabler/icons-react";
import { Icon } from "@/components/icon";
import { ListItemRow } from "@/components/list-item-row";
import { PageEmptyState } from "@/components/page-empty-state";
import type { Bank, VermogenAccount } from "@/db/schema";
import { FloatingAddButton } from "@/components/floating-add-button";
import {
  BankEditDialog,
  VermogenEditDialog,
  CARD_TYPE_LABELS,
  vermogenTypeLabel,
} from "./account-edit-dialogs";

function formatEurSimple(v: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v).replace(/\s/g, "");
}

// ─── Section 1: Asset accounts ─────────────────────────────────────────

export function VermogenSection({ initialAccounts }: { initialAccounts: VermogenAccount[] }) {
  const [accounts, setAccounts] = useState<VermogenAccount[]>(initialAccounts);
  const [editing, setEditing] = useState<VermogenAccount | null>(null);
  // Resync with the server on refresh (e.g. a balance correction elsewhere) instead of
  // keeping whatever this component's local optimistic state last had.
  useEffect(() => { setAccounts(initialAccounts); }, [initialAccounts]);

  // Totals per type
  const totalByType: Record<string, number> = {};
  for (const a of accounts) {
    if (a.active) totalByType[a.type] = (totalByType[a.type] ?? 0) + a.value;
  }
  const grandTotal = Object.values(totalByType).reduce((s, v) => s + v, 0);

  return (
    <div className="rounded-2xl bg-card p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="font-semibold text-lg mb-1">Asset accounts</h2>
          <p className="text-sm text-foreground/60">Tracked manually for the net worth calculation.</p>
        </div>
        {/* Adding now navigates to the routed subpage (shared form style). */}
        <FloatingAddButton href="/settings/accounts/vermogen/add" ariaLabel="Add asset account" />
      </div>

      {/* Total */}
      {accounts.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-1.5 rounded-sm px-3 py-3 text-xs font-semibold bg-foreground/3 text-foreground">
            Total: {formatEurSimple(grandTotal)}
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <PageEmptyState
          icon={Wallet}
          title="No asset accounts yet"
          description="Add your savings, investments and other assets to track your net worth."
        />
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <div key={account.id} className="py-3.5 px-5 rounded-xl bg-foreground/3 flex items-center gap-3">
              <div className="size-14 rounded-full bg-white dark:bg-white/10 text-foreground flex items-center justify-center shrink-0">
                <Wallet className="size-6" />
              </div>
              <div className={`flex-1 min-w-0 ${!account.active ? "opacity-50" : ""}`}>
                <p className="font-semibold text-base truncate">{account.name}</p>
                <p className="text-sm text-foreground/60 mt-0.5 truncate">
                  {vermogenTypeLabel(account.type)}
                  {!account.active && " · Inactive"}
                  {account.lastUpdated && ` · ${new Date(account.lastUpdated + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
                </p>
              </div>
              <span className="tabular-nums font-semibold text-sm text-foreground shrink-0">
                {formatEurSimple(account.value)}
              </span>
              <button
                onClick={() => setEditing(account)}
                className="flex items-center justify-center p-1.5 rounded hover:bg-foreground/10 text-foreground rounded-sm bg-foreground/5 hover:text-foreground shrink-0 size-9 cursor-pointer"
              >
                <EllipsisVertical className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <VermogenEditDialog
        account={editing}
        open={editing !== null}
        onOpenChange={(v) => !v && setEditing(null)}
        onSaved={(updated) => setAccounts((a) => a.map((x) => (x.id === updated.id ? updated : x)))}
        onDeleted={(id) => setAccounts((a) => a.filter((x) => x.id !== id))}
      />
    </div>
  );
}

// ─── Section 2: Linked accounts (CSV banks) ──────────────────────────────

export function LinkedBanksSection({ initialBanks }: { initialBanks: Bank[] }) {
  const [bankList, setBankList] = useState<Bank[]>(initialBanks);
  const [editing, setEditing] = useState<Bank | null>(null);
  // Resync with the server on refresh — a balance correction changes startingBalance
  // server-side, and this list's own local state must not keep shadowing that.
  useEffect(() => { setBankList(initialBanks); }, [initialBanks]);

  return (
    <div className="rounded-2xl bg-card p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="font-semibold text-lg mb-1">Linked accounts</h2>
          <p className="text-sm text-foreground/60">
            Used for CSV imports and category rules.
          </p>
        </div>
        {/* Adding now navigates to the routed subpage (shared form style). */}
        <FloatingAddButton href="/settings/accounts/banks/add" ariaLabel="Add bank" />
      </div>

      {bankList.length === 0 ? (
        <PageEmptyState
          icon={Landmark}
          title="No linked accounts yet"
          description="Import a CSV or add a bank account manually to get started."
        />
      ) : (
        <div className="space-y-3">
          {bankList.map((bank) => (
            <ListItemRow
              key={bank.id}
              className="rounded-xl bg-foreground/3"
              icon={<Icon iconKey="IconBuildingBank" round size="xxl" />}
              name={bank.displayName ?? bank.accountNumber ?? `Bank ${bank.id}`}
              subtitle={[
                bank.cardType ? CARD_TYPE_LABELS[bank.cardType] ?? bank.cardType : "Unknown type",
                bank.expirationDate && `Expires ${new Date(bank.expirationDate + "T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`,
                bank.displayName && bank.accountNumber && bank.accountNumber,
              ].filter(Boolean).join(" · ")}
              right={
                <button
                  onClick={() => setEditing(bank)}
                  className="flex items-center justify-center p-1.5 rounded hover:bg-foreground/10 text-foreground rounded-sm bg-foreground/5 hover:text-foreground shrink-0 size-9 cursor-pointer"
                >
                  <EllipsisVertical className="size-4" />
                </button>
              }
            />
          ))}
        </div>
      )}

      <BankEditDialog
        bank={editing}
        open={editing !== null}
        onOpenChange={(v) => !v && setEditing(null)}
        onSaved={(updated) => setBankList((b) => b.map((x) => (x.id === updated.id ? updated : x)))}
        onDeleted={(id) => setBankList((b) => b.filter((x) => x.id !== id))}
      />
    </div>
  );
}
