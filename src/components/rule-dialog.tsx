"use client";

import { useEffect, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconCheck, IconChevronDown, IconInfoCircle, IconTag } from "@tabler/icons-react";
import { AnchoredTip } from "@/components/anchored-tip";
import { Amount } from "@/components/clear/amount";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField, ClearInput } from "@/components/clear/field";
import { Segmented } from "@/components/clear/segmented";
import { CategoryPickerSheet } from "@/components/category-picker";
import { Icon } from "@/components/icon";
import { RuleTest } from "@/components/rule-test";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { Bank, Category, CategoryRule } from "@/db/schema";
import { currencySymbol } from "@/lib/format";
import { cn } from "@/lib/utils";

export type RuleMatchType = "contains" | "word" | "exact";
export type RuleAmountMode = "none" | "exact" | "range";

/** The rule as the form edits it: amounts as typed ("12,50"), selects as strings. */
export interface RuleDraft {
  categoryId: number | null;
  pattern: string;
  matchType: RuleMatchType;
  amountMode: RuleAmountMode;
  amountExact: string;
  amountMin: string;
  amountMax: string;
  direction: "" | "income" | "expense";
  bankId: string;
}

/** The rule's columns as /api/category-rules stores them (without the category). */
export interface RuleFields {
  namePattern: string | null;
  nameWildcard: boolean;
  nameWholeWord: boolean;
  amount: number | null;
  amountMin: number | null;
  amountMax: number | null;
  direction: "income" | "expense" | null;
  bankId: number | null;
}

export interface RuleMatches {
  count: number;
  /** Matches without a category — the ones waiting in Needs review. */
  uncategorized: number;
  examples: { id: number; date: string; description: string; amount: number; direction: string }[];
  /** Every matched id; only when asked for (see fetchRuleMatches). */
  ids?: number[];
}

/** "12.5" → "12,50": amount inputs take a comma as the decimal separator. */
export const toRuleAmountInput = (n: number) => Math.abs(n).toFixed(2).replace(".", ",");
const AMOUNT_CHARS = /[^0-9.,]/g;
const parseAmount = (v: string) => {
  if (!v.trim()) return null;
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function emptyRuleDraft(categoryId: number | null = null): RuleDraft {
  return { categoryId, pattern: "", matchType: "contains", amountMode: "none", amountExact: "", amountMin: "", amountMax: "", direction: "", bankId: "" };
}

/** An existing rule, ready to edit. */
export function ruleDraftFromRule(rule: CategoryRule): RuleDraft {
  const range = rule.amountMin != null || rule.amountMax != null;
  return {
    categoryId: rule.categoryId,
    pattern: rule.namePattern ?? "",
    matchType: rule.nameWholeWord ? "word" : rule.nameWildcard ? "contains" : "exact",
    amountMode: range ? "range" : rule.amount != null ? "exact" : "none",
    amountExact: rule.amount != null ? toRuleAmountInput(rule.amount) : "",
    amountMin: rule.amountMin != null ? toRuleAmountInput(rule.amountMin) : "",
    amountMax: rule.amountMax != null ? toRuleAmountInput(rule.amountMax) : "",
    direction: rule.direction === "income" || rule.direction === "expense" ? rule.direction : "",
    bankId: rule.bankId != null ? String(rule.bankId) : "",
  };
}

export function ruleFieldsFromDraft(d: RuleDraft): RuleFields {
  return {
    namePattern: d.pattern.trim() || null,
    nameWildcard: d.matchType === "contains",
    nameWholeWord: d.matchType === "word",
    amount: d.amountMode === "exact" ? parseAmount(d.amountExact) : null,
    amountMin: d.amountMode === "range" ? parseAmount(d.amountMin) : null,
    amountMax: d.amountMode === "range" ? parseAmount(d.amountMax) : null,
    direction: d.direction || null,
    bankId: d.bankId ? Number(d.bankId) : null,
  };
}

function previewQuery(f: RuleFields): string {
  const q = new URLSearchParams();
  if (f.namePattern) q.set("pattern", f.namePattern);
  q.set("match", f.nameWholeWord ? "word" : f.nameWildcard ? "contains" : "exact");
  if (f.amount != null) q.set("amount", String(f.amount));
  if (f.amountMin != null) q.set("amountMin", String(f.amountMin));
  if (f.amountMax != null) q.set("amountMax", String(f.amountMax));
  if (f.direction) q.set("direction", f.direction);
  if (f.bankId != null) q.set("bankId", String(f.bankId));
  return q.toString();
}

/** What a rule matches among the transactions already there — the same matching the
 *  apply-rules pass does. `ids` also returns every matched id (for moving them). */
export async function fetchRuleMatches(fields: RuleFields, opts: { ids?: boolean } = {}): Promise<RuleMatches> {
  const res = await fetch(`/api/category-rules/preview?${previewQuery(fields)}${opts.ids ? "&ids=1" : ""}`);
  if (!res.ok) throw new Error("preview failed");
  return res.json();
}

/** The matched part of a description, highlighted. */
function Highlight({ text, term }: { text: string; term: string }) {
  const at = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-[4px] bg-clear-butter px-0.5 text-inherit">{text.slice(at, at + term.length)}</mark>
      {text.slice(at + term.length)}
    </>
  );
}

type LockedCategory = { name: string; icon: string | null; color: string | null };

interface RuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The rule to start from; the form resets to it on every opening. */
  initial: RuleDraft | null;
  title: string;
  subtitle?: string;
  /** With categories the category is a picker; with `category` it's shown, fixed. */
  categories?: Category[];
  category?: LockedCategory;
  /** Accounts to offer the direction and account conditions for (Settings). */
  banks?: Bank[];
  /** True when saving moves every match (also hand-categorised ones) — only changes
   *  how the preview words it. */
  moveAll?: boolean;
  /** The saved rule being edited, so Test replays the edit in its place. */
  ruleId?: number | null;
  cancelLabel?: string;
  submitLabel?: string;
  onSubmit: (fields: RuleFields, categoryId: number | null) => Promise<void> | void;
  /** Layering for a dialog opened over another sheet (see DialogContent). */
  sheetClassName?: string;
  overlayClassName?: string;
}

/**
 * Create or edit a category rule: description + match type, an optional amount
 * condition, and — in Settings — direction and account. While it's edited, a preview
 * shows how many transactions it matches already, with the latest few. The one rule
 * dialog: the transaction panel and the category settings both open this.
 */
export function RuleDialog({ open, onOpenChange, initial, title, subtitle, sheetClassName, overlayClassName, ...rest }: RuleDialogProps) {
  const t = useTranslations("activity.rule");
  // A fresh form per opening, so a cancelled edit never leaks into the next one.
  const [opening, setOpening] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpening((n) => n + 1);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideHeaderRow
        title={title}
        className="gap-5 pt-7 font-clear text-clear-ink"
        sheetClassName={sheetClassName}
        overlayClassName={overlayClassName}
      >
        <ClearDialogHeader title={title} subtitle={subtitle ?? t("intro")} onClose={() => onOpenChange(false)} closeLabel={t("close")} />
        {initial && <RuleBody key={opening} open={open} initial={initial} onCancel={() => onOpenChange(false)} {...rest} />}
      </DialogContent>
    </Dialog>
  );
}

function RuleBody({
  open,
  initial,
  categories,
  category: locked,
  banks,
  moveAll = false,
  ruleId,
  cancelLabel,
  submitLabel,
  onSubmit,
  onCancel,
}: Omit<RuleDialogProps, "open" | "onOpenChange" | "initial" | "title" | "subtitle" | "sheetClassName" | "overlayClassName"> & {
  open: boolean;
  initial: RuleDraft;
  onCancel: () => void;
}) {
  const t = useTranslations("activity.rule");
  const locale = useLocale();
  const formId = useId();
  const [d, setD] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const set = (patch: Partial<RuleDraft>) => setD((prev) => ({ ...prev, ...patch }));

  const picked = categories?.find((c) => c.id === d.categoryId) ?? null;
  const shownCategory: LockedCategory | null = locked ?? picked;
  const fields = ruleFieldsFromDraft(d);
  const hasCondition = !!fields.namePattern || fields.bankId != null;
  const canSave = !saving && hasCondition && (!!locked || d.categoryId != null);

  // The live preview: refetched (debounced) whenever the conditions change.
  const query = hasCondition ? previewQuery(fields) : "";
  const [preview, setPreview] = useState<{ query: string; data: RuleMatches } | null>(null);
  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/category-rules/preview?${query}`)
        .then((r) => (r.ok ? (r.json() as Promise<RuleMatches>) : null))
        .then((data) => { if (!cancelled && data) setPreview({ query, data }); })
        .catch(() => { /* the form still saves without a preview */ });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);
  const matches = query && preview ? preview.data : null;
  const stale = !!matches && preview?.query !== query;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSubmit(fields, d.categoryId);
    } finally {
      setSaving(false);
    }
  }

  const amountInput = (id: string, label: string, value: string, onChange: (v: string) => void) => (
    <ClearField label={label} htmlFor={id} className="min-w-0">
      <div className="flex h-12 items-center gap-1.5 rounded-clear-row border-[1.5px] border-transparent bg-clear-tile px-4 transition-colors focus-within:border-clear-ink">
        <span aria-hidden className="text-[15px] font-bold text-clear-muted">
          {currencySymbol()}
        </span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          placeholder="0,00"
          onChange={(e) => onChange(e.target.value.replace(AMOUNT_CHARS, ""))}
          className="h-full min-w-0 flex-1 bg-transparent p-0 text-[15px] font-extrabold tabular-nums text-clear-ink outline-none placeholder:text-clear-placeholder"
        />
      </div>
    </ClearField>
  );

  const categoryInner = (
    <>
      {shownCategory ? (
        <span aria-hidden className="inline-flex shrink-0 [&>*]:size-8!">
          <Icon iconKey={shownCategory.icon} color={shownCategory.color} size="sm" glyphSize={16} soft />
        </span>
      ) : (
        <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-clear-icon bg-clear-ground text-clear-muted">
          <IconTag className="size-4" stroke={1.9} />
        </span>
      )}
      <span className={cn("min-w-0 flex-1 truncate", !shownCategory && "text-clear-placeholder")}>{shownCategory?.name || t("chooseCategory")}</span>
    </>
  );
  const fieldBox = "flex h-12 w-full items-center gap-2.5 rounded-clear-row border-[1.5px] border-transparent bg-clear-tile pr-3.5 pl-2 text-left text-[15px] font-semibold text-clear-ink";

  const fmtDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
  const categoryName = shownCategory?.name ?? "";

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-5"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ClearField label={t("pattern")} htmlFor={`${formId}-pattern`} className="min-w-0">
          <ClearInput
            id={`${formId}-pattern`}
            value={d.pattern}
            autoComplete="off"
            onChange={(e) => set({ pattern: e.target.value })}
            className="font-bold tracking-[0.02em] focus:border-clear-ember"
          />
        </ClearField>
        {locked ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[13px] font-bold text-clear-ink-2">{t("category")}</span>
            <div className={fieldBox}>{categoryInner}</div>
          </div>
        ) : (
          <ClearField label={t("category")} htmlFor={`${formId}-category`} className="min-w-0">
            <button
              id={`${formId}-category`}
              type="button"
              onClick={() => setPickerOpen(true)}
              className={cn(fieldBox, "cursor-pointer outline-none focus-visible:border-clear-ink")}
            >
              {categoryInner}
              <IconChevronDown className="size-4 shrink-0 text-clear-muted" stroke={2.2} aria-hidden />
            </button>
          </ClearField>
        )}
      </div>

      <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1.5 p-0 text-[13px] font-bold text-clear-ink-2">{t("matchLabel")}</legend>
        <Segmented
          label={t("matchLabel")}
          surface="tile"
          value={d.matchType}
          onChange={(matchType) => set({ matchType })}
          items={(["contains", "word", "exact"] as const).map((m) => ({ value: m, label: t(`match.${m}`) }))}
          className="flex w-full [&>button]:flex-1 [&>button]:px-2"
        />
      </fieldset>

      <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1.5 p-0 text-[13px] font-bold text-clear-ink-2">{t("amountLabel")}</legend>
        <Segmented
          label={t("amountLabel")}
          surface="tile"
          value={d.amountMode}
          onChange={(amountMode) => set({ amountMode })}
          items={(["none", "exact", "range"] as const).map((m) => ({ value: m, label: t(`amount.${m}`) }))}
          className="flex w-full [&>button]:flex-1 [&>button]:px-2"
        />
      </fieldset>
      {d.amountMode === "exact" && amountInput(`${formId}-exact`, t("amount.exact"), d.amountExact, (v) => set({ amountExact: v }))}
      {d.amountMode === "range" && (
        <div className="grid grid-cols-2 gap-3">
          {amountInput(`${formId}-min`, t("min"), d.amountMin, (v) => set({ amountMin: v }))}
          {amountInput(`${formId}-max`, t("max"), d.amountMax, (v) => set({ amountMax: v }))}
        </div>
      )}

      {banks && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
            <legend className="mb-1.5 p-0 text-[13px] font-bold text-clear-ink-2">{t("directionLabel")}</legend>
            <Segmented
              label={t("directionLabel")}
              surface="tile"
              value={d.direction || "both"}
              onChange={(v) => set({ direction: v === "both" ? "" : v })}
              items={(["both", "expense", "income"] as const).map((m) => ({ value: m, label: t(`direction.${m}`) }))}
              className="flex w-full [&>button]:flex-1 [&>button]:px-2"
            />
          </fieldset>
          {banks.length > 0 && (
            <ClearField label={t("accountLabel")} htmlFor={`${formId}-bank`} className="min-w-0">
              <div className="relative">
                <select
                  id={`${formId}-bank`}
                  value={d.bankId}
                  onChange={(e) => set({ bankId: e.target.value })}
                  className="h-12 w-full cursor-pointer appearance-none rounded-clear-row border-[1.5px] border-transparent bg-clear-tile pr-10 pl-4 font-clear text-[15px] font-semibold text-clear-ink outline-none focus:border-clear-ink"
                >
                  <option value="">{t("allAccounts")}</option>
                  {banks.map((bank) => (
                    <option key={bank.id} value={String(bank.id)}>
                      {bank.displayName ?? bank.accountNumber ?? String(bank.id)}
                    </option>
                  ))}
                </select>
                <IconChevronDown className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-clear-muted" stroke={2.2} aria-hidden />
              </div>
            </ClearField>
          )}
        </div>
      )}

      {/* What the rule catches already, live while it's edited. */}
      <section
        data-tip-anchor="rulePreview"
        aria-live="polite"
        aria-labelledby={`${formId}-preview`}
        className={cn(
          "flex flex-col gap-3 rounded-clear-tile p-4 transition-opacity",
          matches && matches.count > 0 ? "bg-clear-mint text-clear-ink" : "bg-clear-tile text-clear-ink",
          stale && "opacity-60",
        )}
      >
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className={cn(
              "inline-flex size-[30px] shrink-0 items-center justify-center rounded-full bg-clear-card",
              matches && matches.count > 0 ? "text-clear-positive" : "text-clear-muted",
            )}
          >
            {matches && matches.count > 0 ? <IconCheck className="size-4" stroke={2.6} /> : <IconInfoCircle className="size-4" stroke={2} />}
          </span>
          <span className="flex min-w-0 flex-col gap-px">
            <h3 id={`${formId}-preview`} className="m-0 text-[15px] font-extrabold">
              {!hasCondition ? t("preview.empty") : matches ? t("preview.count", { count: matches.count }) : t("preview.checking")}
            </h3>
            {matches && hasCondition && (
              <span className="text-[13px] text-clear-ink-2">
                {matches.count === 0
                  ? t("preview.noneHint")
                  : categoryName
                    ? t(moveAll ? "preview.moveAll" : "preview.moveAuto", { count: matches.count, category: categoryName, review: matches.uncategorized })
                    : t("preview.pickCategory")}
              </span>
            )}
          </span>
        </div>
        {matches && matches.examples.length > 0 && (
          <>
            <ul className="m-0 flex list-none flex-col rounded-clear-icon bg-clear-card px-3.5 py-0">
              {matches.examples.map((m, i) => (
                <li key={m.id} className={cn("flex min-h-11 items-center gap-3", i < matches.examples.length - 1 && "border-b border-clear-line")}>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">
                    {d.matchType === "exact" ? m.description : <Highlight text={m.description} term={d.pattern.trim()} />}
                  </span>
                  <span className="shrink-0 text-[13px] whitespace-nowrap text-clear-muted">{fmtDay(m.date)}</span>
                  <Amount value={m.direction === "income" ? m.amount : -m.amount} className="w-[72px] shrink-0 text-right text-sm" />
                </li>
              ))}
            </ul>
            {matches.count > matches.examples.length && (
              <span className="px-1 text-[13px] font-bold text-clear-positive">{t("preview.more", { count: matches.count - matches.examples.length })}</span>
            )}
          </>
        )}
      </section>
      <AnchoredTip id="rulePreview" anchor="rulePreview" active={open && !!matches && matches.count > 0} />

      {hasCondition && d.categoryId != null && <RuleTest fields={fields} categoryId={d.categoryId} ruleId={ruleId} />}

      <ClearDialogFooter>
        <button type="button" onClick={onCancel} className={clearButtonVariants({ variant: "secondary" })}>
          {cancelLabel ?? t("cancel")}
        </button>
        <button type="submit" disabled={!canSave} className={clearButtonVariants()}>
          {saving ? t("saving") : submitLabel ?? t("apply")}
        </button>
      </ClearDialogFooter>

      {categories && (
        <CategoryPickerSheet
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          categories={categories}
          current={d.categoryId != null ? String(d.categoryId) : undefined}
          title={t("category")}
          // Above the rule dialog, which itself may sit over the transaction sheet.
          sheetClassName="z-[87]"
          overlayClassName="z-[87] backdrop-blur-lg bg-clear-primary/20"
          onChange={(v) => {
            set({ categoryId: v && v !== "none" ? Number(v) : null });
            setPickerOpen(false);
          }}
        />
      )}
    </form>
  );
}
