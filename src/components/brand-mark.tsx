import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

// No real logo asset exists yet, so the icon mark below is a placeholder.
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
  // "light" = white wordmark + frosted-glass icon badge, for dark gradient
  // backgrounds (the auth pages) instead of the themed sidebar/app background.
  variant?: "default" | "light";
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={cn(
          "rounded-xl flex items-center justify-center shrink-0",
          variant === "light"
            ? "text-white"
            : "text-white bg-gradient-to-br from-teal-500 to-emerald-700 shadow-sm",
          size === "lg" ? "size-11" : "size-9"
        )}
      >
        <Wallet className={size === "lg" ? "size-6.5" : "size-6.5"} />
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
