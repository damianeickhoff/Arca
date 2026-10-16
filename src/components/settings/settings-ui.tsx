"use client";

import { useId } from "react";
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle, IconSearch } from "@tabler/icons-react";
import { ClearSwitch } from "@/components/clear/switch";
import { cn } from "@/lib/utils";

// Small building blocks shared by the Settings panels (Clear). They take translated
// strings only — never user-facing text of their own.

/** An inline notice inside a panel or dialog: an error (role=alert), a success
 *  (role=status) or a neutral note. Replaces the old alert() popups. */
export function SettingsNotice({
  tone = "error",
  children,
  className,
}: {
  tone?: "error" | "success" | "info" | "warning";
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === "error" || tone === "warning" ? IconAlertTriangle : tone === "success" ? IconCircleCheck : IconInfoCircle;
  return (
    <div
      role={tone === "error" ? "alert" : tone === "success" ? "status" : "note"}
      className={cn(
        "flex items-start gap-3 rounded-clear-tile px-4 py-3 font-clear text-sm leading-[1.5] font-semibold",
        tone === "error" && "bg-clear-rose text-clear-rose-ink",
        tone === "success" && "bg-clear-mint text-clear-mint-ink",
        tone === "info" && "bg-clear-sky text-clear-sky-ink",
        tone === "warning" && "bg-clear-butter text-clear-butter-ink",
        className,
      )}
    >
      <Icon aria-hidden size={18} stroke={2} className="mt-px shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

/** A titled block inside a panel: 18px title, optional subtitle, one action on the right. */
export function SettingsSection({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn("flex flex-col gap-4 font-clear text-clear-ink", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={id} className="m-0 text-lg font-bold">{title}</h3>
          {subtitle && <span className="text-sm text-clear-muted">{subtitle}</span>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** The empty state inside a panel: a dashed tile with a shape, one sentence and,
 *  where useful, the action that fills it. */
export function SettingsEmpty({
  icon,
  children,
  action,
  className,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-clear-tile border-2 border-dashed border-clear-line px-5 py-8 text-center font-clear",
        className,
      )}
    >
      {icon && (
        <span aria-hidden className="inline-flex size-12 items-center justify-center rounded-clear-tile bg-clear-tile text-clear-ink-2 [&_svg]:size-6">
          {icon}
        </span>
      )}
      <p className="m-0 max-w-[360px] text-sm text-clear-ink-2">{children}</p>
      {action}
    </div>
  );
}

/** A grey row with an icon tile, a label + hint and a switch on the right. */
export function SettingsSwitchRow({
  icon,
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  hint?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-3.5 rounded-clear-tile bg-clear-tile px-4 py-3.5 font-clear text-clear-ink">
      {icon && (
        <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-clear-icon bg-clear-card text-clear-ink [&_svg]:size-5">
          {icon}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id={`${id}-label`} className="text-[15px] font-bold">{label}</span>
        {hint && <span className="text-[13px] text-clear-muted">{hint}</span>}
      </span>
      <ClearSwitch checked={checked} onCheckedChange={onCheckedChange} labelledBy={`${id}-label`} disabled={disabled} />
    </div>
  );
}

/** A search field that filters a panel's own list. `label` is the accessible name. */
export function SettingsSearch({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-12 items-center gap-2.5 rounded-clear-row border-[1.5px] border-transparent bg-clear-tile px-4 font-clear transition-colors focus-within:border-clear-ink",
        className,
      )}
    >
      <IconSearch aria-hidden size={18} stroke={2} className="shrink-0 text-clear-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="min-w-0 flex-1 border-none bg-transparent p-0 text-[15px] text-clear-ink outline-none placeholder:text-clear-placeholder"
      />
    </div>
  );
}

/** A round icon-only button for row actions (edit, delete). `label` is required. */
export function RowIconButton({
  label,
  onClick,
  disabled,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-clear-tile outline-none transition-colors hover:bg-clear-line focus-visible:ring-3 focus-visible:ring-clear-ember/50 disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-[18px]",
        danger ? "text-clear-negative" : "text-clear-ink",
      )}
    >
      {children}
    </button>
  );
}
