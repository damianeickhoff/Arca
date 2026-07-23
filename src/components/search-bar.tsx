"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import {
  IconSearch as Search
} from "@tabler/icons-react";

export function SearchBar({ current }: { current?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(current ?? "");
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

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-foreground pointer-events-none" />
        <input
          type="search"
          placeholder="Search op omschrijving of bedrag..."
          value={value}
          onChange={onInput}
          className="text-sm border rounded-md pl-8 pr-3 py-1.5 bg-background min-w-52"
        />
      </div>
    </div>
  );
}
