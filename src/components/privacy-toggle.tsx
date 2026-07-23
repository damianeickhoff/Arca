"use client";

import { useEffect, useState } from "react";
import { IconShieldFilled, IconShieldLockFilled } from "@tabler/icons-react"
import { ToggleSwitch } from "@/components/toggle-switch";
import { cn } from "@/lib/utils";

export function PrivacyToggle({ variant = "icon", compact }: { variant?: "icon" | "row"; compact?: boolean }) {
  const [blur, setBlur] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("privacy") === "1";
    // One-time sync from localStorage; unknowable during SSR, so this can't be
    // computed during render without a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBlur(stored);
    document.documentElement.classList.toggle("privacy", stored);
  }, []);

  function toggle() {
    const next = !blur;
    setBlur(next);
    document.documentElement.classList.toggle("privacy", next);
    localStorage.setItem("privacy", next ? "1" : "0");
  }

  if (variant === "row") {
    return (
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "flex items-center rounded-xl font-normal transition-colors w-full",
          compact ? "gap-2.5 px-3 py-2 text-sm" : "gap-3 px-3 py-2.5 text-base"
        )}
      >
        <span className={cn(
          "rounded-lg shrink-0",
        )}>
        </span>
        <span className="flex-1 text-left">Privacy mode</span>
        <ToggleSwitch on={blur} />
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      title={blur ? "Show amounts" : "Privacy mode"}
      className="p-3 rounded-md text-foreground/40 hover:text-foreground cursor-pointer"
    >
      {blur ? <IconShieldLockFilled className="size-6" /> : <IconShieldFilled className="size-5" />}
    </button>
  );
}
