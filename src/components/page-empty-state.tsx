import type { ComponentType } from "react";

// The full-page "nothing here yet" state, copied from the goals page: a large,
// muted background icon, a bold title and a short subtext. Pages pair this with a
// FloatingAddButton at the bottom to invite the first item.
export function PageEmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-8" style={{ minHeight: "60vh" }}>
      <div className="size-16 rounded-xl bg-[var(--icon-muted)] border border-white/5 flex items-center justify-center mb-6 -rotate-10">
        <Icon className="size-8 text-foreground" />
      </div>
      <h2 className="text-xl font-bold mb-2">{title}</h2>
      {description && <p className="text-sm text-foreground/55 max-w-xs">{description}</p>}
    </div>
  );
}
