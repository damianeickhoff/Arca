import { cn } from "@/lib/utils";

interface ListItemRowProps {
  icon: React.ReactNode;
  name: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  /** Makes the row a real button (with the app's usual press feedback) instead of a
   *  plain div — used by the merchant/category profiles, whose rows drill into the
   *  transaction detail sheet. */
  onClick?: () => void;
}

export function ListItemRow({ icon, name, subtitle, right, className, onClick }: ListItemRowProps) {
  const content = (
    <>
      {icon}
      <div className="flex-1 min-w-0">
        <div className="text-base font-medium truncate leading-tight">{name}</div>
        {subtitle && <div className="text-sm text-foreground/60 mt-0.5 truncate">{subtitle}</div>}
      </div>
      {right}
    </>
  );

  const base = "flex items-center gap-5 px-6 py-3";
  if (!onClick) return <div className={cn(base, className)}>{content}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(base, "w-full text-left active:bg-foreground/[0.05] transition-colors", className)}
    >
      {content}
    </button>
  );
}
