"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { IconBuildingBank, IconHandFinger, IconPencil, IconPlus } from "@tabler/icons-react";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Amount } from "@/components/clear/amount";
import { DeltaChip } from "@/components/clear/chip";
import { ListRow } from "@/components/clear/list-row";
import { Segmented } from "@/components/clear/segmented";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AnchoredTip } from "@/components/anchored-tip";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import {
  AccountGlyph,
  AssetFormDialog,
  BankFormDialog,
  DEFAULT_ASSET_COLOR,
  DEFAULT_BANK_COLOR,
  assetGlyph,
  type AccountDraft,
} from "@/app/settings/account-edit-dialogs";
import type { Bank, VermogenAccount } from "@/db/schema";
import type { BankBalance, BalancePoint } from "@/lib/account-balances";
import type { OverdraftMode } from "@/lib/app-settings";
import type { AccountSuggestion } from "@/lib/account-suggestions";
import { hasNoBalance } from "@/lib/account-names";
import { MoneyText } from "@/components/clear/money";
import { OverdraftModeSwitch } from "@/components/settings/accounts/overdraft-mode-switch";
import { AccountSuggestions } from "@/components/settings/accounts/account-suggestions";

const RANGES = [
  { key: "1w", days: 7 },
  { key: "1m", days: 30 },
  { key: "3m", days: 90 },
  { key: "6m", days: 180 },
  { key: "1y", days: 365 },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

// The groups the one account list is split into, in this order. An account's group
// follows from its type, whether it is imported or kept by hand.
const GROUPS = ["checking", "savings", "investments", "joint", "creditcard", "cash", "possessions"] as const;
type Group = (typeof GROUPS)[number];

function bankGroup(b: Bank): Group {
  if (b.cardType === "savings") return b.transferKind === "investments" ? "investments" : "savings";
  if (b.cardType === "creditcard") return "creditcard";
  if (b.cardType === "cash") return "cash";
  return b.transferKind === "shared_account" ? "joint" : "checking";
}

const HAND_KEPT_GROUP: Record<string, Group> = {
  spaarrekening: "savings",
  beleggingen: "investments",
  betaalrekening: "checking",
  gezamenlijk: "joint",
  bezitting: "possessions",
};

type Row = { key: string; group: Group; balance: number } & ({ kind: "bank"; bank: BankBalance } | { kind: "handKept"; account: VermogenAccount });

interface Props {
  banks: BankBalance[];
  assets: VermogenAccount[];
  history: BalancePoint[];
  overdraftMode: OverdraftMode;
  suggestions: AccountSuggestion[];
}

/**
 * The Accounts settings panel: the combined total and its history, then every account
 * in one list grouped by type (checking, savings, investments, joint, credit cards, cash,
 * possessions). Imported accounts and accounts kept by hand sit side by side; the row
 * says where the balance comes from. "Add account" asks which of the two it is. Below,
 * accounts found in the transactions. The old /settings/accounts/{banks,vermogen}/add
 * routes redirect here with ?add=bank|asset, which opens the matching add dialog.
 */
export function AccountsOverviewClient({ banks: initialBanks, assets: initialAssets, history, overdraftMode, suggestions }: Props) {
  const t = useTranslations("accountForms");
  const tSettings = useTranslations("settings");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [banks, setBanks] = useState<BankBalance[]>(initialBanks);
  const [assets, setAssets] = useState<VermogenAccount[]>(initialAssets);
  const [range, setRange] = useState<RangeKey>("6m");

  // The local state above gives instant feedback on add/edit/delete, but a balance
  // correction changes a transaction-derived total only the server can recompute —
  // take over whatever router.refresh() lands, so this panel never keeps showing a
  // pre-correction balance.
  const [synced, setSynced] = useState({ initialBanks, initialAssets });
  if (synced.initialBanks !== initialBanks || synced.initialAssets !== initialAssets) {
    setSynced({ initialBanks, initialAssets });
    setBanks(initialBanks);
    setAssets(initialAssets);
  }

  const requestedAdd = searchParams.get("add");
  const [editingBank, setEditingBank] = useState<Bank | null>(null);
  const [editingAsset, setEditingAsset] = useState<VermogenAccount | null>(null);
  const [adding, setAdding] = useState<"bank" | "asset" | null>(
    requestedAdd === "bank" || requestedAdd === "asset" ? requestedAdd : null,
  );
  // A hand-kept account to add, filled in from a suggestion.
  const [draft, setDraft] = useState<AccountDraft | null>(null);

  function closeAdd() {
    setAdding(null);
    setDraft(null);
    // Drop ?add= so a reload doesn't open the dialog again.
    if (requestedAdd) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("add");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }

  const total = banks.reduce((s, b) => s + b.balance, 0) + assets.reduce((s, a) => s + a.value, 0);
  const accountCount = banks.length + assets.length;

  const days = RANGES.find((r) => r.key === range)!.days;
  const sliced = useMemo(() => history.slice(Math.max(0, history.length - days)), [history, days]);

  // "vs last month": the current total minus the balance ~30 days ago in the history.
  const monthAgo = history.length > 30 ? history[history.length - 31].balance : history[0]?.balance ?? total;
  const delta = total - monthAgo;

  const updatedFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const hasOverdraft = banks.some((b) => (b.overdraftLimit ?? 0) > 0);

  const rows: Row[] = [
    ...banks.map((b) => ({ key: `bank-${b.id}`, group: bankGroup(b), balance: b.balance, kind: "bank" as const, bank: b })),
    ...assets.map((a) => ({ key: `asset-${a.id}`, group: HAND_KEPT_GROUP[a.type] ?? "possessions", balance: a.value, kind: "handKept" as const, account: a })),
  ];
  const groups = GROUPS.map((g) => ({ group: g, rows: rows.filter((r) => r.group === g) })).filter((g) => g.rows.length > 0);

  // How much of its overdraft an account uses, for its row: past the limit, the part
  // used, or just the limit while it's above zero.
  function overdraftMeta(b: BankBalance): string | null {
    const limit = b.overdraftLimit ?? 0;
    if (limit <= 0) return null;
    if (b.balance < -limit) return t("panel.overdraftPast", { amount: formatEur(-limit - b.balance) });
    if (b.balance < 0) return t("panel.overdraftUsed", { used: formatEur(-b.balance), limit: formatEur(limit) });
    return t("panel.overdraftMeta", { amount: formatEur(limit) });
  }

  const tail = (number: string | null) => (number && !number.startsWith("CUSTOM-") ? `••${number.replace(/\s/g, "").slice(-4)}` : null);

  function renderRow(r: Row) {
    if (r.kind === "bank") {
      const b = r.bank;
      const name = b.displayName ?? b.accountNumber ?? t("panel.bankFallback", { id: b.id });
      const imported = !!b.accountNumber && !b.accountNumber.startsWith("CUSTOM-");
      return (
        <ListRow
          key={r.key}
          onClick={() => setEditingBank(b)}
          icon={<AccountGlyph icon={b.icon} color={b.color ?? DEFAULT_BANK_COLOR} fallback={IconBuildingBank} />}
          title={name}
          meta={[tail(b.accountNumber), imported ? t("panel.imported") : t("panel.fromTransactions"), overdraftMeta(b)].filter(Boolean).join(" · ")}
          trailing={<RowTrailing value={b.balance} editLabel={t("panel.edit", { name })} />}
        />
      );
    }
    const a = r.account;
    const empty = hasNoBalance(a);
    return (
      <ListRow
        key={r.key}
        onClick={() => setEditingAsset(a)}
        icon={<AccountGlyph icon={a.icon} color={a.color ?? DEFAULT_ASSET_COLOR} fallback={assetGlyph(a.type)} />}
        title={a.name}
        meta={[
          tail(a.accountNumber),
          empty
            ? t("panel.noBalance")
            : a.lastUpdated
              ? t("panel.updated", { date: updatedFmt.format(new Date(`${a.lastUpdated}T12:00:00`)) })
              : t("panel.keptByHand"),
        ]
          .filter(Boolean)
          .join(" · ")}
        trailing={<RowTrailing value={empty ? null : a.value} editLabel={t("panel.edit", { name: a.name })} />}
      />
    );
  }

  return (
    <>
      <PanelHeader title={tSettings("panels.accounts.title")} />
      <div className="flex flex-col gap-7 px-4 pt-1 font-clear text-clear-ink">
        {/* ── Total + delta ── */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-clear-ink-2">
            {t("panel.total")} · {t("panel.accountCount", { count: accountCount })}
          </span>
          <Amount value={total} className="text-[40px] leading-none tracking-[-0.03em]" />
          <div className="mt-1 flex items-center gap-2">
            <DeltaChip direction={delta >= 0 ? "up" : "down"} good={delta >= 0}>
              {delta >= 0 ? "+" : "−"}
              <MoneyText>{formatEur(Math.abs(delta))}</MoneyText>
            </DeltaChip>
            <span className="text-[13px] text-clear-muted">{t("panel.vsLastMonth")}</span>
          </div>
        </div>

        {history.length >= 2 && (
          <div className="flex flex-col gap-3">
            {sliced.length >= 2 && <BalanceChart data={sliced} locale={locale} />}
            <Segmented
              label={t("panel.range")}
              surface="tile"
              size="sm"
              value={range}
              onChange={setRange}
              className="w-full [&>button]:flex-1"
              items={RANGES.map((r) => ({ value: r.key, label: t(`panel.ranges.${r.key}`) }))}
            />
          </div>
        )}

        {/* ── Every account, grouped by type ── */}
        <div data-tip-anchor="accountsBanks" className="flex flex-col gap-5">
          {groups.length === 0 ? (
            <div className="rounded-clear-tile border-2 border-dashed border-clear-line px-4 py-5 text-center text-[13px] text-clear-muted">{t("panel.noAccounts")}</div>
          ) : (
            groups.map(({ group, rows: list }) => (
              <section key={group} className="flex flex-col gap-1.5">
                <div className="flex h-10 items-center justify-between gap-2 rounded-clear-icon bg-clear-tile px-3">
                  <h3 className="m-0 text-[15px] font-bold">
                    {t(`panel.groups.${group}`)} <span className="font-semibold text-clear-muted">· {list.length}</span>
                  </h3>
                  <Amount value={list.reduce((s, r) => s + r.balance, 0)} splitCents={false} className="text-sm" />
                </div>
                <div className="flex flex-col">{list.map(renderRow)}</div>
              </section>
            ))
          )}

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger data-tip-anchor="accountsAdd" className={cn(clearButtonVariants({ variant: "secondary" }), "self-start")}>
              <IconPlus aria-hidden stroke={2.2} />
              {t("panel.addAccount")}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[min(340px,calc(100vw-32px))] font-clear">
              <AddChoice icon={<IconBuildingBank aria-hidden size={20} stroke={2} />} title={t("panel.addImported")} hint={t("panel.addImportedHint")} onClick={() => setAdding("bank")} />
              <AddChoice icon={<IconHandFinger aria-hidden size={20} stroke={2} />} title={t("panel.addHandKept")} hint={t("panel.addHandKeptHint")} onClick={() => setAdding("asset")} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Only once an account can go into the red is there anything to decide. */}
        {hasOverdraft && <OverdraftModeSwitch initialMode={overdraftMode} />}

        <AccountSuggestions
          suggestions={suggestions}
          onAdd={(d) => {
            setDraft(d);
            setAdding("asset");
          }}
        />

        {/* "Add account" opens real dialogs with every field (IBAN, starting balance and
            date, transfer type; the hand-kept kinds) — point it out once. */}
        <AnchoredTip id="accountsAdd" anchor="accountsAdd" />
        {/* Overdraft limits are set inside a bank account's dialog — point at the list. */}
        <AnchoredTip id="accountsOverdraft" anchor="accountsBanks" active={banks.length > 0} />

        <BankFormDialog
          bank={editingBank}
          open={editingBank !== null}
          onOpenChange={(v) => !v && setEditingBank(null)}
          onSaved={(updated) => setBanks((list) => list.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)))}
          onDeleted={(id) => setBanks((list) => list.filter((x) => x.id !== id))}
        />
        <BankFormDialog
          bank={null}
          open={adding === "bank"}
          onOpenChange={(v) => !v && closeAdd()}
          onSaved={(bank) => setBanks((list) => [...list, { ...bank, balance: bank.startingBalance ?? 0 }])}
        />
        <AssetFormDialog
          account={editingAsset}
          open={editingAsset !== null}
          onOpenChange={(v) => !v && setEditingAsset(null)}
          onSaved={(updated) => setAssets((list) => list.map((x) => (x.id === updated.id ? updated : x)))}
          onDeleted={(id) => setAssets((list) => list.filter((x) => x.id !== id))}
        />
        <AssetFormDialog
          account={null}
          draft={draft}
          open={adding === "asset"}
          onOpenChange={(v) => !v && closeAdd()}
          onSaved={(account) => setAssets((list) => [...list, account])}
        />
      </div>
    </>
  );
}

function AddChoice({ icon, title, hint, onClick }: { icon: React.ReactNode; title: string; hint: string; onClick: () => void }) {
  return (
    <DropdownMenuItem onClick={onClick} className="items-start gap-3 py-2.5">
      <span className="mt-0.5 shrink-0 text-clear-ink">{icon}</span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-bold text-clear-ink">{title}</span>
        <span className="text-[13px] leading-[1.4] whitespace-normal text-clear-muted">{hint}</span>
      </span>
    </DropdownMenuItem>
  );
}

function RowTrailing({ value, editLabel }: { value: number | null; editLabel: string }) {
  return (
    <>
      {value != null && <Amount value={value} className="shrink-0 text-[17px]" />}
      <span aria-hidden title={editLabel} className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-clear-tile text-clear-ink">
        <IconPencil size={18} stroke={2} />
      </span>
    </>
  );
}

function BalanceChart({ data, locale }: { data: BalancePoint[]; locale: string }) {
  const display = data.map((d) => ({ date: d.date, value: d.balance }));
  const tickInterval = Math.max(0, Math.ceil(display.length / 6) - 1);
  const negative = display[display.length - 1].value < 0;
  const color = negative ? "var(--clr-negative-fill)" : "var(--clr-positive-fill)";
  const monthFmt = new Intl.DateTimeFormat(locale, { month: "short" });
  const dayFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });

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
          tickFormatter={(d) => monthFmt.format(new Date(`${d}T00:00:00`))}
          tick={{ fontSize: 12, fill: "var(--clr-muted)" }}
          axisLine={false}
          tickLine={false}
          interval={tickInterval}
          minTickGap={20}
        />
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Tooltip
          cursor={{ stroke: "var(--clr-line)", strokeWidth: 1 }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="rounded-clear-row bg-clear-card px-3 py-2 font-clear text-[13px] text-clear-ink shadow-clear-dialog">
                <p className="m-0 mb-0.5 text-clear-muted">{dayFmt.format(new Date(`${String(payload[0].payload.date)}T00:00:00`))}</p>
                <Amount value={Number(payload[0].value)} className="text-sm" />
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
