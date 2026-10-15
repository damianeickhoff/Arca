import { cn } from "@/lib/utils";

/** The Clear text input: 48px, grey fill, 14px radius, black border on focus. */
export function ClearInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-clear-row border-[1.5px] border-transparent bg-clear-tile px-4 font-clear text-[15px] text-clear-ink outline-none transition-colors placeholder:text-clear-placeholder focus:border-clear-ink aria-invalid:border-clear-negative-fill",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Label above, control, optional hint or error below. `htmlFor` must match the
 * control's id; the error replaces the hint and is announced with role="alert".
 */
export function ClearField({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5 font-clear", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-bold text-clear-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <span role="alert" className="text-[13px] font-semibold text-clear-negative">
          {error}
        </span>
      ) : (
        hint && <span className="text-[13px] text-clear-muted">{hint}</span>
      )}
    </div>
  );
}
