"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { IconSearchFilled as Search, IconXFilled as X } from "@tabler/icons-react";
import { RecurringClient } from "./recurring-client";

interface Props {
  search?: string;
}

// Floating bar pinned above the bottom nav — search + add, same fixed-bottom
// convention as PeriodSelector/FloatingAddButton elsewhere in the app, instead of
// living inline in the page's sticky top header.
export function MobileRecurringBottomBar({ search }: Props) {
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

  return (
    <div className="lg:hidden fixed left-4 right-4 bottom-[calc(3.5rem+var(--sab))] z-40 flex items-center gap-3">
      <div className="glass-search-bar relative flex-1">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-foreground/40 pointer-events-none" />
        <input
          type="text"
          placeholder="Search vaste kosten..."
          value={value}
          onChange={onInput}
          className="w-full h-14 text-sm rounded-full pl-10 pr-10 bg-transparent focus:outline-none"
        />
        {value && (
          <button onClick={clear} className="absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-foreground/8 flex items-center justify-center" aria-label="Wissen">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <RecurringClient action="add" variant="icon" />
    </div>
  );
}
