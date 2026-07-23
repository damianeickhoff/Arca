"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { Drawer } from "vaul"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { IconXFilled as XIcon } from "@tabler/icons-react"
import { useIsMobile } from "@/lib/use-is-mobile"
import { acquireNavHidden } from "@/lib/nav-visibility"
import { useKeyboardHeight } from "@/lib/use-keyboard-height"
import { useContainerScrolled } from "@/lib/use-scroll-elevation"

// Mask for the sticky top scroll-blur (see DialogContent's scrollBlur prop): opaque
// at the top so the blur is strongest against the header, fading to transparent below.
const HEADER_SCROLL_FADE = "linear-gradient(to bottom, black 0%, black 45%, transparent 100%)";

// True when the nearest Dialog is rendered as a vaul bottom sheet.
const DialogSheetContext = React.createContext(false);

// True when rendered inside dialog content — nested dialogs use Drawer.NestedRoot
// so sheets stack correctly rather than fighting for the same gesture tracker.
const NestedDialogContext = React.createContext(false);

// Cancel a vaul/Radix "interact outside" dismissal when the event originates from an
// element marked [data-dialog-keep-open]. Used for controls a sheet owns but renders
// through a body portal (so they're outside its DOM), e.g. a floating search bar.
function keepOpenOnOutside(e: { detail?: { originalEvent?: Event }; preventDefault: () => void }) {
  const target = e.detail?.originalEvent?.target;
  if (target instanceof Element && target.closest("[data-dialog-keep-open]")) {
    e.preventDefault();
  }
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

function Dialog({
  open,
  onOpenChange,
  children,
  ...props
}: DialogPrimitive.Root.Props) {
  const isNested = React.useContext(NestedDialogContext);
  const rawMobile = useIsMobile();
  const useMobileSheet = rawMobile;

  // Hide the bottom nav while a mobile dialog is actually open, so it doesn't
  // show through beneath the sheet. Tie to `open` (not mount) because the mobile
  // sheet stays mounted while closed.
  React.useEffect(() => {
    if (!useMobileSheet || !open) return;
    return acquireNavHidden();
  }, [useMobileSheet, open]);

  // WebKit bug: toggling `overflow` on the sticky positioning context's scrolling
  // ancestor (<html>, locked via the `html:has([data-vaul-drawer])` rule in
  // globals.css while the sheet is open) can leave `position: sticky` page headers
  // "unstuck" — they render at their static document-flow offset (i.e. scrolled
  // off-screen, if the page wasn't at the very top) instead of pinned to the
  // viewport, and stay that way until the next real scroll event. Since scrolling
  // is locked, that never happens on its own — nudge scrollTop by a sub-pixel and
  // back right after the lock engages, forcing Safari to recompute sticky
  // positions against the frozen offset instead of leaving them detached.
  React.useEffect(() => {
    if (!useMobileSheet || !open) return;
    const raf = requestAnimationFrame(() => {
      const html = document.documentElement;
      const y = html.scrollTop;
      html.scrollTop = y + 1;
      html.scrollTop = y;
    });
    return () => cancelAnimationFrame(raf);
  }, [useMobileSheet, open]);

  // Bring the focused field into view above the keyboard ourselves, instead of
  // relying on vaul's own repositioning (disabled below, see repositionInputs)
  // or whatever the platform does natively — both were shoving the whole sheet
  // around unpredictably in an iOS standalone PWA. `scroll-padding-bottom` on the
  // scrollable content area (set from the live keyboard height, see the `footer`
  // padding below for the matching value) tells `scrollIntoView` to treat the
  // keyboard's footprint as outside the visible area, so this only moves the
  // dialog's own internal scroll position — it never touches the sheet's size or
  // position, so it can't fight anything else that does.
  React.useEffect(() => {
    if (!useMobileSheet || !open) return;
    function onFocusIn(e: FocusEvent) {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (!["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (!target.closest("[data-vaul-drawer]")) return;
      // Opt-out for inputs already pinned above the keyboard (e.g. a sticky search
      // bar at the bottom of a full-height sheet): centering them would drag the
      // whole list up. With interactiveWidget:"resizes-content" the sheet shrinks
      // to sit above the keyboard on its own, so no scroll is needed.
      if (target.hasAttribute("data-no-keyboard-scroll")) return;
      // Let the keyboard's open animation (and the resulting scroll-padding
      // update) settle before measuring where to scroll to. `"nearest"` (not
      // `"center"`) moves the scroll position the minimum amount needed to clear
      // the keyboard — if the field is already visible above it, this is a no-op.
      // `"center"` was recentering every focused field regardless, which visibly
      // yanked the dialog's content up even when no scroll was actually needed.
      setTimeout(() => {
        target.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 300);
    }
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [useMobileSheet, open]);

  if (useMobileSheet) {
    const Root = isNested ? Drawer.NestedRoot : Drawer.Root;
    return (
      <DialogSheetContext.Provider value={true}>
        <Root
          open={open}
          onOpenChange={onOpenChange as ((open: boolean) => void) | undefined}
          // Vaul's built-in scroll lock sets `position: fixed !important` on
          // <body> (Safari/standalone PWA) or `overflow: hidden` (elsewhere),
          // both of which turn <body> into a positioned/scroll context and break
          // `position: sticky` on the page headers — when the page is scrolled,
          // the sticky header snaps to its static (scrolled-off) position and
          // vanishes. Disable it and rely on the sticky-safe html-level lock in
          // globals.css (html:has([data-vaul-drawer])) instead.
          disablePreventScroll
          // Vaul's own keyboard-avoidance (on by default) imperatively rewrites the
          // sheet's `style.height`/`style.bottom` on every VisualViewport resize
          // event, using its own "is this drawer tall enough" heuristic. In an iOS
          // standalone PWA that calculation goes wrong for our taller forms — it was
          // shrinking + shoving the sheet up far past where the keyboard actually
          // starts, cutting the bottom of the form off above the top of the screen.
          // Disabling it here means we're not fighting two systems: the platform's
          // own viewport-resize behavior (interactiveWidget: "resizes-content" in
          // layout.tsx) is what positions the sheet correctly instead.
          repositionInputs={false}
        >
          {children as React.ReactNode}
        </Root>
      </DialogSheetContext.Provider>
    );
  }

  return (
    <DialogSheetContext.Provider value={false}>
      <DialogPrimitive.Root
        data-slot="dialog"
        open={open}
        onOpenChange={onOpenChange}
        {...props}
      >
        {children}
      </DialogPrimitive.Root>
    </DialogSheetContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Trigger / Portal / Overlay / Close — desktop pass-throughs
// ---------------------------------------------------------------------------

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ children, ...props }: DialogPrimitive.Close.Props) {
  const isMobile = React.useContext(DialogSheetContext);
  if (isMobile) {
    return <Drawer.Close asChild>{children as React.ReactElement}</Drawer.Close>;
  }
  return <DialogPrimitive.Close data-slot="dialog-close" {...props}>{children}</DialogPrimitive.Close>;
}

function DialogOverlay({
  className,
  forceRender = true,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      forceRender={forceRender}
      className={cn(
        "fixed inset-0 isolate z-50 duration-200 ease-out data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:duration-150 data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

// ---------------------------------------------------------------------------
// Content — the main switch: bottom sheet on mobile, centered on desktop
// ---------------------------------------------------------------------------

function DialogContent({
  className,
  sheetClassName,
  overlayClassName,
  accentColor,
  hideHandle = false,
  hideHeaderRow = false,
  fullHeight = false,
  flushBottom = false,
  scrollBlur = false,
  headerAction,
  title,
  footer,
  children,
  ...props
}: DialogPrimitive.Popup.Props & { overlayClassName?: string; sheetClassName?: string; accentColor?: string | null; hideHandle?: boolean; hideHeaderRow?: boolean; fullHeight?: boolean; flushBottom?: boolean; scrollBlur?: boolean; headerAction?: React.ReactNode; title?: React.ReactNode; footer?: React.ReactNode }) {
  const isMobile = React.useContext(DialogSheetContext);
  // Only ever adds padding, never repositions anything — see the hook and the
  // focusin handler in <Dialog> above for why that asymmetry matters here.
  const keyboardHeight = useKeyboardHeight(isMobile);
  // Drives the header row's transparent-until-scrolled backdrop below — the header
  // sits as a sibling of the scrollable content div (not nested inside it), so its
  // scroll state has to be tracked off this ref rather than auto-detected.
  const contentScrollRef = React.useRef<HTMLDivElement>(null);
  const contentScrolled = useContainerScrolled(contentScrollRef);

  // Wrap children so any dialog opened from inside is treated as nested
  const wrappedChildren = (
    <NestedDialogContext.Provider value={true}>
      {children}
    </NestedDialogContext.Provider>
  );

  const wash = accentColor ? (
    <div
      aria-hidden
      className={cn(
        "absolute inset-x-0 top-0 pointer-events-none",
        isMobile ? "h-72" : "h-52 rounded-t-xl"
      )}
      // An ellipse (not a circle) so the wash always reaches the full width of the
      // card regardless of aspect ratio — a circle's farthest-corner sizing shrinks
      // horizontally on wide-but-short cards, fading out well before the edges.
      style={{ background: `radial-gradient(ellipse 90% 90% at top, ${accentColor}45, transparent 80%)` }}
    />
  ) : null;

  if (isMobile) {
    return (
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[22px]" />
        <Drawer.Content
          // Don't dismiss when the interaction is with an element the sheet owns but
          // that's portalled outside its DOM (e.g. the category picker's floating
          // search bar, which lives on <body> to stay viewport-fixed). Both the
          // pointer-down and the focus that follows would otherwise read as "outside".
          onPointerDownOutside={keepOpenOnOutside}
          onFocusOutside={keepOpenOnOutside}
          className={cn(
            "fixed bottom-0 left-0 right-0 z-50 flex flex-col outline-none overflow-hidden will-change-transform",
            "rounded-t-4xl bg-[var(--dialog-background)]",
            // hideHeaderRow callers render their own header as the first child and own
            // its top spacing entirely — adding this on top just double-pads it.
            // fullHeight sheets sit flush against the true top of the screen (no
            // rounded gap to fill), so this gap doesn't apply to them either — their
            // header row supplies its own safe-area-aware top spacing below.
            !hideHeaderRow && !fullHeight && "pt-3",
            fullHeight ? "h-[100dvh] max-h-[100dvh] rounded-t-none" : "max-h-[92dvh]",
            sheetClassName,
          )}
        >
          {wash}
          {/* close button + optional title — the drag-handle pill is no longer drawn.
              Top spacing is a flat 20px everywhere: combined with the sheet's own pt-3
              (12px) above, this row's pt-2 (8px) lands the icon 20px from the top;
              hideHandle no longer changes the top offset, only the mb-4/mb-5 spacing
              below the row. fullHeight sheets sit flush against the true top of the
              screen (h-100dvh, no gap above them like the normal bottom-anchored sheets
              have, and no pt-3 from the sheet wrapper either — see above), so their
              close/filter buttons compute the same 20px directly off the safe area
              instead of stacking with the sheet's own padding.
              hideHeaderRow drops this entirely for callers that render their own fully
              custom header (back/close + title + actions) as the first child instead —
              a required (but visually hidden) Drawer.Title still renders for a11y. */}
          {hideHeaderRow ? (
            <Drawer.Title className="sr-only">{title ?? "Dialog"}</Drawer.Title>
          ) : (
            <div
              className={cn(
                "relative flex items-center justify-center shrink-0 px-4 min-h-11 z-10 transition-colors duration-300",
                fullHeight ? "pt-[calc(var(--sat)+20px)]" : "pt-2",
                hideHandle ? "mb-4" : "mb-5",
                contentScrolled && "border-b border-white/10",
              )}
              style={{
                backdropFilter: contentScrolled ? "blur(24px) saturate(180%)" : undefined,
                WebkitBackdropFilter: contentScrolled ? "blur(24px) saturate(180%)" : undefined,
                background: contentScrolled ? "color-mix(in srgb, #1c1c1e 70%, transparent)" : undefined,
              }}
            >
              {title && (
                <Drawer.Title className="font-heading text-lg font-semibold text-foreground">{title}</Drawer.Title>
              )}
              {/* Pinned via an explicit top offset (matching the row's own pt- above)
                  instead of flex/align-items centering — centering an absolutely
                  positioned item depends on the row's rendered content-box height,
                  which shifts depending on whether a title is present/how tall it
                  renders, so the icons would drift a few px between title-less and
                  titled headers instead of sitting at a fixed distance from the top. */}
              <Drawer.Close asChild>
                <button

                  className={cn(
                    "absolute size-11 left-[21px] rounded-full bg-white/60 dark:bg-white/7 backdrop-blur-lg flex items-center justify-center text-foreground transition-colors",
                    fullHeight ? "top-[calc(var(--sat)+20px)]" : "top-2",
                  )}
                  aria-label="Close"
                >
                  <XIcon className="size-5" />
                </button>
              </Drawer.Close>
              {headerAction && (
                <div
                  className={cn(
                    "absolute right-[21px]",
                    fullHeight ? "top-[calc(var(--sat)+20px)]" : "top-2",
                  )}
                >
                  {headerAction}
                </div>
              )}
            </div>
          )}
          {/* overflow-y-auto here (inside data-vaul-no-drag) so vaul doesn't intercept scroll as a drag gesture */}
          <div
            ref={contentScrollRef}
            className={cn(
              "relative flex flex-col gap-4 overflow-y-auto px-6",
              // The nav bar is hidden while any dialog is open, so no extra
              // clearance is needed for it — content sits at the natural bottom.
              // flushBottom drops the clearance entirely (content runs to the edge).
              flushBottom ? "pb-0" : "pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
              fullHeight && "flex-1 min-h-0",
              className,
            )}
            style={{ scrollPaddingBottom: keyboardHeight || undefined }}
            data-vaul-no-drag=""
          >
            {/* Progressive backdrop-blur pinned to the top of the scroll area, so content
                softly blurs + fades as it scrolls up under the header. Sticky (not fixed)
                so it tracks the scroll viewport; the negative margin cancels its own box +
                the flex gap so it overlays the first content instead of displacing it. */}
            {scrollBlur && (
              // Mask on the wrapper, blur on the inner child: Chromium drops
              // backdrop-filter when the SAME element also carries a mask, so they
              // must live on separate elements for the progressive fade to render.
              <div
                aria-hidden
                className="pointer-events-none sticky top-0 z-10 -mx-6 h-8 shrink-0"
                style={{
                  marginBottom: "calc(-2rem - 1rem)",
                  maskImage: HEADER_SCROLL_FADE,
                  WebkitMaskImage: HEADER_SCROLL_FADE,
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{ backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
                />
              </div>
            )}
            {wrappedChildren}
          </div>
          {/* Rendered as a sibling of the scrollable div, not inside it, so it's
              structurally guaranteed to stay in view — a `sticky` footer inside the
              scroll area is at the mercy of vaul's own transforms on the drawer
              during open/drag/close, which can detach sticky positioning entirely.
              The extra bottom padding (only added while the keyboard is actually
              open) is deliberately generous rather than exact — this only ever adds
              space above the keyboard, it never repositions the sheet, so
              over-estimating just means a bit of extra clearance, never a hidden button. */}
          {footer && (
            <div
              className="shrink-0 px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 bg-none"
              style={keyboardHeight ? { paddingBottom: `calc(1rem + ${keyboardHeight}px)` } : undefined}
            >
              {footer}
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    );
  }

  return (
    <DialogPortal>
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-white border-1 border-foreground/10 backdrop-blur-xl backdrop-saturate-180 p-7 text-sm text-foreground duration-200 ease-out outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:duration-150 data-closed:fade-out-0 data-closed:zoom-out-95",
          className,
          sheetClassName
        )}
        {...props}
      >
        {wash}
        {/* hideHeaderRow callers render their own title inline as part of children —
            still emit a visually-hidden Title for the same a11y reason as the mobile
            branch's sr-only fallback, just so this Popup always has an accessible name. */}
        {title && (
          hideHeaderRow ? (
            <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          ) : (
            <DialogPrimitive.Title className="font-heading text-lg font-semibold text-foreground text-center">
              {title}
            </DialogPrimitive.Title>
          )
        )}
        {wrappedChildren}
        {footer && (
          // Desktop's Popup doubles as its own scroll container (callers set
          // max-h/overflow-y-auto on it directly, no separate inner div like the
          // mobile sheet has), so `sticky` here is safe — unlike vaul's drawer,
          // this modal isn't being transformed/animated while open.
          <div className="sticky bottom-0 z-10 -mx-7 -mb-7 px-7 py-4 bg-background/95 backdrop-blur-md rounded-b-xl">
            {footer}
          </div>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

// ---------------------------------------------------------------------------
// Header — close button uses Drawer.Close or DialogPrimitive.Close
// ---------------------------------------------------------------------------

function DialogHeader({
  className,
  children,
  showCloseButton = true,
  actions,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
  actions?: React.ReactNode
}) {
  const isMobile = React.useContext(DialogSheetContext);

  return (
    <div
      data-slot="dialog-header"
      className={cn("flex items-center justify-between gap-3", className)}
      {...props}
    >
      <div className="flex flex-col gap-2 min-w-0">{children}</div>
      <div className="flex items-center gap-2 shrink-0">
        {actions}
        {showCloseButton && !isMobile && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="shrink-0 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive dark:hover:bg-foreground/80 size-9"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & { showCloseButton?: boolean }) {
  const isMobile = React.useContext(DialogSheetContext);

  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        // A plain content-flow footer row — for a footer that stays pinned in view
        // while the rest of the dialog scrolls, pass it via DialogContent's `footer`
        // prop instead (renders as a true sibling of the scrollable area, not a
        // `sticky` child of it — sticky positioning here is unreliable because it's
        // nested inside vaul's own animated/transformed drawer content).
        "flex flex-col-reverse gap-2 bg-none py-4 sm:flex-row sm:justify-end",
        isMobile ? "-mx-6 px-6" : "-mx-7 -mb-7 px-7 rounded-b-xl",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        isMobile ? (
          <Drawer.Close asChild>
            <Button variant="outline">Close</Button>
          </Drawer.Close>
        ) : (
          <DialogPrimitive.Close render={<Button variant="outline" />}>
            Close
          </DialogPrimitive.Close>
        )
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Title / Description
// ---------------------------------------------------------------------------

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  const isMobile = React.useContext(DialogSheetContext);

  if (isMobile) {
    return (
      <Drawer.Title
        className={cn("font-heading text-base leading-none font-medium", className)}
        {...props as React.ComponentProps<"div">}
      />
    );
  }

  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading text-base leading-none font-medium", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  const isMobile = React.useContext(DialogSheetContext);

  if (isMobile) {
    return (
      <Drawer.Description
        className={cn(
          "text-sm text-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
          className
        )}
        {...props as React.ComponentProps<"div">}
      />
    );
  }

  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
