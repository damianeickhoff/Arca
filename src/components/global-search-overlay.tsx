"use client";

import { useState, useEffect, useRef, useCallback, createElement } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  IconSearch as Search,
  IconX as X,
  IconArrowsLeftRight as ArrowLeftRight,
  IconRepeat as Repeat,
  IconCreditCard as CreditCard,
  IconTags as Tags,
  IconChevronRight,
  IconCash,
  IconTag,
} from "@tabler/icons-react";
import * as Tabler from "@tabler/icons-react";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import { pillContainerClass, SearchCloseIcon } from "@/components/mobile-bottom-nav";
import { BrandIcon } from "@/components/brand-icon";
import { BRAND_MAP } from "@/lib/brand-map";
import { resolveLegacyIconKey } from "@/lib/legacy-icon-map";

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
  originRect?: DOMRect | null;
}

// Relative "time ago" for the accounts list. createdAt is stored as a UTC
// `datetime('now')` string ("YYYY-MM-DD HH:MM:SS").
function timeAgo(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso.replace(" ", "T") + "Z").getTime();
  if (Number.isNaN(then)) return null;
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

// Resolves a category's icon key to a Tabler component, rendered bare (no chip)
// in the category's own colour — matches the outline-glyph look in the design.
function CategoryGlyph({ iconKey, color, size = 26 }: { iconKey: string | null; color: string | null; size?: number }) {
  const lib = Tabler as unknown as Record<string, React.ComponentType<{ size?: number; color?: string }>>;
  const keys = new Set(Object.keys(Tabler));
  const resolved = iconKey && iconKey.startsWith("Icon") && keys.has(iconKey)
    ? iconKey
    : resolveLegacyIconKey(iconKey ?? "", keys);
  const comp = (resolved && lib[resolved]) || IconTag;
  return createElement(comp, { size, color: color ?? "currentColor" });
}

function brandTitle(iconKey: string | null): string {
  if (!iconKey) return "Brand";
  if (iconKey.startsWith("img:") || iconKey.startsWith("custom:")) return "Brand";
  const base = iconKey.includes("?") ? iconKey.slice(0, iconKey.indexOf("?")) : iconKey;
  return BRAND_MAP[base]?.title ?? base;
}

export function GlobalSearchOverlay({ open, onClose, originRect }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [animStyle, setAnimStyle] = useState<React.CSSProperties>({});
  // contentKey increments each time we open, forcing CSS animations to restart
  const [contentKey, setContentKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Keep portal in DOM for the close animation, then unmount
  useEffect(() => {
    if (open) {
      setVisible(true);
    } else {
      const t = setTimeout(() => setVisible(false), 360);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Clip-path expand/collapse + content entrance key bump
  useEffect(() => {
    if (!originRect) return;

    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const { top, right, bottom, left } = originRect;
    const collapsed = `inset(${top}px ${winW - right}px ${winH - bottom}px ${left}px round 24px)`;
    const expanded = "inset(0px 0px 0px 0px round 0px)";

    if (open) {
      // Start collapsed, then spring open
      setAnimStyle({ clipPath: collapsed, opacity: 0, transition: "none" });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimStyle({
            clipPath: expanded,
            opacity: 1,
            // Spring easing: fast initial velocity, gentle overshoot settle
            transition: "clip-path 480ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease",
          });
          // Bump key so CSS animations re-run for content stagger
          setContentKey((k) => k + 1);
        });
      });
    } else {
      // Snap back quickly — ease-in feels intentional, not laggy
      setAnimStyle({
        clipPath: collapsed,
        opacity: 0,
        transition: "clip-path 300ms cubic-bezier(0.55, 0, 1, 0.45), opacity 180ms ease 60ms",
      });
    }
  }, [open, originRect]);

  // Body scroll lock + state reset on close
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      setQuery("");
      setResults(null);
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Load the default overview (categories/accounts/brands) the first time the
  // overlay opens each session.
  useEffect(() => {
    if (!open || overview) return;
    let cancelled = false;
    fetch("/api/search/overview")
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setOverview(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, overview]);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults(null); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      setResults(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(q), 300);
  }

  function navigate(path: string) {
    onClose();
    router.push(path);
  }

  const hasResults = results !== null && (
    results.transactions.length + results.recurring.length + results.debts.length + results.categories.length > 0
  );

  if (!mounted || !visible) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-background flex flex-col"
      style={{ paddingTop: "env(safe-area-inset-top)", ...animStyle }}
    >
      {visible && (
        <>
          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">

            {/* Default state — shown when not searching */}
            {!query && (
              <div className="pt-2 space-y-8">
                {/* Categories */}
                {overview && overview.categories.length > 0 && (
                  <section
                    className="search-content-enter"
                    key={`cats-${contentKey}`}
                    style={{ animationDelay: "120ms" }}
                  >
                    <OverviewHeader label="Categories" onClick={() => navigate("/settings?tab=categories")} />
                    <div className="grid grid-cols-2 gap-3">
                      {overview.categories.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => navigate(`/transactions?category=${c.id}`)}
                          className="flex flex-col gap-3 rounded-2xl bg-foreground/[0.04] p-4 text-left hover:bg-foreground/[0.08] transition-colors"
                        >
                          <CategoryGlyph iconKey={c.icon} color={c.color} />
                          <div>
                            <p className="text-[15px] font-semibold leading-tight truncate">{c.name}</p>
                            <p className="text-xs text-foreground/40 mt-1 leading-snug">
                              {c.count} transaction{c.count === 1 ? "" : "s"} in the last 30 days
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {/* Accounts */}
                {overview && overview.accounts.length > 0 && (
                  <section
                    className="search-content-enter"
                    key={`accounts-${contentKey}`}
                    style={{ animationDelay: "180ms" }}
                  >
                    <OverviewHeader label="Accounts" onClick={() => navigate("/settings?tab=accounts")} />
                    <div className="space-y-3">
                      {overview.accounts.map((a) => {
                        const ago = timeAgo(a.lastAt);
                        return (
                          <button
                            key={a.accountNumber}
                            onClick={() => navigate(`/transactions?account=${encodeURIComponent(a.accountNumber)}`)}
                            className="w-full flex items-center gap-3 rounded-2xl bg-foreground/[0.04] p-4 text-left hover:bg-foreground/[0.08] transition-colors"
                          >
                            <AccountGlyph name={a.displayName} />
                            <div className="flex-1 min-w-0">
                              <p className="text-[15px] font-semibold leading-tight truncate">{a.displayName ?? a.accountNumber}</p>
                              {ago && <p className="text-xs text-foreground/40 mt-0.5 truncate">Last transaction {ago}</p>}
                            </div>
                            <span className="text-[15px] font-bold tabular-nums shrink-0">{formatEur(a.balance ?? 0)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* Brands */}
                {overview && overview.brands.length > 0 && (
                  <section
                    className="search-content-enter"
                    key={`brands-${contentKey}`}
                    style={{ animationDelay: "240ms" }}
                  >
                    <OverviewHeader label="Brands" onClick={() => navigate("/transactions")} />
                    <div className="grid grid-cols-2 gap-3">
                      {overview.brands.map((b, i) => (
                        <button
                          key={`${b.iconKey}-${i}`}
                          onClick={() => navigate(`/transactions?search=${encodeURIComponent(brandTitle(b.iconKey))}`)}
                          className="flex flex-col gap-3 rounded-2xl bg-foreground/[0.04] p-4 text-left hover:bg-foreground/[0.08] transition-colors"
                        >
                          <BrandIcon iconKey={b.iconKey} size="lg" />
                          <div>
                            <p className="text-[15px] font-semibold leading-tight truncate">{brandTitle(b.iconKey)}</p>
                            <p className="text-xs text-foreground/40 mt-1 leading-snug">
                              {b.count} transaction{b.count === 1 ? "" : "s"} in the last 30 days
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}

            {/* Search state */}
            {query && (
              <>
                {loading && (
                  <p className="py-8 text-center text-sm text-white">Searching...</p>
                )}
                {!loading && results !== null && !hasResults && (
                  <p className="py-8 text-center text-sm text-foreground/40">No results for &ldquo;{query}&rdquo;</p>
                )}
                {!loading && hasResults && (
                  <div className="space-y-6 pt-2">
                    {results!.transactions.length > 0 && (
                      <Section label="Transactions" icon={ArrowLeftRight} animDelay="0ms">
                        {results!.transactions.map((t) => (
                          <ResultRow
                            key={t.id}
                            primary={t.description}
                            secondary={new Date(t.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                            value={t.direction === "expense" ? formatEur(-t.amount) : formatEur(t.amount)}
                            valueColor={t.direction === "expense" ? "text-destructive" : "text-emerald-600"}
                            onClick={() => navigate("/transactions")}
                          />
                        ))}
                      </Section>
                    )}
                    {results!.categories.length > 0 && (
                      <Section label="Categories" icon={Tags} animDelay="60ms">
                        {results!.categories.map((c) => (
                          <ResultRow
                            key={c.id}
                            primary={c.name}
                            dot={c.color ?? undefined}
                            onClick={() => navigate("/settings?tab=categories")}
                          />
                        ))}
                      </Section>
                    )}
                    {results!.recurring.length > 0 && (
                      <Section label="Fixed costs" icon={Repeat} animDelay="120ms">
                        {results!.recurring.map((r) => (
                          <ResultRow
                            key={r.id}
                            primary={r.name}
                            value={r.amount != null ? formatEur(r.amount) : undefined}
                            onClick={() => navigate("/settings?tab=recurring")}
                          />
                        ))}
                      </Section>
                    )}
                    {results!.debts.length > 0 && (
                      <Section label="Debts" icon={CreditCard} animDelay="180ms">
                        {results!.debts.map((d) => (
                          <ResultRow
                            key={d.id}
                            primary={d.name}
                            value={formatEur(d.startingBalance)}
                            onClick={() => navigate("/debts")}
                          />
                        ))}
                      </Section>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Bottom search bar — the close/X button sits on the right, in the exact
              spot the bottom-nav's search button was tapped from, so it reads as
              that same button continuing its morph rather than a new element. */}
          <div
            className="backdrop-blur-lg fixed left-6 right-6 z-10 flex items-center gap-3 search-content-enter"
            style={{ bottom: "max(1.25rem, env(safe-area-inset-bottom))", animationDelay: "80ms" }}
            key={`searchbar-${contentKey}`}
          >
            <div className={cn(pillContainerClass, "flex-1 min-w-0")}>
              <div className="flex items-center gap-2 h-13 px-3 w-full">
                <Search className="size-4 text-foreground/40 shrink-0" />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={onInput}
                  placeholder="Search everything..."
                  className="flex-1 min-w-0 bg-transparent  text-sm text-foreground focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => { setQuery(""); setResults(null); }}
                    aria-label="Clear"
                    className="size-6 rounded-full bg-foreground/10 flex items-center justify-center shrink-0"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={cn(pillContainerClass, "shrink-0")}
            >
              <span className="flex items-center justify-center size-13 rounded-full text-foreground">
                <SearchCloseIcon open size={25} />
              </span>
            </button>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

function OverviewHeader({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center justify-between w-full mb-3 group">
      <span className="text-2xl font-bold tracking-tight">{label}</span>
      <IconChevronRight className="size-6 text-foreground/30 group-hover:text-foreground/50 transition-colors" />
    </button>
  );
}

// Account avatar: reuse a brand logo when the account's name maps to a known
// brand (e.g. "ING"), otherwise a generic cash chip.
function AccountGlyph({ name }: { name: string | null }) {
  const slug = name?.trim().toLowerCase().split(/\s+/)[0] ?? "";
  if (slug && BRAND_MAP[slug]) return <BrandIcon iconKey={slug} size="lg" />;
  return (
    <div className="size-10 rounded-full bg-sky-100 dark:bg-sky-500/15 shrink-0 flex items-center justify-center">
      <IconCash className="size-5 text-sky-500" />
    </div>
  );
}

function Section({ label, icon: Icon, children, animDelay }: { label: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; animDelay?: string }) {
  return (
    <div className="search-item-enter" style={{ animationDelay: animDelay ?? "0ms" }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="size-3.5 text-foreground/40" />
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground/40">{label}</span>
      </div>
      <div className="rounded-2xl overflow-hidden bg-foreground/[0.04] flex flex-col divide-y divide-foreground/5">
        {children}
      </div>
    </div>
  );
}

function ResultRow({ primary, secondary, value, valueColor, dot, onClick }: {
  primary: string;
  secondary?: string;
  value?: string;
  valueColor?: string;
  dot?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-foreground/5 transition-colors"
    >
      {dot && <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{primary}</p>
        {secondary && <p className="text-xs text-foreground/40 truncate mt-0.5">{secondary}</p>}
      </div>
      {value && (
        <span className={cn("text-sm tabular-nums shrink-0 font-semibold", valueColor ?? "text-foreground/60")}>{value}</span>
      )}
    </button>
  );
}
