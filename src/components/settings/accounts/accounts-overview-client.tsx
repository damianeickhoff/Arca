"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { IconBuildingBank, IconPencil, IconPlus } from "@tabler/icons-react";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Amount } from "@/components/clear/amount";
import { DeltaChip } from "@/components/clear/chip";
import { ListRow } from "@/components/clear/list-row";
import { Segmented } from "@/components/clear/segmented";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { AnchoredTip } from "@/components/anchored-tip";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import {
  AccountGlyph,
  AssetFormDialog,
  BankFormDialog,
  DEFAULT_ASSET_COLOR,
  DEFAULT_BANK_COLOR,
  assetGlyph,
  useAccountTypeLabels,
} from "@/app/settings/account-edit-dialogs";
import type { Bank, VermogenAccount } from "@/db/schema";
import type { BankBalance, BalancePoint } from "@/lib/account-balances";
import { MoneyText } from "@/components/clear/money";

const RANGES = [
  { key: "1w", days: 7 },
  { key: "1m", days: 30 },
  { key: "3m", days: 90 },
  { key: "6m", days: 180 },
  { key: "1y", days: 365 },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

interface Props {
  banks: BankBalance[];
  assets: VermogenAccount[];
  history: BalancePoint[];
}

/**
 * The Accounts settings panel: the combined total and its history, then bank accounts
 * and other assets, each with its add button. A row opens its edit dialog. The old
 * /settings/accounts/{banks,vermogen}/add routes redirect here with ?add=bank|asset,
 * which opens the matching add dialog.
 */
export function AccountsOverviewClient({ banks: initialBanks, assets: initialAssets, history }: Props) {
  const t = useTranslations("accountForms");
  const tSettings = useTranslations("settings");
  const locale = useLocale();
  const labels = useAccountTypeLabels();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [banks, setBanks] = useState<BankBalance[]>(initialBanks);
  const [assets, setAssets] = useState<VermogenAccount[]>(initialAssets);
  const [range, setRange] = useState<RangeKey>("6m");

  // The local state above gives instant feedback on add/edit/delete, but a balance
  // correction changes a transaction-derived total only the server can recompute —
  // resync whenever router.refresh() lands new `banks`/`assets` props, so this panel
  // never keeps showing a pre-correction balance.
  useEffect(() => { setBanks(initialBanks); }, [initialBanks]);
  useEffect(() => { setAssets(initialAssets); }, [initialAssets]);

  const requestedAdd = searchParams.get("add");
  const [editingBank, setEditingBank] = useState<Bank | null>(null);
  const [editingAsset, setEditingAsset] = useState<VermogenAccount | null>(null);
  const [adding, setAdding] = useState<"bank" | "asset" | null>(
    requestedAdd === "bank" || requestedAdd === "asset" ? requestedAdd : null,
  );

  function closeAdd() {
    setAdding(null);
    // Drop ?add= so a reload doesn't open the dialog again.
    if (requestedAdd) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("add");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }

  const bankTotal = banks.reduce((s, b) => s + b.balance, 0);
  const assetTotal = assets.reduce((s, a) => s + a.value, 0);
  const total = bankTotal + assetTotal;
  const accountCount = banks.length + assets.length;

  const days = RANGES.find((r) => r.key === range)!.days;
  const sliced = useMemo(() => history.slice(Math.max(0, history.length - days)), [history, days]);

  // "vs last month": the current total minus the balance ~30 days ago in the history.
  const monthAgo = history.length > 30 ? history[history.length - 31].balance : history[0]?.balance ?? total;
  const delta = total - monthAgo;

  const updatedFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });

  return (
    <>
      <PanelHeader title={tSettings("panels.accounts.title")} />
      <div className="flex flex-col gap-7 px-4 pt-1 pb-8 font-clear text-clear-ink">
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

        {/* ── Bank accounts ── */}
        <AccountSection
          title={t("panel.banks")}
          count={banks.length}
          total={bankTotal}
          empty={t("panel.noBanks")}
          addLabel={t("panel.addBank")}
          onAdd={() => setAdding("bank")}
          addAnchor="accountsAdd"
        >
          {banks.map((b) => {
            const iban = b.accountNumber && !b.accountNumber.startsWith("CUSTOM-") ? `••${b.accountNumber.replace(/\s/g, "").slice(-4)}` : null;
            const name = b.displayName ?? b.accountNumber ?? t("panel.bankFallback", { id: b.id });
            return (
              <ListRow
                key={`bank-${b.id}`}
                onClick={() => setEditingBank(b)}
                icon={<AccountGlyph icon={b.icon} color={b.color ?? DEFAULT_BANK_COLOR} fallback={IconBuildingBank} />}
                title={name}
                meta={[b.cardType ? labels.bankType(b.cardType) : null, iban].filter(Boolean).join(" · ") || undefined}
                trailing={<RowTrailing value={b.balance} editLabel={t("panel.edit", { name })} />}
              />
            );
          })}
        </AccountSection>

        {/* ── Other assets ── */}
        <AccountSection
          title={t("panel.assets")}
          count={assets.length}
          total={assetTotal}
          empty={t("panel.noAssets")}
          addLabel={t("panel.addAsset")}
          onAdd={() => setAdding("asset")}
        >
          {assets.map((a) => (
            <ListRow
              key={`asset-${a.id}`}
              onClick={() => setEditingAsset(a)}
              icon={<AccountGlyph icon={a.icon} color={a.color ?? DEFAULT_ASSET_COLOR} fallback={assetGlyph(a.type)} />}
              title={a.name}
              meta={[
                labels.assetType(a.type),
                a.lastUpdated ? t("panel.updated", { date: updatedFmt.format(new Date(`${a.lastUpdated}T12:00:00`)) }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              trailing={<RowTrailing value={a.value} editLabel={t("panel.edit", { name: a.name })} />}
            />
          ))}
        </AccountSection>

        {/* The add buttons now open real dialogs with every field (IBAN, starting
            balance and date, transfer type; the asset kinds) — point them out once. */}
        <AnchoredTip id="accountsAdd" anchor="accountsAdd" />

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
          open={adding === "asset"}
          onOpenChange={(v) => !v && closeAdd()}
          onSaved={(account) => setAssets((list) => [...list, account])}
        />
      </div>
    </>
  );
}

function AccountSection({
  title,
  count,
  total,
  empty,
  addLabel,
  onAdd,
  addAnchor,
  children,
}: {
  title: string;
  count: number;
  total: number;
  empty: string;
  addLabel: string;
  onAdd: () => void;
  addAnchor?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex h-10 items-center justify-between gap-2 rounded-clear-icon bg-clear-tile px-3">
        <h3 className="m-0 text-[15px] font-bold">
          {title} <span className="font-semibold text-clear-muted">· {count}</span>
        </h3>
        <Amount value={total} splitCents={false} className="text-sm" />
      </div>
      {count === 0 ? (
        <div className="rounded-clear-tile border-2 border-dashed border-clear-line px-4 py-5 text-center text-[13px] text-clear-muted">{empty}</div>
      ) : (
        <div className="flex flex-col">{children}</div>
      )}
      <button
        type="button"
        onClick={onAdd}
        data-tip-anchor={addAnchor}
        className={cn(clearButtonVariants({ variant: "secondary" }), "mt-2 self-start")}
      >
        <IconPlus aria-hidden stroke={2.2} />
        {addLabel}
      </button>
    </section>
  );
}

function RowTrailing({ value, editLabel }: { value: number; editLabel: string }) {
  return (
    <>
      <Amount value={value} className="shrink-0 text-[17px]" />
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
