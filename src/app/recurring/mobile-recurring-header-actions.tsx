"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { IconSearchFilled as Search, IconXFilled as X, IconAdjustmentsHorizontalFilled as SlidersHorizontal } from "@tabler/icons-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RecurringClient } from "./recurring-client";

const GROUPS = ["income", "bill", "subscription", "debt"] as const;
const TYPE_LABELS: Record<string, string> = {
  income: "Inkomsten", bill: "Rekeningen", subscription: "Abonnementen", debt: "Schulden",
};

interface Props {
  search?: string;
  group?: string;
}

export function MobileRecurringHeaderActions({ search, group }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(search ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pushSearch(query: string) {
    const next = new URLSearchParams(params.toString());
    if (query) next.set("recSearch", query);
    else next.delete("recSearch");
    router.push(`${pathname}?${next.toString()}`);
  }

  function pushGroup(g: string) {
    const next = new URLSearchParams(params.toString());
    if (g) next.set("recGroup", g);
    else next.delete("recGroup");
    router.push(`${pathname}?${next.toString()}`);
  }

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setValue(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => pushSearch(q), 300);
  }

  function clear() {
    setValue("");
    pushSearch("");
  }

  const isFiltered = !!group;

  return (
    <>
      <div className="glass-search-bar relative flex-1">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-foreground/40 pointer-events-none" />
        <input
          type="text"
          placeholder="Zoek vaste kosten..."
          value={value}
          onChange={onInput}
          className="w-full h-12 text-sm rounded-full pl-10 pr-10 bg-transparent focus:outline-none"
        />
        {value && (
          <button onClick={clear} className="absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-foreground/8 flex items-center justify-center" aria-label="Wissen">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <RecurringClient action="add" variant="icon" />
      <DropdownMenu>
        <DropdownMenuTrigger
          className={
            isFiltered
              ? "size-12 rounded-full bg-foreground transition-colors flex items-center justify-center shrink-0 cursor-pointer"
              : "glass-icon-btn size-12 shrink-0"
          }
        >
          <SlidersHorizontal className={`size-5 ${isFiltered ? "text-white" : "text-foreground dark:text-gray-300"}`} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48 ring-0 border-none">
          <DropdownMenuItem
            onClick={() => pushGroup("")}
            className={!group ? "bg-foreground text-primary-foreground font-medium focus:bg-foreground focus:text-primary-foreground" : "text-foreground"}
          >
            Alle
          </DropdownMenuItem>
          {GROUPS.map((g) => (
            <DropdownMenuItem
              key={g}
              onClick={() => pushGroup(g)}
              className={group === g ? "bg-foreground text-primary-foreground font-medium focus:bg-foreground focus:text-primary-foreground" : "text-foreground"}
            >
              {TYPE_LABELS[g]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
