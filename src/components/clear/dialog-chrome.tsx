"use client";

import { IconX } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { MoneyText } from "@/components/clear/money";

/**
 * The visual parts of a Clear dialog, independent of how it opens (centred modal
 * on desktop, bottom sheet on phones — the behaviour stays in components/ui/dialog).
 * Panel: 28px radius, 28px padding, dialog shadow. Header: title + optional
 * subtitle and leading icon tile, round close button. Footer: an optional
 * destructive action on the left, secondary then primary on the right.
 */
export function ClearDialogPanel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex w-full flex-col gap-5 rounded-clear-dialog bg-clear-card p-7 font-clear text-clear-ink shadow-clear-dialog", className)}
      {...props}
    />
  );
}

export function ClearDialogHeader({
  title,
  subtitle,
  icon,
  onClose,
  closeLabel,
  titleId,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  onClose?: () => void;
  /** Already translated, e.g. t("common.close"). Required when onClose is set. */
  closeLabel?: string;
  titleId?: string;
}) {
  return (
    <div className="flex items-start gap-3.5">
      {icon}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id={titleId} className="m-0 text-[22px] font-extrabold tracking-[-0.02em]">
          {title}
        </h2>
        {subtitle && <p className="m-0 text-sm text-clear-muted"><MoneyText>{subtitle}</MoneyText></p>}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-clear-ground text-clear-ink transition-colors hover:bg-clear-line"
        >
          <IconX size={20} stroke={2} aria-hidden />
        </button>
      )}
    </div>
  );
}

export function ClearDialogFooter({ destructive, children }: { destructive?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 pt-1">
      {destructive}
      <span className="flex-1" />
      {children}
    </div>
  );
}
