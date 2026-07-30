"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { IconSearchFilled as Search, IconXFilled as X } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { pillContainerClass } from "@/components/bottom-nav";

// Full-width search bar shown underneath the transactions page title.
export function MobileTransactionsSearch({ search }: { search?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations("transactions");
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
        // Fully opaque here (the nav pill is bg-white/70) — this sits over page
        // content rather than floating above it.
        className={cn(
          pillContainerClass,
          "relative h-12 w-full bg-white"
        )}
      >
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-foreground/40 pointer-events-none" />
      <input
        type="text"
        placeholder={t("searchPlaceholder")}
        value={value}
        onChange={onInput}
        className="h-full w-full pl-10 pr-10 text-sm focus:outline-none"
      />
      {value && (
        <button onClick={clear} className="absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-full flex items-center justify-center" aria-label={t("clear")}>
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
