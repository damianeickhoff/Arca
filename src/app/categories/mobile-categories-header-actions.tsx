"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { IconSearch as Search, IconXFilled as X } from "@tabler/icons-react";
import { CategoryClient } from "./category-client";

interface Props {
  search?: string;
}

export function MobileCategoriesHeaderActions({ search }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(search ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pushSearch(query: string) {
    const next = new URLSearchParams(params.toString());
    if (query) next.set("catSearch", query);
    else next.delete("catSearch");
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
    <>
      <div className="glass-search-bar relative flex-1">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-foreground/40 pointer-events-none" />
        <input
          type="text"
          placeholder="Zoek categorie..."
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
      <CategoryClient action="add" variant="icon" />
    </>
  );
}
