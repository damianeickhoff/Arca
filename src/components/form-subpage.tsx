"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { IconChevronLeft } from "@tabler/icons-react";
import { acquireNavHidden } from "@/lib/nav-visibility";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { m, easeOutQuart } from "@/lib/motion";
import { useScrollElevation } from "@/lib/use-scroll-elevation";
import { cn } from "@/lib/utils";

// Shared scaffold for the app's full-screen "add / edit" forms — the visual
// language first built for the add-transaction page: a sticky always-visible back
// button, a slide-up + fade entrance, an optional big amount hero, a rounded card
// of stacked fields and a static save button at the end. The bottom nav is hidden
// while any of these are open.
//
// The back button is a real sticky child of the scroll flow (NOT position:fixed),
// so it survives the browser's scroll-into-view when an input is focused — a fixed
// button detaches during that keyboard reflow on mobile. It lives outside the motion
// wrapper so the entrance transform can never strand it.
export function FormSubpage({
  title,
  onBack,
  children,
}: {
  // Shown next to the back button, e.g. "Add new debt".
  title?: string;
  // Defaults to router.back(); pass a custom handler for multi-step flows.
  onBack?: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [headerRef, scrolled] = useScrollElevation();

  useEffect(() => acquireNavHidden(), []);

  return (
    <div className="min-h-dvh bg-background">
      <div
        ref={headerRef as React.RefObject<HTMLDivElement>}
        className={cn(
          "sticky top-0 z-50 flex items-center gap-3 px-4 pt-[calc(var(--sat)+0.75rem)] pb-2 transition-colors duration-300",
          scrolled ? "bg-background/80 backdrop-blur-md border-b border-black/5 dark:border-white/10" : "border-b border-transparent",
        )}
      >
        <button
          type="button"
          onClick={onBack ?? (() => router.back())}
          aria-label="Close"
          className="shrink-0 size-11 rounded-full bg-white/80 dark:bg-white/10 backdrop-blur-md flex items-center justify-center active:scale-[0.97] transition-transform shadow-sm"
        >
          <IconChevronLeft className="size-5 text-black dark:text-white" />
        </button>
        {title && <h1 className="text-lg font-bold text-foreground truncate">{title}</h1>}
      </div>

      <m.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: easeOutQuart }}
      >
        {children}
      </m.div>
    </div>
  );
}

// Big centered amount at the top of the form, with a leading prefix (e.g. "− €").
// The input auto-sizes to its content via a `ch` width so the prefix stays glued to
// the number and the pair stays optically centered (same trick the goal creator uses)
// — a fixed width would leave the "€" marooned far from a short amount.
// text-4xl! (important) is required: a global rule in globals.css forces
// `input { font-size:16px !important }` on mobile to block iOS focus-zoom, which a
// plain text-4xl can't override.
export function FormAmountHero({
  prefix,
  value,
  onChange,
  autoFocus,
  placeholder = "0",
}: {
  prefix: React.ReactNode;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const width = Math.max(value.length || placeholder.length || 1, 1);
  return (
    // Equal breathing room above and below — the card below no longer overlaps it.
    <div className="flex items-baseline justify-center gap-1 py-10">
      <span className="text-4xl font-bold text-foreground shrink-0">{prefix}</span>
      <AmountInput
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{ width: `${width}ch` }}
        className="min-w-0 h-auto rounded-none border-0 bg-transparent px-0 mt-0 mb-0 text-4xl! font-bold tabular-nums text-foreground placeholder:text-foreground/40 text-center focus-visible:ring-0"
      />
    </div>
  );
}

// Rounded card body holding the stacked fields.
export function FormCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card mx-5 p-5 space-y-4 lg:max-w-xl lg:mx-auto">
      {children}
    </div>
  );
}

// A single labelled field (label above the control).
export function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground/70">{label}</label>
      {children}
    </div>
  );
}

// Static save button pinned at the end of the form (scrolls with content — the
// bottom nav is hidden, so there's nothing to clear). Optional destructive action
// (e.g. a delete button on edit) sits alongside it.
export function FormSaveButton({
  onClick,
  disabled,
  loading,
  label = "Save",
  destructive,
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
  destructive?: React.ReactNode;
}) {
  return (
    <div className="mt-6 px-5 pb-[calc(2rem+var(--sab))] lg:px-0 lg:max-w-xl lg:mx-auto flex items-center gap-3">
      <Button onClick={onClick} disabled={disabled} className="flex-1 h-13 rounded-full text-base shadow-floating">
        {loading ? "Saving…" : label}
      </Button>
      {destructive}
    </div>
  );
}
