"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { IconShield, IconMoon } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ToggleSwitch } from "@/components/toggle-switch";
import { ThemeSegmented } from "@/components/theme-toggle";

// Shared building blocks for the mobile menu page family (/menu, /menu/settings,
// /menu/help) — kept visually identical to the sidebar drawer they replaced.

export function MobileMenuSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card/70 dark:bg-white/10 rounded-lg overflow-hidden py-4 px-1 dark:divide-white/12">
      {children}
    </div>
  );
}

export function MobileMenuRow({
  icon: Icon,
  label,
  onTap,
  right,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onTap?: () => void;
  right?: React.ReactNode;
  destructive?: boolean;
}) {
  const content = (
    <>
      <Icon className={cn("size-7 shrink-0", destructive ? "text-destructive" : "text-primary")} />
      <span className={cn("flex-1 text-lg font-medium", destructive ? "text-destructive" : "text-foreground")}>
        {label}
      </span>
      {right ?? (onTap && !destructive && <ChevronRight className="size-6 text-foreground shrink-0" />)}
    </>
  );
  // Rows without their own tap action (e.g. the theme row, whose segmented control holds
  // the real buttons) render as a plain div — nesting buttons is invalid HTML.
  if (!onTap) {
    return <div className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left">{content}</div>;
  }
  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left active:bg-black/[0.04] dark:active:bg-white/10 active:scale-[0.98] transition-[transform,background-color] duration-150"
    >
      {content}
    </button>
  );
}

export function MobileMenuLinkRow({
  icon: Icon,
  label,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="w-full flex items-center gap-4 px-4 py-5 text-left active:bg-black/[0.04] dark:active:bg-white/10 active:scale-[0.98] transition-[transform,background-color] duration-150"
    >
      <Icon className="size-7 shrink-0 text-primary" />
      <span className="flex-1 text-lg font-medium text-foreground">{label}</span>
      <ChevronRight className="size-4 text-foreground shrink-0" />
    </Link>
  );
}

export function MobileMenuPrivacyRow() {
  const [blur, setBlur] = useState(false);
  useEffect(() => {
    setBlur(localStorage.getItem("privacy") === "1");
  }, []);
  function toggle() {
    const next = !blur;
    setBlur(next);
    document.documentElement.classList.toggle("privacy", next);
    localStorage.setItem("privacy", next ? "1" : "0");
  }
  return (
    <MobileMenuRow
      icon={IconShield}
      label="Privacy mode"
      onTap={toggle}
      right={<ToggleSwitch on={blur} />}
    />
  );
}

export function MobileMenuThemeRow() {
  return (
    <MobileMenuRow
      icon={IconMoon}
      label="Theme"
      right={<ThemeSegmented />}
    />
  );
}

// Sticky sub-page header: circular back button, then title below — matches the
// old sidebar drawer's sub-panel header so every drill-down step under /menu
// feels the same. `action` is the optional "+" button some leaf pages show.
//
// `useHistoryBack`: when a page is reachable from more than one place (e.g.
// /transactions/upcoming, linked from both the dashboard and /transactions), a fixed
// `backHref` always returns to the same page regardless of where the user came from.
// Passing this instead makes the button call router.back(), returning to whichever
// page actually opened it. `backHref` is still required as the type-safe fallback
// value but is unused in that mode.
export function MobileSubpageHeader({
  title,
  backHref,
  action,
  useHistoryBack,
}: {
  title: string;
  backHref: string;
  action?: React.ReactNode;
  useHistoryBack?: boolean;
}) {
  const router = useRouter();
  const backButtonClassName = "size-11 rounded-full bg-white/70 dark:bg-white/10 backdrop-blur-sm flex items-center justify-center active:scale-[0.97] transition-transform shrink-0";

  return (
    <div className="px-4 pb-3 pt-4" style={{ paddingTop: `calc(1rem + var(--sat))` }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {useHistoryBack ? (
            <button type="button" onClick={() => router.back()} aria-label="Back" className={backButtonClassName}>
              <ChevronLeft className="size-5 text-foreground" />
            </button>
          ) : (
            <Link href={backHref} aria-label="Back" className={backButtonClassName}>
              <ChevronLeft className="size-5 text-foreground" />
            </Link>
          )}

          <h2 className="font-semibold text-2xl text-foreground">
            {title}
          </h2>
        </div>

        {action}
      </div>
    </div>
  );
}
