"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import {
  IconArrowDownLeft,
  IconArrowUpRight,
  IconCash,
  IconChartBar,
  IconChevronRight,
  IconCompass,
  IconCreditCard,
  IconFileUpload,
  IconPlus,
  IconReload,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { Amount } from "@/components/clear/amount";
import { IconTile } from "@/components/clear/icon-tile";
import { ContextualTip } from "@/components/contextual-tip";
import { BrandIcon } from "@/components/brand-icon";
import { Icon } from "@/components/icon";
import { BRAND_MAP } from "@/lib/brand-map";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { cn } from "@/lib/utils";

interface SearchResult {
  transactions: { id: number; description: string; amount: number; date: string; direction: string }[];
  recurring: { id: number; name: string; amount: number | null; type: string }[];
  debts: { id: number; name: string; startingBalance: number }[];
  categories: { id: number; name: string; group: string; color: string | null }[];
}

interface Overview {
  categories: { id: number; name: string; icon: string | null; color: string | null; count: number }[];
  accounts: { accountNumber: string; displayName: string | null; cardType: string | null; balance: number | null; lastAt: string | null; lastDate: string | null }[];
  brands: { iconKey: string | null; count: number }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** The button it was opened from; on phones the panel grows out of it. */
  originRect?: DOMRect | null;
}

/** Shortcuts shown with the results — and on their own before anything is typed. */
const ACTIONS = [
  { key: "addTransaction", href: "/transactions/add", Glyph: IconPlus, hint: false },
  { key: "importCsv", href: "/import", Glyph: IconFileUpload, hint: false },
  { key: "budget", href: "/budget", Glyph: IconCompass, hint: true },
  { key: "insights", href: "/reports", Glyph: IconChartBar, hint: true },
] as const;

interface ActionItem {
  key: string;
  href: string;
  Glyph: (typeof ACTIONS)[number]["Glyph"];
  label: string;
  hint?: string;
}

/** The props every openable row or tile gets (see itemProps). */
interface ItemProps {
  id: string;
  role: "option";
  "aria-selected": boolean;
  tabIndex: number;
  type: "button";
  onClick: () => void;
  onMouseMove: () => void;
}

// Relative "time ago" for the accounts list. createdAt is stored as a UTC
// `datetime('now')` string ("YYYY-MM-DD HH:MM:SS").
function timeAgo(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const then = new Date(iso.replace(" ", "T") + "Z").getTime();
  if (Number.isNaN(then)) return null;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return rtf.format(0, "second");
  const mins = Math.round(secs / 60);
  if (mins < 60) return rtf.format(-mins, "minute");
  const hours = Math.round(mins / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 30) return rtf.format(-days, "day");
  return rtf.format(-Math.round(days / 30), "month");
}

function brandTitle(iconKey: string | null, fallback: string): string {
  if (!iconKey || iconKey.startsWith("img:") || iconKey.startsWith("custom:")) return fallback;
  const base = iconKey.includes("?") ? iconKey.slice(0, iconKey.indexOf("?")) : iconKey;
  return BRAND_MAP[base]?.title ?? base;
}

/** The query's first match in `text`, marked like the mockup. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-[4px] bg-clear-butter px-px text-inherit">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

function Kbd({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <kbd
      aria-label={label}
      className="inline-flex h-6 min-w-[26px] shrink-0 items-center justify-center rounded-full border border-clear-line bg-clear-card px-2 font-clear text-xs font-bold text-clear-ink-2"
    >
      {children}
    </kbd>
  );
}

/** One thing Enter can open, in the order the arrow keys walk through them. */
interface Item {
  id: string;
  href: string;
}

/**
 * The global search (Popup-Search), opened from the sidebar field, the phone tab bar
 * button or Ctrl/Cmd+K: a centred panel near the top of the screen on desktop, the full
 * screen on phones. Before anything is typed it shows quick actions and your categories,
 * accounts and brands; typing searches transactions, categories, fixed costs and debts.
 * ↑/↓ move through everything listed, Enter opens it, Escape closes.
 */
export function GlobalSearchOverlay({ open, onClose, originRect }: Props) {
  const t = useTranslations("globalSearch");
  const locale = useLocale();
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const uid = useId();
  const titleId = `${uid}-title`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);

  // Load the default overview (categories/accounts/brands) the first time the
  // overlay opens each session.
  useEffect(() => {
    if (!open || overview) return;
    let cancelled = false;
    fetch("/api/search/overview")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, overview]);

  const doSearch = useCallback(async (q: string) => {
    const request = ++requestRef.current;
    if (q.trim().length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      // A slower, older request never overwrites a newer one.
      if (request === requestRef.current) setResults(data);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    setActiveId(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(q), 300);
  }

  function reset() {
    if (timerRef.current) clearTimeout(timerRef.current);
    requestRef.current++;
    setQuery("");
    setResults(null);
    setLoading(false);
    setActiveId(null);
  }

  function navigate(path: string) {
    onClose();
    router.push(path);
  }

  const q = query.trim().toLowerCase();
  const actions: ActionItem[] = ACTIONS.map((a) => ({
    key: a.key,
    href: a.href,
    Glyph: a.Glyph,
    label: t(`actions.${a.key}`),
    hint: a.hint ? t(`actionHints.${a.key as "budget" | "insights"}`) : undefined,
  })).filter((a) => !q || a.label.toLowerCase().includes(q));
  const searching = query.trim().length > 0;
  const found = results ?? { transactions: [], recurring: [], debts: [], categories: [] };

  // Every openable thing in visual order.
  const items: Item[] = searching
    ? [
        ...found.transactions.map((x) => ({ id: `tx-${x.id}`, href: `/transactions?tx=${x.id}` })),
        ...found.categories.map((x) => ({ id: `cat-${x.id}`, href: "/settings?panel=categories" })),
        ...found.recurring.map((x) => ({ id: `rec-${x.id}`, href: "/settings?panel=recurring" })),
        ...found.debts.map((x) => ({ id: `debt-${x.id}`, href: "/debts" })),
        ...actions.map((a) => ({ id: `act-${a.key}`, href: a.href })),
      ]
    : [
        ...actions.map((a) => ({ id: `act-${a.key}`, href: a.href })),
        ...(overview?.categories ?? []).map((c) => ({ id: `ocat-${c.id}`, href: `/transactions?category=${c.id}` })),
        ...(overview?.accounts ?? []).map((a) => ({ id: `acc-${a.accountNumber}`, href: `/transactions?account=${encodeURIComponent(a.accountNumber)}` })),
        ...(overview?.brands ?? []).map((b, i) => ({
          id: `brand-${i}`,
          href: `/transactions?search=${encodeURIComponent(brandTitle(b.iconKey, t("brand")))}`,
        })),
      ];

  // The highlighted item: where the arrows went, else the first result while searching.
  const active = (activeId && items.some((i) => i.id === activeId) ? activeId : null) ?? (searching && results ? (items[0]?.id ?? null) : null);
  const domId = (id: string) => `${uid}-${id}`;
  const matchCount = found.transactions.length + found.categories.length + found.recurring.length + found.debts.length + (searching ? actions.length : 0);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (items.length === 0) return;
      e.preventDefault();
      const index = active ? items.findIndex((i) => i.id === active) : -1;
      const next = e.key === "ArrowDown" ? Math.min(items.length - 1, index + 1) : Math.max(0, index - 1);
      const id = items[next].id;
      setActiveId(id);
      document.getElementById(domId(id))?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && e.target === inputRef.current && active) {
      e.preventDefault();
      const item = items.find((i) => i.id === active);
      if (item) navigate(item.href);
    }
  }

  // Shared props for every openable row / tile.
  const itemProps = (id: string, href: string): ItemProps => ({
    id: domId(id),
    role: "option",
    "aria-selected": active === id,
    tabIndex: -1,
    type: "button",
    onClick: () => navigate(href),
    onMouseMove: () => {
      if (active !== id) setActiveId(id);
    },
  });

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const origin = !isDesktop && originRect ? `${originRect.left + originRect.width / 2}px ${originRect.top + originRect.height / 2}px` : undefined;

  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(next, details) => {
        if (next) return;
        // A tip card on top of the panel doesn't count as a tap outside.
        const target = details.event?.target;
        if (details.reason === "outside-press" && target instanceof Element && target.closest("[data-dialog-keep-open]")) {
          details.cancel();
          return;
        }
        onClose();
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) reset();
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-[80] bg-black/40 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <BaseDialog.Viewport className="fixed inset-0 z-[80] flex justify-center lg:items-start lg:px-6 lg:pt-[10vh] lg:pb-6">
          <BaseDialog.Popup
            initialFocus={inputRef}
            aria-labelledby={titleId}
            style={origin ? { transformOrigin: origin } : undefined}
            className={cn(
              "flex h-full w-full flex-col gap-4 bg-clear-card px-4 pt-[calc(var(--sat)+16px)] pb-[calc(16px+env(safe-area-inset-bottom))] font-clear text-clear-ink outline-none",
              "lg:h-auto lg:max-h-full lg:max-w-[680px] lg:rounded-clear-dialog lg:p-7 lg:shadow-clear-dialog",
              "transition-[opacity,scale] duration-200 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none",
            )}
          >
            <div className="flex items-center gap-4">
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
                <BaseDialog.Title id={titleId} className="m-0 text-[22px] font-extrabold tracking-[-0.02em]">
                  {t("title")}
                </BaseDialog.Title>
                <span className="hidden items-center gap-1.5 text-sm text-clear-muted lg:inline-flex">
                  {t("openAnywhere")}
                  <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
                  <Kbd>K</Kbd>
                </span>
              </div>
              <BaseDialog.Close
                aria-label={t("close")}
                className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-clear-ground text-clear-ink transition-colors hover:bg-clear-line"
              >
                <IconX size={20} stroke={2} aria-hidden />
              </BaseDialog.Close>
            </div>

            <label className="flex h-14 shrink-0 cursor-text items-center gap-3 rounded-clear-row border-2 border-transparent bg-clear-tile pr-3 pl-4 text-clear-muted transition-colors focus-within:border-clear-ember">
              <IconSearch className="size-5 shrink-0" stroke={2} />
              <span className="sr-only">{t("label")}</span>
              <input
                ref={inputRef}
                type="search"
                role="combobox"
                aria-expanded
                aria-controls={`${uid}-results`}
                aria-activedescendant={active ? domId(active) : undefined}
                autoComplete="off"
                value={query}
                onChange={onInput}
                onKeyDown={onKeyDown}
                placeholder={t("placeholder")}
                className="h-full min-w-0 flex-1 bg-transparent text-lg font-semibold text-clear-ink outline-none placeholder:font-medium placeholder:text-clear-placeholder [&::-webkit-search-cancel-button]:hidden"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    reset();
                    inputRef.current?.focus();
                  }}
                  aria-label={t("clear")}
                  className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-clear-card text-clear-ink-2"
                >
                  <IconX className="size-4" />
                </button>
              ) : (
                <span className="hidden lg:inline-flex">
                  <Kbd>Esc</Kbd>
                </span>
              )}
            </label>

            {/* Quick actions are new here; they (and the arrow keys) announce themselves once. */}
            <ContextualTip id="searchActions" active={open} />

            <div
              id={`${uid}-results`}
              role="listbox"
              aria-label={t("results")}
              className="clear-scrollbar -mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 lg:max-h-[min(560px,60vh)] lg:flex-none"
            >
              {searching ? (
                <>
                  {query.trim().length < 2 ? null : loading && !results ? (
                    <p className="m-0 py-8 text-center text-sm text-clear-muted">{t("searching")}</p>
                  ) : results && matchCount === 0 ? (
                    <p className="m-0 py-8 text-center text-sm text-clear-muted">{t("noResults", { query: query.trim() })}</p>
                  ) : null}

                  {found.transactions.length > 0 && (
                    <Group label={t("groups.transactions")}>
                      {found.transactions.map((x) => {
                        const value = x.direction === "expense" ? -Math.abs(x.amount) : Math.abs(x.amount);
                        const id = `tx-${x.id}`;
                        return (
                          <ResultRow
                            key={id}
                            {...itemProps(id, `/transactions?tx=${x.id}`)}
                            active={active === id}
                            showEnter={isDesktop}
                            icon={
                              <IconTile tone={value < 0 ? "peach" : "mint"} size="md" className="size-10">
                                {value < 0 ? <IconArrowUpRight /> : <IconArrowDownLeft />}
                              </IconTile>
                            }
                            primary={<Highlight text={x.description} query={query} />}
                            secondary={new Date(`${x.date}T00:00:00`).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                            value={<Amount value={value} sign="always" className={cn("text-[15px]", value > 0 && "text-clear-positive")} />}
                          />
                        );
                      })}
                    </Group>
                  )}
                  {found.categories.length > 0 && (
                    <Group label={t("groups.categories")}>
                      {found.categories.map((x) => {
                        const id = `cat-${x.id}`;
                        return (
                          <ResultRow
                            key={id}
                            {...itemProps(id, "/settings?panel=categories")}
                            active={active === id}
                            showEnter={isDesktop}
                            icon={<Icon soft color={x.color} initials={x.name.slice(0, 1).toUpperCase()} size="md" />}
                            primary={<Highlight text={x.name} query={query} />}
                            secondary={t("openInSettings")}
                          />
                        );
                      })}
                    </Group>
                  )}
                  {found.recurring.length > 0 && (
                    <Group label={t("groups.recurring")}>
                      {found.recurring.map((x) => {
                        const id = `rec-${x.id}`;
                        return (
                          <ResultRow
                            key={id}
                            {...itemProps(id, "/settings?panel=recurring")}
                            active={active === id}
                            showEnter={isDesktop}
                            icon={
                              <IconTile tone="sky" size="md" className="size-10">
                                <IconReload />
                              </IconTile>
                            }
                            primary={<Highlight text={x.name} query={query} />}
                            value={x.amount != null ? <Amount value={x.amount} className="text-[15px]" /> : undefined}
                          />
                        );
                      })}
                    </Group>
                  )}
                  {found.debts.length > 0 && (
                    <Group label={t("groups.debts")}>
                      {found.debts.map((x) => {
                        const id = `debt-${x.id}`;
                        return (
                          <ResultRow
                            key={id}
                            {...itemProps(id, "/debts")}
                            active={active === id}
                            showEnter={isDesktop}
                            icon={
                              <IconTile tone="lilac" size="md" className="size-10">
                                <IconCreditCard />
                              </IconTile>
                            }
                            primary={<Highlight text={x.name} query={query} />}
                            value={<Amount value={x.startingBalance} className="text-[15px]" />}
                          />
                        );
                      })}
                    </Group>
                  )}
                  {actions.length > 0 && <ActionGrid label={t("groups.actions")} actions={actions} itemProps={itemProps} active={active} />}
                </>
              ) : (
                <>
                  <ActionGrid label={t("groups.actions")} actions={actions} itemProps={itemProps} active={active} />

                  {overview && overview.categories.length > 0 && (
                    <Group label={t("groups.categories")} more={{ label: t("allCategories"), onClick: () => navigate("/settings?panel=categories") }}>
                      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                        {overview.categories.map((c) => {
                          const id = `ocat-${c.id}`;
                          return (
                            <button
                              key={id}
                              {...itemProps(id, `/transactions?category=${c.id}`)}
                              className={cn(
                                "flex cursor-pointer flex-col gap-3 rounded-clear-tile p-3.5 text-left transition-colors",
                                active === id ? "bg-clear-line" : "bg-clear-tile hover:bg-clear-line",
                              )}
                            >
                              <Icon iconKey={c.icon} color={c.color} soft size="md" />
                              <span className="flex min-w-0 flex-col gap-0.5">
                                <span className="truncate text-[15px] font-bold">{c.name}</span>
                                <span className="text-xs text-clear-muted">{t("last30Days", { count: c.count })}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </Group>
                  )}

                  {overview && overview.accounts.length > 0 && (
                    <Group label={t("groups.accounts")} more={{ label: t("allAccounts"), onClick: () => navigate("/settings?panel=accounts") }}>
                      {overview.accounts.map((a) => {
                        const id = `acc-${a.accountNumber}`;
                        const ago = timeAgo(a.lastAt, locale);
                        return (
                          <ResultRow
                            key={id}
                            {...itemProps(id, `/transactions?account=${encodeURIComponent(a.accountNumber)}`)}
                            active={active === id}
                            showEnter={isDesktop}
                            icon={<AccountGlyph name={a.displayName} />}
                            primary={a.displayName ?? a.accountNumber}
                            secondary={ago ? t("lastTransaction", { ago }) : undefined}
                            value={<Amount value={a.balance ?? 0} className="text-[15px]" />}
                          />
                        );
                      })}
                    </Group>
                  )}

                  {overview && overview.brands.length > 0 && (
                    <Group label={t("groups.brands")} more={{ label: t("allActivity"), onClick: () => navigate("/transactions") }}>
                      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                        {overview.brands.map((b, i) => {
                          const id = `brand-${i}`;
                          const name = brandTitle(b.iconKey, t("brand"));
                          return (
                            <button
                              key={id}
                              {...itemProps(id, `/transactions?search=${encodeURIComponent(name)}`)}
                              className={cn(
                                "flex cursor-pointer flex-col gap-3 rounded-clear-tile p-3.5 text-left transition-colors",
                                active === id ? "bg-clear-line" : "bg-clear-tile hover:bg-clear-line",
                              )}
                            >
                              <BrandIcon iconKey={b.iconKey} size="lg" />
                              <span className="flex min-w-0 flex-col gap-0.5">
                                <span className="truncate text-[15px] font-bold">{name}</span>
                                <span className="text-xs text-clear-muted">{t("last30Days", { count: b.count })}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </Group>
                  )}
                </>
              )}
            </div>

            <div className="hidden flex-wrap items-center justify-between gap-3 border-t border-clear-ground pt-3.5 text-[13px] text-clear-ink-2 lg:flex">
              <span className="inline-flex flex-wrap items-center gap-2">
                <Kbd label={t("keys.up")}>↑</Kbd>
                <Kbd label={t("keys.down")}>↓</Kbd>
                <span>{t("keys.move")}</span>
                <span aria-hidden className="text-clear-placeholder">·</span>
                <Kbd>Enter</Kbd>
                <span>{t("keys.open")}</span>
                <span aria-hidden className="text-clear-placeholder">·</span>
                <Kbd>Esc</Kbd>
                <span>{t("keys.close")}</span>
              </span>
              {searching && results && (
                <span className="text-clear-muted">{t("matches", { count: matchCount, query: query.trim() })}</span>
              )}
            </div>
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

function Group({ label, more, children }: { label: string; more?: { label: string; onClick: () => void }; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 px-3">
        <h3 className="m-0 text-[13px] font-bold text-clear-muted">{label}</h3>
        {more && (
          <button type="button" onClick={more.onClick} className="inline-flex cursor-pointer items-center gap-0.5 rounded-full py-1 pr-1 pl-2.5 text-[13px] font-bold text-clear-ink hover:bg-clear-tile">
            {more.label}
            <IconChevronRight className="size-4" />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function ActionGrid({
  label,
  actions,
  itemProps,
  active,
}: {
  label: string;
  actions: ActionItem[];
  itemProps: (id: string, href: string) => ItemProps;
  active: string | null;
}) {
  if (actions.length === 0) return null;
  return (
    <Group label={label}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {actions.map(({ key, href, Glyph, label: actionLabel, hint }) => {
          const id = `act-${key}`;
          return (
            <button
              key={id}
              {...itemProps(id, href)}
              className={cn(
                "flex h-12 cursor-pointer items-center gap-3 rounded-clear-row border border-clear-ground pr-3 pl-1.5 text-left text-[15px] font-bold transition-colors",
                active === id ? "bg-clear-tile" : "hover:bg-clear-tile",
              )}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-clear-ground">
                <Glyph className="size-[18px]" stroke={2} />
              </span>
              <span className="min-w-0 flex-1 truncate">{actionLabel}</span>
              {hint && <span className="text-[13px] font-semibold text-clear-muted">{hint}</span>}
            </button>
          );
        })}
      </div>
    </Group>
  );
}

function ResultRow({
  icon,
  primary,
  secondary,
  value,
  active,
  showEnter,
  ...button
}: ItemProps & {
  icon: React.ReactNode;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  value?: React.ReactNode;
  active: boolean;
  showEnter: boolean;
}) {
  return (
    <button
      {...button}
      className={cn(
        "flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-clear-row px-3 py-2 text-left transition-colors",
        active ? "bg-clear-tile" : "hover:bg-clear-tile",
      )}
    >
      {icon}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-bold">{primary}</span>
        {secondary && <span className="truncate text-[13px] text-clear-muted">{secondary}</span>}
      </span>
      {value}
      {showEnter && (
        <span className="flex w-16 shrink-0 justify-end">
          {active ? <Kbd>Enter</Kbd> : <IconChevronRight className="size-[18px] text-clear-muted" />}
        </span>
      )}
    </button>
  );
}

// Account avatar: reuse a brand logo when the account's name maps to a known
// brand (e.g. "ING"), otherwise a cash tile.
function AccountGlyph({ name }: { name: string | null }) {
  const slug = name?.trim().toLowerCase().split(/\s+/)[0] ?? "";
  if (slug && BRAND_MAP[slug]) return <BrandIcon iconKey={slug} size="lg" />;
  return (
    <IconTile tone="sky" size="md" className="size-10">
      <IconCash />
    </IconTile>
  );
}
