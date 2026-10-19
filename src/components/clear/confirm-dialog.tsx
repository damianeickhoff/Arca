"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { IconTrash } from "@tabler/icons-react";

import { Dialog, DialogContent, DialogDescription } from "@/components/ui/dialog";
import { ClearButton } from "@/components/clear/button";
import { IconTile } from "@/components/clear/icon-tile";
import { cn } from "@/lib/utils";
import { MoneyText } from "@/components/clear/money";

/**
 * The Clear confirm dialog (Popup-Small): a title, one sentence, Cancel and a
 * confirm button — black, or red for something that can't be undone. A centred 400px
 * modal from lg, a bottom sheet on phones (the shared Dialog does both).
 *
 * It sits above every other sheet (z-100) and is a Radix layer like them, so opened
 * on top of an open sheet it stacks instead of closing it. Taps inside it are marked
 * data-dialog-keep-open, so a base-ui dialog underneath doesn't read them as a tap
 * outside either.
 *
 * Takes translated strings only. Most callers want the hook instead:
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: t("deleteTitle"), body: t("deleteBody"), confirmLabel: t("delete"), destructive: true }))) return;
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  altLabel,
  onAlt,
}: {
  open: boolean;
  /** Called with false for Cancel, Escape and a tap outside. */
  onOpenChange: (open: boolean) => void;
  title: string;
  body?: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  /** A second answer besides Cancel and the confirm button (see useChoice). */
  altLabel?: string;
  onAlt?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideHeaderRow
        title={title}
        // Three answers need the room on desktop; a plain confirm stays compact.
        sheetClassName={cn("z-[100]", altLabel ? "lg:max-w-[560px]" : "lg:max-w-[400px]")}
        overlayClassName="z-[100]"
        className="pt-6 font-clear text-clear-ink lg:pb-6"
      >
        <div data-dialog-keep-open="" className="flex flex-col gap-3.5">
          <div className="flex items-center gap-3.5">
            {destructive && (
              <IconTile size="md" className="size-12 bg-clear-negative/12 text-clear-negative [&_svg]:size-6">
                <IconTrash stroke={1.9} />
              </IconTile>
            )}
            <h2 className="m-0 text-xl font-extrabold tracking-[-0.02em]">{title}</h2>
          </div>
          {body && (
            <DialogDescription className="m-0 text-[15px] leading-normal text-clear-ink-2 [&_b]:font-bold [&_b]:text-clear-ink [&_strong]:font-bold [&_strong]:text-clear-ink">
              <MoneyText>{body}</MoneyText>
            </DialogDescription>
          )}
          {/* Three answers stack on phones, the confirm button on top; on desktop they
              sit in a row that wraps when the labels are long. */}
          <div className={cn("flex gap-2.5 pt-1.5 lg:flex-row lg:flex-wrap lg:justify-end", altLabel && "flex-col-reverse")}>
            <ClearButton variant="secondary" className="flex-1 lg:flex-none" onClick={() => onOpenChange(false)}>
              {cancelLabel}
            </ClearButton>
            {altLabel && (
              <ClearButton variant="outline" className="flex-1 lg:flex-none" onClick={onAlt}>
                {altLabel}
              </ClearButton>
            )}
            <ClearButton
              variant="primary"
              className={cn("flex-1 lg:flex-none", destructive && "bg-clear-negative text-clear-card")}
              onClick={onConfirm}
            >
              {destructive && <IconTrash stroke={2} />}
              {confirmLabel}
            </ClearButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export interface ConfirmOptions {
  /** Already translated: the question, e.g. "Delete this transaction?". */
  title: string;
  /** Already translated: one sentence on what happens. */
  body?: React.ReactNode;
  /** Already translated; defaults to "Confirm" (or "Delete" when destructive). */
  confirmLabel?: string;
  /** Already translated; defaults to "Cancel". */
  cancelLabel?: string;
  /** A red confirm button with a bin icon, for something that can't be undone. */
  destructive?: boolean;
}

export interface ChoiceOptions extends ConfirmOptions {
  /** Already translated: the second answer, between Cancel and the confirm button. */
  altLabel: string;
}

/** The answer to a choice: the confirm button, the second answer, or null for Cancel. */
export type Choice = "confirm" | "alt" | null;

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
type ChooseFn = (options: ChoiceOptions) => Promise<Choice>;
type AskFn = (options: ConfirmOptions & { altLabel?: string }) => Promise<Choice>;

const ConfirmContext = createContext<AskFn | null>(null);

/** The one confirm dialog, mounted once by the app shell (inside SearchProvider). */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("confirmDialog");
  const [request, setRequest] = useState<{ options: ConfirmOptions & { altLabel?: string }; open: boolean } | null>(null);
  const resolveRef = useRef<((choice: Choice) => void) | null>(null);

  // useConfirm asks through this too, without a second answer.
  const ask = useCallback<AskFn>(
    (options) =>
      new Promise<Choice>((resolve) => {
        // A second request while one is still open answers the first with "no".
        resolveRef.current?.(null);
        resolveRef.current = resolve;
        setRequest({ options, open: true });
      }),
    [],
  );

  function settle(choice: Choice) {
    resolveRef.current?.(choice);
    resolveRef.current = null;
    // Keep the options while the dialog animates closed.
    setRequest((current) => (current ? { ...current, open: false } : current));
  }

  const options = request?.options;

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {options && (
        <ConfirmDialog
          open={request.open}
          onOpenChange={(open) => {
            if (!open) settle(null);
          }}
          title={options.title}
          body={options.body}
          destructive={options.destructive}
          confirmLabel={options.confirmLabel ?? (options.destructive ? t("delete") : t("confirm"))}
          cancelLabel={options.cancelLabel ?? t("cancel")}
          onConfirm={() => settle("confirm")}
          altLabel={options.altLabel}
          onAlt={() => settle("alt")}
        />
      )}
    </ConfirmContext.Provider>
  );
}

/**
 * Ask before doing something: resolves true when the user confirms, false on Cancel,
 * Escape or a tap outside. Pass translated text; the button labels default to
 * confirmDialog.confirm / .delete / .cancel.
 *
 *   const confirm = useConfirm();
 *   async function remove() {
 *     const ok = await confirm({ title: t("deleteTitle"), body: t("deleteBody"), destructive: true });
 *     if (!ok) return;
 *     ...
 *   }
 *
 * Outside the app shell (a test rendering one component) it falls back to the
 * browser's own confirm, so callers never need a guard.
 */
export function useConfirm(): ConfirmFn {
  const ask = useContext(ConfirmContext);
  return useMemo(
    () =>
      ask
        ? (options: ConfirmOptions) => ask(options).then((choice) => choice === "confirm")
        : (options: ConfirmOptions) => Promise.resolve(window.confirm(options.title)),
    [ask],
  );
}

/**
 * Ask with two answers besides Cancel: resolves "confirm" for the confirm button (the
 * default, drawn black), "alt" for `altLabel` and null for Cancel, Escape or a tap
 * outside.
 *
 *   const choose = useChoice();
 *   const choice = await choose({ title, body, confirmLabel: t("keep"), altLabel: t("revert") });
 *   if (choice == null) return;
 *
 * Outside the app shell it falls back to the browser's confirm: OK is "confirm".
 */
export function useChoice(): ChooseFn {
  const ask = useContext(ConfirmContext);
  return useMemo(() => ask ?? ((options: ChoiceOptions) => Promise.resolve<Choice>(window.confirm(options.title) ? "confirm" : null)), [ask]);
}
