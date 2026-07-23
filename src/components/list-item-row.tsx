import { cn } from "@/lib/utils";

interface ListItemRowProps {
  icon: React.ReactNode;
  name: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}

export function ListItemRow({ icon, name, subtitle, right, className }: ListItemRowProps) {
  return (
    <div className={cn("flex items-center gap-5 px-6 py-3", className)}>
      {icon}
      <div className="flex-1 min-w-0">
        <div className="text-base font-medium truncate leading-tight">{name}</div>
        {subtitle && <div className="text-sm text-foreground/60 mt-0.5 truncate">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}
