"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IconCategory, IconWallet, IconX } from "@tabler/icons-react";
import { CategoryMultiPicker } from "@/components/category-multi-picker";
import { AccountMultiPicker } from "@/components/account-multi-picker";
import { Icon } from "@/components/icon";
import { filterPillClass } from "@/components/filter-pill";
import { cn } from "@/lib/utils";
import type { Category, Bank } from "@/db/schema";

// Category + account multi-select, shared by the Analytics and Trends tabs (see
// AGENTS request: "select one or multiple and let the graphs change based on the
// selection"). State lives in the URL (`cat`, `acct` — comma-separated ids), same
// convention as ComparisonPicker/NettoToggle, so a page refresh or shared link keeps
// the selection and every server-rendered graph on the page picks it up together.
export function AnalyticsFilterBar({
  categories,
  banks,
  stickyTop,
}: {
  categories: Category[];
  banks: Bank[];
  /** CSS `top` value for this bar's own `position: sticky` — callers know whether
   * they sit in the page's window-level scroll (needs an offset clearing the
   * header above them) or inside their own already-clipped scroll pane (the
   * dashboard's Reports portal, where `0` is correct). No wrapping background
   * here on purpose — it's meant to float, translucent, over whatever scrolls
   * beneath it, not sit on a card/bar of its own. */
  stickyTop: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const catParam = searchParams.get("cat") ?? "";
  const acctParam = searchParams.get("acct") ?? "";
  const selectedCategoryIds = catParam ? catParam.split(",").filter(Boolean) : [];
  const selectedAccounts = acctParam ? acctParam.split(",").filter(Boolean) : [];

  function update(key: "cat" | "acct", values: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (values.length) params.set(key, values.join(","));
    else params.delete(key);
    router.push(`?${params.toString()}`);
  }

  return (
    <div
      className="sticky z-30 flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 mb-2 sm:mx-0 sm:px-0 py-1 -my-1"
      style={{ top: stickyTop }}
    >
      <CategoriesPill categories={categories} selected={selectedCategoryIds} onChange={(v) => update("cat", v)} />
      <AccountsPill banks={banks} selected={selectedAccounts} onChange={(v) => update("acct", v)} />
    </div>
  );
}

function CategoriesPill({
  categories,
  selected,
  onChange,
}: {
  categories: Category[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedCats = selected
    .map((id) => categories.find((c) => String(c.id) === id))
    .filter((c): c is Category => !!c);
  const active = selectedCats.length > 0;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={filterPillClass(active, "shrink-0")}>
        {active ? (
          <span className="flex items-center -space-x-1.5 shrink-0">
            {selectedCats.slice(0, 2).map((c) => (
              <span key={c.id} className="rounded-full ring-2 ring-background">
                <Icon iconKey={c.icon} color={c.color} round size="xs" />
              </span>
            ))}
            {selectedCats.length > 2 && (
              <span className="size-6 rounded-full bg-foreground/20 text-[10px] font-bold flex items-center justify-center ring-2 ring-background">
                +{selectedCats.length - 2}
              </span>
            )}
          </span>
        ) : (
          <IconCategory className="size-4 shrink-0" />
        )}
        <span>Categories</span>
        {active && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Reset categories"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onChange([]); }}
            className="shrink-0"
          >
            <IconX className="size-5 bg-white/40 rounded-full text-background p-1" />
          </span>
        )}
      </button>
      <CategoryMultiPicker
        categories={categories}
        selected={selected}
        open={open}
        onOpenChange={setOpen}
        onApply={onChange}
      />
    </>
  );
}

const AVATAR_COLORS = ["bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500"];
function avatarColor(key: string): string {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function AccountsPill({
  banks,
  selected,
  onChange,
}: {
  banks: Bank[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedBanks = selected
    .map((id) => banks.find((b) => b.accountNumber === id))
    .filter((b): b is Bank => !!b);
  const active = selectedBanks.length > 0;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={filterPillClass(active, "shrink-0")}>
        {active ? (
          <span className="flex items-center -space-x-1.5 shrink-0">
            {selectedBanks.slice(0, 2).map((b) => (
              <span
                key={b.id}
                className={cn(
                  "size-6 rounded-full ring-2 ring-background text-white text-[10px] font-semibold flex items-center justify-center",
                  avatarColor(b.accountNumber ?? String(b.id)),
                )}
              >
                {(b.displayName ?? b.accountNumber ?? "?").charAt(0).toUpperCase()}
              </span>
            ))}
            {selectedBanks.length > 2 && (
              <span className="size-6 rounded-full bg-foreground/20 text-[10px] font-bold flex items-center justify-center ring-2 ring-background">
                +{selectedBanks.length - 2}
              </span>
            )}
          </span>
        ) : (
          <IconWallet className="size-4 shrink-0" />
        )}
        <span>Accounts</span>
        {active && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Reset accounts"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onChange([]); }}
            className="shrink-0"
          >
            <IconX className="size-5 bg-white/40 rounded-full text-background p-1" />
          </span>
        )}
      </button>
      <AccountMultiPicker banks={banks} selected={selected} open={open} onOpenChange={setOpen} onApply={onChange} />
    </>
  );
}
