"use client";

import { useRef, useState } from "react";
import { IconSearch as SearchIcon } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { glassIconButton } from "@/lib/styles";
import { GlobalSearchOverlay } from "@/components/global-search-overlay";

export function SearchTriggerButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function handleOpen() {
    setOriginRect(buttonRef.current?.getBoundingClientRect() ?? null);
    setOpen(true);
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleOpen}
        className={cn("size-12", glassIconButton, className)}
        aria-label="Search"
      >
        <SearchIcon className="size-6 stroke-[1.5] text-foreground dark:text-gray-300" />
      </button>
      <GlobalSearchOverlay open={open} onClose={() => setOpen(false)} originRect={originRect} />
    </>
  );
}
