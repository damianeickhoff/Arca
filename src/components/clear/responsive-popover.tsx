"use client";

import { cloneElement } from "react";
import { Popover } from "@base-ui/react/popover";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { cn } from "@/lib/utils";

/**
 * A picker that is a popover anchored to its trigger on desktop and a bottom sheet on
 * phones — the filter chips' choosers. `trigger` is the chip (a <button>); the popover
 * opens from it, the sheet from a tap on it. `footer` sits under the content in both
 * (Apply, Select all); `sheet` passes extra props to the phone sheet only.
 */
export function ResponsivePopover({
  open,
  onOpenChange,
  title,
  trigger,
  children,
  footer,
  sheet,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Already translated: the sheet's title, the popover's accessible name. */
  title: string;
  trigger: React.ReactElement<React.ComponentProps<"button">>;
  children: React.ReactNode;
  footer?: React.ReactNode;
  sheet?: Omit<Partial<React.ComponentProps<typeof DialogContent>>, "children">;
  className?: string;
}) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      <Popover.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
        <Popover.Trigger render={trigger} />
        <Popover.Portal>
          <Popover.Positioner side="bottom" align="start" sideOffset={8} className="isolate z-[200] outline-none">
            <Popover.Popup
              className={cn(
                "flex max-h-[min(480px,var(--available-height))] w-80 origin-(--transform-origin) flex-col overflow-hidden rounded-clear-tile border border-clear-line bg-clear-card font-clear text-clear-ink shadow-clear-dialog outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-open:slide-in-from-top-1 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
                className,
              )}
            >
              <Popover.Title className="sr-only">{title}</Popover.Title>
              <div className="clear-scrollbar min-h-0 flex-1 overflow-y-auto p-1.5">{children}</div>
              {footer && <div className="border-t border-clear-line p-2.5">{footer}</div>}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  return (
    <>
      {cloneElement(trigger, { onClick: () => onOpenChange(true) })}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent title={title} footer={footer} {...sheet}>
          {children}
        </DialogContent>
      </Dialog>
    </>
  );
}
