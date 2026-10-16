"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogPanel } from "@/components/clear/dialog-chrome";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { cn } from "@/lib/utils";

/**
 * The budget editor's dialogs: a centred Clear modal from lg up, a bottom sheet on
 * phones. The header (a ClearDialogHeader) and footer stay put while the body scrolls.
 *
 * A BudgetDialog rendered inside another one's children stacks on top of it on both
 * sides — base-ui nests dialogs declared inside a popup, and the sheet picks up
 * vaul's nested root — so the "exceeds the overall budget" check can sit on top of
 * whichever dialog asked for it. Taps on a tip card (marked data-dialog-keep-open,
 * like the sheets' own escape hatch) don't count as a tap outside.
 *
 * The confirm dialog (useConfirm) opens on top of the desktop dialog: base-ui's modal
 * focus trap only wraps Tab with focus guards and never pulls focus back, so the
 * confirm (z-100, its own Radix focus trap) gets focus and clicks. Taps and Escape
 * inside it are ignored here, so answering the confirm never closes this dialog.
 */
export function BudgetDialog({
  open,
  onOpenChange,
  title,
  titleId,
  header,
  footer,
  children,
  size = "md",
  divider = false,
  initialFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Already translated: the sheet's accessible title. */
  title: string;
  /** The id ClearDialogHeader puts on its heading, which names the desktop dialog. */
  titleId: string;
  header: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  /** Desktop width, fitted to the content: md = 640–800px (the editor), sm = 440–560px (one question). */
  size?: "sm" | "md";
  /** A line above the footer, for dialogs whose body scrolls. */
  divider?: boolean;
  /** Desktop only: what gets focus when the dialog opens (default: the first control). */
  initialFocus?: React.RefObject<HTMLElement | null>;
}) {
  const isDesktop = useIsDesktop();

  if (!isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent hideHeaderRow title={title} footer={footer} className="gap-5 pt-6 font-clear text-clear-ink">
          {header}
          {children}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(next, details) => {
        if (!next && (details.reason === "outside-press" || details.reason === "escape-key")) {
          const target = details.event.target;
          // The confirm dialog (useConfirm) opens on top of this one as a Radix layer.
          // Its Escape listener runs first (capture phase) and marks the key handled;
          // base-ui would otherwise close this dialog on the same key press too.
          const handledAbove = details.reason === "escape-key" && details.event.defaultPrevented;
          if (handledAbove || (target instanceof Element && target.closest("[data-dialog-keep-open]"))) {
            details.cancel();
            return;
          }
        }
        onOpenChange(next);
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop
          forceRender
          className="fixed inset-0 z-[60] bg-black/40 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none"
        />
        <BaseDialog.Viewport className="fixed inset-0 z-[60] flex items-center justify-center p-6">
          <BaseDialog.Popup
            initialFocus={initialFocus}
            aria-labelledby={titleId}
            render={<ClearDialogPanel />}
            className={cn(
              "h-fit max-h-full w-fit gap-0 overflow-hidden p-0 outline-none transition-[opacity,scale] duration-200 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none",
              // Sized to the content between these bounds, so no text is ever cut off;
              // a body taller than the window scrolls inside.
              size === "sm" ? "min-w-[min(100%,440px)] max-w-[min(100%,560px)]" : "min-w-[min(100%,640px)] max-w-[min(100%,800px)]",
            )}
          >
            <div className="shrink-0 px-7 pt-7 pb-5">{header}</div>
            {children != null && (
              <div className="clear-scrollbar flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-7 pb-5">{children}</div>
            )}
            {footer && <div className={cn("shrink-0 px-7 pb-7", divider ? "border-t border-clear-ground pt-[18px]" : "pt-1")}>{footer}</div>}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
