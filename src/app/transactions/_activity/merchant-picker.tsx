"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "@/components/ui/category-icon";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Merchant picker: pick one of the merchants already in use, or type a new name.
// Both paths go through POST /api/merchants, which get-or-creates by normalized name —
// so typing "albert heijn" when "Albert Heijn" exists reuses that profile.
// (Moved here from the old transaction detail dialog, which the panel replaced.)
export function MerchantPickerDialog({
  open,
  currentId,
  suggestion,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  currentId: number | null;
  suggestion: string;
  onOpenChange: (open: boolean) => void;
  onPick: (name: string) => void;
}) {
  const t = useTranslations("activity.merchantPicker");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* z-[88]: reassignment can be started from the merchant profile, a body portal at
          z-70 that stays open behind this picker — without it the sheet opens underneath
          the profile and looks like nothing happened. */}
      <DialogContent sheetClassName="z-[88]" overlayClassName="z-[88] backdrop-blur-lg bg-clear-primary/20">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        {/* Mounted only while open so the search box and merchant list reset per
            opening, instead of an effect resetting them on every `open` flip. */}
        {open && <MerchantPickerBody currentId={currentId} suggestion={suggestion} onPick={onPick} />}
      </DialogContent>
    </Dialog>
  );
}

function MerchantPickerBody({
  currentId,
  suggestion,
  onPick,
}: {
  currentId: number | null;
  suggestion: string;
  onPick: (name: string) => void;
}) {
  const t = useTranslations("activity.merchantPicker");
  const [all, setAll] = useState<Array<{ id: number; name: string; icon: string | null; color: string | null; transactionCount: number }>>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/merchants")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setAll(Array.isArray(d) ? d : []); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const term = query.trim().toLowerCase();
  const matches = term ? all.filter((m) => m.name.toLowerCase().includes(term)) : all;
  const exact = all.some((m) => m.name.toLowerCase() === term);

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={suggestion ? t("searchSuggestion", { suggestion }) : t("search")}
        className="w-full rounded-clear-tile border border-clear-line bg-clear-card px-3 py-2 text-sm text-clear-ink outline-none focus:ring-2 focus:ring-clear-ember/50"
      />
      <div className="max-h-[50vh] space-y-1 overflow-y-auto">
        {term && !exact && (
          <button
            type="button"
            onClick={() => onPick(query.trim())}
            className="flex w-full items-center gap-2.5 rounded-clear-row px-3 py-2.5 text-left text-sm transition-colors hover:bg-clear-tile"
          >
            <span className="font-semibold text-clear-ink">{t("add", { name: query.trim() })}</span>
          </button>
        )}
        {loading && <p className="px-3 py-2 text-xs text-clear-muted">{t("loading")}</p>}
        {matches.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onPick(m.name)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-clear-row px-3 py-2.5 text-left text-sm transition-colors",
              m.id === currentId ? "bg-clear-tile font-semibold" : "hover:bg-clear-tile",
            )}
          >
            <CategoryIcon icon={m.icon} color={m.color} size="sm" />
            <span className="flex-1 truncate text-clear-ink">{m.name}</span>
            <span className="text-xs tabular-nums text-clear-muted">{m.transactionCount}</span>
          </button>
        ))}
        {!loading && matches.length === 0 && !term && <p className="px-3 py-2 text-xs text-clear-muted">{t("none")}</p>}
      </div>
    </div>
  );
}
