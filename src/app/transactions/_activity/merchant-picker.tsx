"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { IconCheck, IconChevronRight, IconInfoCircle, IconPlus, IconSearch, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "@/components/ui/category-icon";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { clearButtonVariants } from "@/components/clear/button-variants";

type MerchantOption = { id: number; name: string; icon: string | null; color: string | null; transactionCount: number };

// Merchant picker: pick one of the merchants already in use, or type a new name.
// Both paths go through POST /api/merchants, which get-or-creates by normalized name —
// so typing "albert heijn" when "Albert Heijn" exists reuses that profile.
export function MerchantPickerDialog({
  open,
  currentId,
  suggestion,
  subtitle,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  currentId: number | null;
  suggestion: string;
  /** Already formatted: which transaction this is for ("For Lotus · −€46,00"). */
  subtitle?: string;
  onOpenChange: (open: boolean) => void;
  onPick: (name: string) => void | Promise<void>;
}) {
  const t = useTranslations("activity.merchantPicker");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* z-[88]: reassignment can be started from the merchant profile, a body portal at
          z-70 that stays open behind this picker — without it the sheet opens underneath
          the profile and looks like nothing happened. */}
      <DialogContent
        hideHeaderRow
        title={t("title")}
        className="gap-5 pt-7 font-clear text-clear-ink"
        sheetClassName="z-[88]"
        overlayClassName="z-[88] backdrop-blur-lg bg-clear-primary/20"
      >
        <ClearDialogHeader title={t("title")} subtitle={subtitle} onClose={() => onOpenChange(false)} closeLabel={t("close")} />
        {/* Mounted only while open so the search box and selection reset per opening. */}
        {open && <MerchantPickerBody currentId={currentId} suggestion={suggestion} onPick={onPick} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

/** The matched part of a name, highlighted. */
function Highlight({ text, term }: { text: string; term: string }) {
  const at = term ? text.toLowerCase().indexOf(term) : -1;
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-[4px] bg-clear-butter text-inherit">{text.slice(at, at + term.length)}</mark>
      {text.slice(at + term.length)}
    </>
  );
}

function MerchantPickerBody({
  currentId,
  suggestion,
  onPick,
  onCancel,
}: {
  currentId: number | null;
  suggestion: string;
  onPick: (name: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations("activity.merchantPicker");
  const ids = useId();
  const [all, setAll] = useState<MerchantOption[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  // The chosen option: a merchant's id, "new" for the typed name, or null for none yet.
  const [choice, setChoice] = useState<number | "new" | null>(currentId);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/merchants")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setAll(Array.isArray(d) ? d : []); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const term = query.trim().toLowerCase();
  const matches = term ? all.filter((m) => m.name.toLowerCase().includes(term)) : all;
  const exact = all.some((m) => m.name.toLowerCase() === term);
  const canAdd = !!term && !exact;

  // What Save (or Enter) picks: the selected option; while typing with nothing
  // selected, the only match or else the new name.
  const chosenName =
    choice === "new"
      ? query.trim()
      : choice != null
        ? all.find((m) => m.id === choice)?.name ?? null
        : matches.length === 1
          ? matches[0].name
          : canAdd
            ? query.trim()
            : null;
  const unchanged = choice != null && choice === currentId;

  async function pick(name: string | null) {
    if (!name || saving) return;
    setSaving(true);
    await onPick(name);
    setSaving(false);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!unchanged) pick(chosenName);
      }}
      // Auto height: the dialog grows with the list, and only once it reaches the
      // screen's height does the list (not the search or the buttons) scroll.
      className="flex min-h-0 flex-col gap-5"
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={`${ids}-search`} className="text-[13px] font-bold text-clear-ink-2">
          {t("find")}
        </label>
        <div className="flex h-[52px] items-center gap-2.5 rounded-clear-row border-[1.5px] border-transparent bg-clear-tile pr-1.5 pl-4 text-clear-muted transition-colors focus-within:border-clear-ember focus-within:bg-clear-card focus-within:ring-4 focus-within:ring-clear-ember/20">
          <IconSearch className="size-[18px] shrink-0" stroke={2} aria-hidden />
          <input
            id={`${ids}-search`}
            type="text"
            autoComplete="off"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              // Typing starts a new search; a selection from before no longer applies.
              setChoice(null);
            }}
            aria-describedby={`${ids}-hint`}
            className="h-full min-w-0 flex-1 bg-transparent p-0 text-base font-bold text-clear-ink outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("clear")}
              className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-clear-ground text-clear-ink-2"
            >
              <IconX className="size-4" stroke={2.2} />
            </button>
          )}
        </div>
        <span id={`${ids}-hint`} className="text-[13px] text-clear-muted">
          {suggestion ? t("searchSuggestion", { suggestion }) : t("search")}
        </span>
      </div>

      <div className="flex min-h-0 flex-col gap-2">
        {!loading && (term || matches.length > 0) && (
          <span className="text-[13px] font-bold text-clear-ink-2">{term ? t("matches", { count: matches.length }) : t("all", { count: matches.length })}</span>
        )}
        <div role="listbox" aria-label={t("title")} className="clear-scrollbar -mx-1 flex min-h-0 flex-col gap-1 overflow-y-auto px-1 py-0.5">
          {loading && <p className="m-0 px-3 py-2 text-[13px] text-clear-muted">{t("loading")}</p>}
          {matches.map((m) => {
            const on = choice === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => setChoice(m.id)}
                onDoubleClick={() => pick(m.name)}
                className={cn(
                  "flex min-h-16 w-full shrink-0 cursor-pointer items-center gap-3 rounded-clear-row pr-3 pl-2.5 text-left transition-colors",
                  on ? "bg-clear-tile ring-2 ring-clear-ink ring-inset" : "hover:bg-clear-tile",
                )}
              >
                <span aria-hidden className="inline-flex shrink-0 [&>*]:size-11! [&>*]:rounded-clear-icon!">
                  <CategoryIcon icon={m.icon} color={m.color} size="md" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn("truncate text-[15px]", on ? "font-extrabold" : "font-bold")}>
                      <Highlight text={m.name} term={term} />
                    </span>
                    {m.id === currentId && (
                      <span className="inline-flex h-[22px] shrink-0 items-center rounded-full bg-clear-card px-2 text-xs font-bold text-clear-ink-2">{t("current")}</span>
                    )}
                  </span>
                  <span className="text-[13px] text-clear-muted">{t("count", { count: m.transactionCount })}</span>
                </span>
                {on && (
                  <span aria-hidden className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-full bg-clear-primary text-clear-primary-ink">
                    <IconCheck className="size-4" stroke={2.6} />
                  </span>
                )}
              </button>
            );
          })}
          {canAdd && (
            <button
              type="button"
              role="option"
              aria-selected={choice === "new"}
              onClick={() => setChoice("new")}
              onDoubleClick={() => pick(query.trim())}
              className={cn(
                "mt-1 flex min-h-[60px] w-full shrink-0 cursor-pointer items-center gap-3 rounded-clear-row border-[1.5px] border-dashed pr-3 pl-2.5 text-left transition-colors",
                choice === "new" ? "border-clear-ink bg-clear-tile" : "border-clear-line hover:bg-clear-tile",
              )}
            >
              <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-clear-icon bg-clear-ground text-clear-ink">
                <IconPlus className="size-[18px]" stroke={2.2} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-bold">{t("add", { name: query.trim() })}</span>
                <span className="text-[13px] text-clear-muted">{t("addHint")}</span>
              </span>
              <IconChevronRight className="size-4 shrink-0 text-clear-muted" stroke={2.2} aria-hidden />
            </button>
          )}
          {!loading && matches.length === 0 && !term && <p className="m-0 px-3 py-2 text-[13px] text-clear-muted">{t("none")}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-3.5 border-t border-clear-line pt-4">
        <span className="flex items-start gap-2 text-[13px] leading-snug font-medium text-clear-ink-2">
          <IconInfoCircle className="mt-px size-4 shrink-0" stroke={2} aria-hidden />
          {t("footerHint")}
        </span>
        <ClearDialogFooter>
          <button type="button" onClick={onCancel} className={clearButtonVariants({ variant: "secondary" })}>
            {t("cancel")}
          </button>
          <button type="submit" disabled={!chosenName || unchanged || saving} className={clearButtonVariants()}>
            {t("save")}
          </button>
        </ClearDialogFooter>
      </div>
    </form>
  );
}
