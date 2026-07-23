import { cn } from "@/lib/utils";

// The brand mark, inlined from src/app/logo_dark.svg / logo_light.svg.
// logo_dark = the dark-inked mark, shown on LIGHT theme.
// logo_light = the light-inked mark, shown on DARK theme (and on the dark auth gradient).
function LogoDark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 81 82" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M58.2476 35.3064C68.0667 54.5798 84.2084 67.4955 77.8029 70.7589C71.3975 74.0222 49.8388 67.6145 40.0197 48.3411C30.2005 29.0677 33.5238 5.84133 39.9292 2.57797C46.3347 -0.685387 48.4284 16.033 58.2476 35.3064Z" fill="#3A3A3A" />
      <path d="M29.7629 15.9948C28.2369 25.5197 29.5689 39.6152 35.8459 52.3776C28.6541 67.419 5.81577 72.7293 1.05589 69.9558C-3.85908 67.0916 9.50054 57.3709 18.1535 42.3102C26.0019 28.65 26.138 16.0776 29.7629 15.9948Z" fill="#878787" />
      <circle cx="38.9998" cy="60.3749" r="2" fill="#B3B3B3" />
    </svg>
  );
}

function LogoLight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 81 82" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M58.2473 35.3064C68.0664 54.5798 84.2081 67.4955 77.8027 70.7589C71.3972 74.0222 49.8385 67.6145 40.0194 48.3411C30.2003 29.0677 33.5235 5.84134 39.929 2.57798C46.3344 -0.68538 48.4282 16.033 58.2473 35.3064Z" fill="#F0F0F0" />
      <path d="M29.7629 15.9948C28.2369 25.5198 29.5688 39.6152 35.8459 52.3776C28.6542 67.4189 5.81616 72.7291 1.0559 69.9558C-3.85908 67.0917 9.50055 57.3709 18.1536 42.3103C26.002 28.6498 26.1378 16.0771 29.7629 15.9948Z" fill="#F0F0F0" />
      <circle cx="38.9996" cy="60.3749" r="2" fill="#F0F0F0" />
    </svg>
  );
}

// Standalone theme-aware logo mark (no wordmark). Swaps ink with the `.dark`
// class the same way BrandMark does.
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center justify-center", className)}>
      <LogoDark className="size-full dark:hidden" />
      <LogoLight className="size-full hidden dark:block" />
    </span>
  );
}

export function BrandMark({
  collapsed,
  size = "md",
  subtitle,
  variant = "default",
}: {
  collapsed?: boolean;
  size?: "md" | "lg";
  // Optional caption stacked under the wordmark (e.g. the sidebar's household name).
  subtitle?: string;
  // "light" = always the light-inked mark + white wordmark, for the dark gradient
  // backgrounds (the auth pages) instead of the themed sidebar/app background.
  variant?: "default" | "light";
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={cn(
          "flex items-center justify-center shrink-0",
          size === "lg" ? "size-11" : "size-9"
        )}
      >
        {variant === "light" ? (
          <LogoLight className="size-full" />
        ) : (
          <>
            {/* Theme-swapped by the `.dark` class on <html> (applied pre-hydration,
                so no flash) — dark-inked mark on light, light-inked mark on dark. */}
            <LogoDark className="size-full dark:hidden" />
            <LogoLight className="size-full hidden dark:block" />
          </>
        )}
      </div>
      {!collapsed && (
        <div>
          <p className={cn(
            "leading-none",
            variant === "light" ? "text-white font-medium" : "text-foreground font-black",
            size === "lg" ? "text-4xl" : "text-2xl",
          )}>
            Arca
          </p>
          {subtitle && (
            <p className={cn("text-xs mt-1 tracking-wide", variant === "light" ? "text-white/60" : "text-foreground/60")}>
              {subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
