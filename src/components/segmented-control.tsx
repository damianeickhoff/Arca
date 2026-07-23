"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { m, LayoutGroup, spring } from "@/lib/motion";

interface SegmentedControlOption<T extends string> {
  key: T;
  label: string;
}

// Shared pill-style switcher — same look used for the "Vast/Variabel/Beide" chart
// filters (reports page) and the admin background type switcher (image/gradient).
// The active background is a shared-layout element, so selection slides between
// segments with spring physics.
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  size = "sm",
  className,
}: {
  value: T;
  options: readonly SegmentedControlOption<T>[];
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const groupId = useId();
  return (
    <LayoutGroup id={groupId}>
      <div className={cn("inline-flex items-center rounded-full bg-foreground/3 p-1", size === "sm" ? "text-xs" : "text-sm", className)}>
        {options.map((opt) => {
          const active = value === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onChange(opt.key)}
              className={cn(
                "relative rounded-full font-medium transition-colors cursor-pointer active:scale-[0.97]",
                size === "sm" ? "px-2.5 py-1.5" : "px-3.5 py-2",
                active ? "text-white" : "text-foreground"
              )}
            >
              {active && (
                <m.span
                  layoutId="segment-active"
                  className="absolute inset-0 rounded-full bg-foreground shadow-raised"
                  transition={spring.snappy}
                />
              )}
              <span className="relative z-10">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
