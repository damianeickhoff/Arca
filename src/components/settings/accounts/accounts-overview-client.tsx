"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  IconArrowUp as ArrowUp,
  IconArrowDown as ArrowDown,
  IconPlus as Plus,
  IconCreditCardFilled as CreditCard,
  IconCoinEuroFilled as Coin,
} from "@tabler/icons-react";
import { formatEur, formatEurSignFirst } from "@/lib/format";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { BankEditDialog, VermogenEditDialog, AddAccountDialog, vermogenTypeLabel, CARD_TYPE_LABELS } from "@/app/settings/account-edit-dialogs";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import type { Bank, VermogenAccount } from "@/db/schema";
import type { BankBalance, BalancePoint } from "@/lib/account-balances";

const RANGES = [
  { key: "1w", label: "1w", days: 7 },
  { key: "1m", label: "1m", days: 30 },
  { key: "3m", label: "3m", days: 90 },
  { key: "6m", label: "6m", days: 180 },
  { key: "1y", label: "1y", days: 365 },
] as const;

type RangeKey = typeof RANGES[number]["key"];

interface Props {
  banks: BankBalance[];
  assets: VermogenAccount[];
  history: BalancePoint[];
}

export function AccountsOverviewClient({ banks: initialBanks, assets: initialAssets, history }: Props) {
  const [banks, setBanks] = useState<BankBalance[]>(initialBanks);
  const [assets, setAssets] = useState<VermogenAccount[]>(initialAssets);
  const [range, setRange] = useState<RangeKey>("6m");

  // The local state above gives instant optimistic feedback on add/edit/delete, but a
  // balance correction changes a transaction-derived total that only the server can
  // recompute — resync with the server's fresh numbers whenever router.refresh() lands
  // a new `banks`/`assets` prop (e.g. after BankEditDialog saves), so this panel and
  // the totals it feeds never keep showing a pre-correction balance.
  useEffect(() => { setBanks(initialBanks); }, [initialBanks]);
  useEffect(() => { setAssets(initialAssets); }, [initialAssets]);

  // Editing dialogs — the overview owns the open state; the balance shown for a bank
  // is transaction-derived, so a starting-balance edit only takes effect after refresh.
  const [editingBank, setEditingBank] = useState<Bank | null>(null);
  const [editingAsset, setEditingAsset] = useState<VermogenAccount | null>(null);

  const bankTotal = banks.reduce((s, b) => s + b.balance, 0);
  const assetTotal = assets.reduce((s, a) => s + a.value, 0);
  const total = bankTotal + assetTotal;
  const accountCount = banks.length + assets.length;

  const days = RANGES.find((r) => r.key === range)!.days;
  const sliced = useMemo(() => history.slice(Math.max(0, history.length - days)), [history, days]);

  // "vs last month": current total minus the balance ~30 days ago from the history.
  const monthAgo = history.length > 30 ? history[history.length - 31].balance : history[0]?.balance ?? total;
  const delta = total - monthAgo;
  const up = delta >= 0;

  const hasChart = sliced.length >= 2;

  return (
    <>
    <PanelHeader
      title="Accounts"
      action={
        <AddAccountButton
          onBankAdded={(bank) => setBanks((list) => [...list, { ...bank, balance: bank.startingBalance ?? 0 }])}
          onAssetAdded={(account) => setAssets((list) => [...list, account])}
        />
      }
    />
    <div className="px-4 pt-1 pb-8 space-y-6">
      {/* ── Total + delta ── */}
      <div>
        <p className="text-sm text-foreground/50 mb-1">
          Total · <span className="text-foreground/70 font-medium">{accountCount} account{accountCount === 1 ? "" : "s"}</span>
        </p>
        <p className="text-5xl font-semibold tabular-nums tracking-tight">{formatEurSignFirst(total)}</p>
        <div className="mt-2 flex items-center gap-2">
          <span className={cn("flex size-5 items-center justify-center rounded-full", up ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")}>
            {up ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
          </span>
          <span className={cn("text-sm font-medium", up ? "text-success" : "text-destructive")}>
            {up ? "+" : "−"}{formatEur(Math.abs(delta))}
          </span>
          <span className="text-sm text-foreground/45">vs last month</span>
        </div>
      </div>

      {/* ── Balance chart ── */}
      {hasChart && (
        <div className="-mx-1">
          <BalanceChart data={sliced} />
        </div>
      )}

      {/* ── Range selector ── */}
      <div className="flex gap-1 rounded-full bg-[#323137] p-1">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRange(r.key)}
            className={cn(
              "flex-1 rounded-full py-2 text-sm font-medium transition-colors",
              range === r.key ? "bg-white/20 text-foreground shadow-sm" : "text-foreground/50",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* ── Account groups ── */}
      {accountCount === 0 ? (
        <div className="rounded-2xl bg-[#2e2e30] py-16 text-center text-muted-foreground">
          <p className="text-sm">No accounts yet</p>
        </div>
      ) : (
        <div className="space-y-6">
          {banks.length > 0 && (
            <AccountGroup label="Bank" total={bankTotal}>
              {banks.map((b) => (
                <AccountCard
                  key={`bank-${b.id}`}
                  name={b.displayName ?? b.accountNumber ?? `Bank ${b.id}`}
                  subtitle={b.cardType ? CARD_TYPE_LABELS[b.cardType] ?? b.cardType : undefined}
                  amount={b.balance}
                  color={b.color ?? "#2f7bf6"}
                  icon={b.icon ? <Icon iconKey={b.icon} color={b.color ?? undefined} size="xl" round /> : <CreditCard className="size-6" />}
                  bareIcon={!!b.icon}
                  onClick={() => setEditingBank(b)}
                />
              ))}
            </AccountGroup>
          )}

          {assets.length > 0 && (
            <AccountGroup label="Assets" total={assetTotal}>
              {assets.map((a) => (
                <AccountCard
                  key={`asset-${a.id}`}
                  name={a.name}
                  subtitle={vermogenTypeLabel(a.type)}
                  amount={a.value}
                  color={a.color ?? "#0f9d8c"}
                  icon={<Coin className="size-6" />}
                  onClick={() => setEditingAsset(a)}
                />
              ))}
            </AccountGroup>
          )}
        </div>
      )}

      <BankEditDialog
        bank={editingBank}
        open={editingBank !== null}
        onOpenChange={(v) => !v && setEditingBank(null)}
        onSaved={(updated) => setBanks((list) => list.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)))}
        onDeleted={(id) => setBanks((list) => list.filter((x) => x.id !== id))}
      />
      <VermogenEditDialog
        account={editingAsset}
        open={editingAsset !== null}
        onOpenChange={(v) => !v && setEditingAsset(null)}
        onSaved={(updated) => setAssets((list) => list.map((x) => (x.id === updated.id ? updated : x)))}
        onDeleted={(id) => setAssets((list) => list.filter((x) => x.id !== id))}
      />
    </div>
    </>
  );
}

function AccountGroup({ label, total, children }: { label: string; total: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between px-1 mb-2.5">
        <h2 className="text-sm font-medium text-foreground/45">{label}</h2>
        <span className="text-sm font-medium text-foreground/45 tabular-nums">{formatEurSignFirst(total)}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function AccountCard({
  name,
  subtitle,
  amount,
  color,
  icon,
  bareIcon = false,
  onClick,
}: {
  name: string;
  subtitle?: string;
  amount: number;
  color: string;
  icon: React.ReactNode;
  /** When true, `icon` is a self-contained chip (e.g. <Icon />) rendered without the
   *  default colored square wrapper. */
  bareIcon?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-4 rounded-2xl bg-[#2e2e30] px-4 py-3.5 text-left active:scale-[0.99] transition-transform"
    >
      {bareIcon ? (
        <span className="size-12 shrink-0">{icon}</span>
      ) : (
        <span className="flex size-12 items-center justify-center rounded-2xl text-white shrink-0" style={{ backgroundColor: color }}>
          {icon}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-lg truncate leading-tight">{name}</p>
        {subtitle && <p className="text-sm text-foreground/50 truncate mt-0.5">{subtitle}</p>}
      </div>
      <span className="tabular-nums font-semibold text-lg shrink-0">{formatEurSignFirst(amount)}</span>
    </button>
  );
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function BalanceChart({ data }: { data: BalancePoint[] }) {
  const display = data.map((d) => ({ date: d.date, value: d.balance }));
  const tickInterval = Math.max(0, Math.ceil(display.length / 6) - 1);
  const negative = display[display.length - 1].value < 0;
  const color = negative ? "var(--destructive)" : "var(--success)";

  return (
    <ResponsiveContainer width="100%" height={150}>
      <AreaChart data={display} margin={{ top: 10, right: 6, bottom: 0, left: 6 }}>
        <defs>
          <linearGradient id="acctBalGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tickFormatter={(d) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { month: "short" })}
          tick={{ fontSize: 11, fill: "currentColor", opacity: 0.4 }}
          axisLine={false}
          tickLine={false}
          interval={tickInterval}
          minTickGap={20}
        />
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Tooltip
          cursor={{ stroke: "currentColor", strokeOpacity: 0.15, strokeWidth: 1 }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="rounded-xl bg-card-glass px-3 py-2 text-xs">
                <p className="text-foreground/60 mb-0.5">{fmtDate(String(payload[0].payload.date))}</p>
                <p className="font-bold tabular-nums">{formatEurSignFirst(Number(payload[0].value))}</p>
              </div>
            ) : null
          }
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2.5}
          fill="url(#acctBalGrad)"
          baseValue="dataMin"
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0, fill: color }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Header add-account button ───────────────────────────────────────────────
// Opens AddAccountDialog directly — the dialog's own "Type" picker decides bank
// vs. asset, so there's no more up-front chooser step.

export function AddAccountButton({
  onBankAdded,
  onAssetAdded,
}: {
  onBankAdded: (bank: Bank) => void;
  onAssetAdded: (account: VermogenAccount) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Add account"
        className="size-11 rounded-full bg-white/70 dark:bg-white/10 backdrop-blur-sm flex items-center justify-center active:scale-[0.97] transition-transform shrink-0"
      >
        <Plus className="size-5 text-foreground" />
      </button>

      <AddAccountDialog
        open={open}
        onOpenChange={setOpen}
        onBankAdded={onBankAdded}
        onAssetAdded={onAssetAdded}
      />
    </>
  );
}
