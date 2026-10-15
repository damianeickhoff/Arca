import { cn } from "@/lib/utils";

/**
 * A stat tile from the "This month" grid: label + round icon on top, a big figure,
 * and a foot line (delta chip or context). `highlight` gives the one ember tile per
 * grid; the others sit on the grey tile fill inside a white card.
 */
export function StatTile({
  label,
  value,
  icon,
  foot,
  highlight = false,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ReactNode;
  foot?: React.ReactNode;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2.5 rounded-[18px] p-4 font-clear",
        highlight ? "bg-clear-ember text-clear-ember-ink" : "bg-clear-tile text-clear-ink",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-bold">{label}</span>
        {icon && (
          <span
            aria-hidden
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-full [&_svg]:size-[18px]",
              highlight ? "bg-white/35" : "bg-clear-card",
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="text-[32px]">{value}</div>
      {foot && <div className={cn("text-[13px] font-semibold", !highlight && "text-clear-ink-2")}>{foot}</div>}
    </div>
  );
}
