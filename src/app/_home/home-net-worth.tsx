import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { IconBuildingBank, IconReceipt, IconScale, IconTarget } from "@tabler/icons-react";
import { Amount } from "@/components/clear/amount";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { ClearCard, ClearCardHeader, ClearCardLink } from "@/components/clear/card";
import { ClearChip, DeltaChip } from "@/components/clear/chip";
import { formatEurWhole } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { NetWorthData } from "@/app/net-worth/load-net-worth";

/** Sign first with a real minus: "+€3.226", "−€864". */
function signed(v: number) {
  const r = Math.round(v);
  return `${r < 0 ? "−" : r > 0 ? "+" : ""}${formatEurWhole(Math.abs(r))}`;
}

/**
 * Home's Net worth card: today's figure, how it moved since the budget month started,
 * what you own against what you owe, the last six months as a line, and the three sums
 * behind it (accounts, savings goals, debts), each linking to its page. The figures are
 * the ones Insights › Net worth draws (load-net-worth.ts), so the two never disagree.
 */
export async function NetWorthCard({ data }: { data: NetWorthData }) {
  const t = await getTranslations("home.netWorth");
  const locale = await getLocale();

  if (data.empty) {
    return (
      <ClearCard aria-labelledby="home-net-worth-title" data-tip-anchor="homeNetWorth" className="justify-between gap-5">
        <ClearCardHeader title={<span id="home-net-worth-title">{t("title")}</span>} />
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <span aria-hidden className="flex h-16 w-16 items-center justify-center rounded-full bg-clear-tile text-clear-muted">
            <IconScale size={28} stroke={1.6} />
          </span>
          <p className="m-0 max-w-[26ch] text-[15px] text-clear-ink-2">{t("empty")}</p>
          <Link href="/settings?panel=accounts" className={clearButtonVariants({ size: "md" })}>
            {t("addAccount")}
          </Link>
        </div>
      </ClearCard>
    );
  }

  const monthChange = data.changes.total;
  const base = data.assets + data.debts;
  const monthLabel = (date: string) => new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(`${date}T12:00:00`));

  // The three sums under the chart: what sits on accounts (synced, entered by hand and
  // money owed to you), what is saved towards goals, and what is owed.
  const sum = (pick: (a: NetWorthData["accounts"][number]) => boolean) => data.accounts.filter(pick).reduce((s, a) => s + a.end, 0);
  const rows = [
    { key: "accounts", icon: IconBuildingBank, value: sum((a) => a.side === "asset" && a.type !== "goal"), href: "/reports?tab=vermogen" },
    { key: "goals", icon: IconTarget, value: sum((a) => a.type === "goal"), href: "/goals" },
    { key: "debts", icon: IconReceipt, value: -sum((a) => a.side === "debt"), href: "/debts" },
  ].filter((r) => r.value !== 0);

  // The line in percent of the plot, so it stretches to whatever height the card gets
  // (it shares a row with Money flow). Flat history draws a level line mid-plot.
  const net = data.stacked.net;
  const lo = Math.min(...net);
  const hi = Math.max(...net);
  const span = hi - lo || Math.max(1, Math.abs(hi));
  const pad = span * 0.12;
  const px = (i: number) => (net.length <= 1 ? 0 : (i / (net.length - 1)) * 100);
  const py = (v: number) => 100 - ((v - (lo - pad)) / (span + 2 * pad)) * 100;
  const points = net.map((v, i) => `${px(i)},${py(v)}`).join(" ");
  const lastX = px(net.length - 1);
  const lastY = py(net.at(-1) ?? 0);
  const description = t("chartDescription", { from: signed(net[0] ?? 0), to: signed(data.netWorth), months: 6 });

  return (
    <ClearCard aria-labelledby="home-net-worth-title" data-tip-anchor="homeNetWorth" className="gap-4">
      <ClearCardHeader
        title={<span id="home-net-worth-title">{t("title")}</span>}
        action={<ClearCardLink href="/reports?tab=vermogen">{t("open")}</ClearCardLink>}
      />

      <div className="flex flex-col gap-2.5">
        <Amount value={data.netWorth} whole className="text-[34px] leading-[1.05] tracking-[-0.02em]" />
        <div className="flex">
          {Math.abs(monthChange) < 0.5 ? (
            <ClearChip>{t("level")}</ClearChip>
          ) : (
            <DeltaChip direction={monthChange >= 0 ? "up" : "down"} good={monthChange >= 0}>
              {t("thisMonth", { amount: signed(monthChange) })}
            </DeltaChip>
          )}
        </div>
      </div>

      {base > 0 && (
        <div className="flex flex-col gap-1.5">
          <div role="img" aria-label={t("splitDescription", { assets: formatEurWhole(data.assets), debts: formatEurWhole(data.debts) })} className="flex h-2 gap-[3px]">
            {data.assets > 0 && <span className="rounded-full bg-clear-ink" style={{ width: `${(data.assets / base) * 100}%` }} />}
            {data.debts > 0 && <span className="clear-hatch min-w-0 flex-1 rounded-full" />}
          </div>
          <div className="flex justify-between gap-2 text-xs text-clear-ink-2">
            <span>{t("own")} <Amount value={data.assets} whole className="text-xs" /></span>
            <span>{t("owe")} <Amount value={data.debts} whole className="text-xs" /></span>
          </div>
        </div>
      )}

      <div role="img" aria-label={description} className="flex min-h-[72px] flex-1 flex-col gap-1.5">
        <div className="relative min-h-0 flex-1">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 h-full w-full overflow-visible">
            <polyline points={points} fill="none" stroke="var(--clr-ink)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <span aria-hidden className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-clear-ink" style={{ left: `${lastX}%`, top: `${lastY}%` }} />
        </div>
        <div className="flex justify-between text-xs text-clear-muted" aria-hidden>
          <span>{monthLabel(data.dates[0] ?? data.today)}</span>
          <span>{monthLabel(data.today)}</span>
        </div>
      </div>

      {rows.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map(({ key, icon: RowIcon, value, href }) => (
            <li key={key} className="border-t border-clear-line">
              <Link href={href} className="flex items-center gap-3 py-2.5 text-clear-ink no-underline">
                <RowIcon size={18} stroke={1.8} className="shrink-0 text-clear-ink-2" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{t(`rows.${key}`)}</span>
                <Amount value={value} whole className={cn("text-sm", value < 0 && "text-clear-ink-2")} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ClearCard>
  );
}
