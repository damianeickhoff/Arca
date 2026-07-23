import { cn } from "@/lib/utils";

export function ToggleSwitch({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "relative inline-flex h-7 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer",
        on ? "bg-black" : "bg-foreground/15"
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow transition-transform",
          on ? "translate-x-[19px]" : "translate-x-[4px]"
        )}
      />
    </span>
  );
}
