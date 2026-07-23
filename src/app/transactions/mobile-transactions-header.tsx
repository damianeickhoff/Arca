"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { IconSearchFilled as Search, IconXFilled as X } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export const pillContainerClass = cn(
  "glass-nav relative flex items-center rounded-full transition-all duration-300 ease-in-out overflow-hidden",
  "bg-white dark:bg-white/7",
  "backdrop-blur-lg backdrop-saturate-80 dark:backdrop-blur-lg",
  "border-1 border-white/10 dark:border-0",
  "shadow-[0_6px_18px_rgba(109,109,109,0.178),inset_0_1px_1px_rgba(255,255,255,0.205)]",
  "dark:shadow-none",
  "p-[4px]",
);

// Full-width search bar shown underneath the transactions page title.
export function MobileTransactionsSearch({ search }: { search?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(search ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function push(query: string) {
    const next = new URLSearchParams(params.toString());
    if (query) next.set("search", query);
    else next.delete("search");
    next.delete("limit");
    router.push(`?${next.toString()}`);
  }

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setValue(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => push(q), 300);
  }

  function clear() {
    setValue("");
    push("");
  }

  return (
      <div
        className={cn(
          pillContainerClass,
          "relative h-12 w-full"
        )}
      >
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-foreground/40 pointer-events-none" />
      <input
        type="text"
        placeholder="Search by category, merchant, etc..."
        value={value}
        onChange={onInput}
        className="h-full w-full pl-10 pr-10 text-sm focus:outline-none"
      />
      {value && (
        <button onClick={clear} className="absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-full flex items-center justify-center" aria-label="Clear">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
