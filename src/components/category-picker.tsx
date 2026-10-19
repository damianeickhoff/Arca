"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Category } from "@/db/schema";
import { IconCheck, IconChevronDown, IconFilter2, IconSearch, IconX } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { IconTile } from "@/components/clear/icon-tile";
import { ClearSwitch } from "@/components/clear/switch";
import { ContextualTip } from "@/components/contextual-tip";
import { Icon } from "@/components/icon";
import { UNCATEGORIZED_ICON, UNCATEGORIZED_COLOR } from "@/lib/auto-brand";
import type { CategorySuggestions } from "@/lib/category-suggestions";
import { useSaveRule } from "@/components/rule-actions";
import { cn } from "@/lib/utils";
import { groupCategories } from "@/lib/category-tree";
import { formatEur } from "@/lib/format";
import { acquireNavHidden } from "@/lib/nav-visibility";
import { useIsDesktop } from "@/lib/use-is-desktop";

// Force WebKit to recompute the layout/visual viewport by briefly re-writing the
// viewport <meta>. On an iOS home-screen PWA the WKWebView is left ~62px short of the
// screen after the on-screen keyboard closes (a dark strip at the bottom) until a real
// gesture nudges it; toggling the meta triggers the same recompute without a scroll.
// maximum-scale=1 is a no-op while the page is at scale 1, so there's no visible zoom.
function forceViewportRecompute() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  const original = meta.getAttribute("content") ?? "width=device-width, initial-scale=1";
  meta.setAttribute("content", `${original}, maximum-scale=1`);
  requestAnimationFrame(() => meta.setAttribute("content", original));
}

/**
 * Keeps the full-height picker sheet steady in an iOS home-screen PWA while it's open:
 * hides the tab bar, pins the document scroll at 0 (iOS scrolls the whole page when
 * the keyboard opens even though the viewport already shrank above it), and nudges
 * WebKit to resize the web view once the keyboard closes and as the picker closes —
 * otherwise a strip of system background stays at the bottom of the screen.
 */
function useKeyboardSafePicker(open: boolean) {
  useEffect(() => {
    if (!open) return;
    return acquireNavHidden();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    let restHeight = vv ? vv.height : window.innerHeight;
    let keyboardWasOpen = false;

    const pin = () => {
      if (vv) restHeight = Math.max(restHeight, vv.height);
      if (window.scrollY !== 0) window.scrollTo(0, 0);
      const html = document.documentElement;
      if (html.scrollTop !== 0) html.scrollTop = 0;
      if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
      const keyboardOpen = vv ? vv.height < restHeight - 100 : false;
      if (keyboardWasOpen && !keyboardOpen) forceViewportRecompute();
      keyboardWasOpen = keyboardOpen;
    };
    window.addEventListener("scroll", pin, true);
    vv?.addEventListener("scroll", pin);
    vv?.addEventListener("resize", pin);
    return () => {
      window.removeEventListener("scroll", pin, true);
      vv?.removeEventListener("scroll", pin);
      vv?.removeEventListener("resize", pin);
      [50, 350, 700].forEach((d) => setTimeout(forceViewportRecompute, d));
    };
  }, [open]);
}

/** One selectable entry in visual order — what the arrow keys walk through. */
interface PickOption {
  value: string;
  label: string;
  iconKey?: string | null;
  color?: string | null;
}

/**
 * The category list: a search field, then every category under its group's heading, in
 * the same order as Settings › Categories. Groups are only headings; searching matches a
 * group's name too (showing all its categories). Arrow keys move through the list, Enter
 * selects (and, when `onConfirm` is set, Enter on the selected one confirms it). Two
 * columns from lg.
 */
function CategoryGrid({
  categories,
  current,
  onSelect,
  onConfirm,
  search,
  onSearchChange,
  autoFocusSearch = false,
  between,
}: {
  categories: Category[];
  /** The selected value ("none" = Uncategorized). */
  current?: string;
  onSelect: (value: string) => void;
  onConfirm?: () => void;
  search: string;
  onSearchChange: (v: string) => void;
  /** Focus the search field on open — desktop only, a phone would pop its keyboard. */
  autoFocusSearch?: boolean;
  /** Rendered between the search field and the list (the suggestions). */
  between?: React.ReactNode;
}) {
  const t = useTranslations("categoryPicker");
  const uid = useId();
  const [activeValue, setActiveValue] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const query = search.trim().toLowerCase();

  // Groups with their (matching) categories, plus the flat option order the keys use.
  const { special, groups, options } = useMemo(() => {
    const toOption = (c: Category, color: string | null): PickOption => ({ value: String(c.id), label: c.name, iconKey: c.icon, color });
    const special: PickOption[] = query ? [] : [{ value: "none", label: t("uncategorized"), iconKey: UNCATEGORIZED_ICON, color: UNCATEGORIZED_COLOR }];
    const groups = groupCategories(categories)
      .map(({ group, categories: cats }) => {
        const all = query && group.name.toLowerCase().includes(query);
        const shown = all ? cats : cats.filter((c) => !query || c.name.toLowerCase().includes(query));
        return { key: group.id, label: group.name, color: group.color, options: shown.map((c) => toOption(c, group.color)) };
      })
      .filter((g) => g.options.length > 0);
    const options = [...special, ...groups.flatMap((g) => g.options)];
    return { special, groups, options };
  }, [categories, query, t]);

  // The highlighted option: the one the arrows reached, else the first match while
  // searching (so Enter picks it), else the selected category.
  const has = (v: string | null | undefined): v is string => v != null && options.some((o) => o.value === v);
  const active = has(activeValue) ? activeValue : query ? (options[0]?.value ?? null) : has(current) ? current : null;

  const optionId = (value: string) => `${uid}-opt-${value}`;

  function move(e: React.KeyboardEvent, key: string) {
    if (options.length === 0) return;
    const index = active == null ? -1 : options.findIndex((o) => o.value === active);
    let next = index;
    if (key === "ArrowDown" || key === "ArrowRight") next = Math.min(options.length - 1, index + 1);
    else if (key === "ArrowUp" || key === "ArrowLeft") next = Math.max(0, index - 1);
    else if (key === "Home") next = 0;
    else if (key === "End") next = options.length - 1;
    e.preventDefault();
    const value = options[next]?.value;
    if (value == null) return;
    setActiveValue(value);
    const node = document.getElementById(optionId(value));
    node?.scrollIntoView({ block: "nearest" });
    // When focus is already in the list (a click or Tab put it there), move it along.
    if (listRef.current?.contains(document.activeElement)) node?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // Keys from a dialog opened out of the list bubble here through the React tree;
    // only this list's own field and options count.
    if (!(e.target instanceof Node) || !e.currentTarget.contains(e.target)) return;
    const inSearch = e.target === searchRef.current;
    const inList = listRef.current?.contains(e.target) ?? false;
    if (!inSearch && !inList) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") return move(e, e.key);
    // Left/Right and Home/End belong to the text field while typing.
    if (!inSearch && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return move(e, e.key);
    if (e.key === "Enter" && inSearch && active != null) {
      e.preventDefault();
      if (onConfirm && active === current) onConfirm();
      else onSelect(active);
    }
  }

  const renderOption = (o: PickOption) => {
    const selected = current === o.value;
    const isActive = active === o.value;
    return (
      <button
        key={o.value}
        id={optionId(o.value)}
        role="option"
        aria-selected={selected}
        tabIndex={-1}
        type="button"
        onClick={() => onSelect(o.value)}
        onMouseMove={() => !isActive && setActiveValue(o.value)}
        className={cn(
          "flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-clear-icon pr-2 pl-1 text-left outline-none transition-colors lg:h-[34px]",
          selected ? "bg-clear-tile ring-2 ring-clear-ink ring-inset" : isActive ? "bg-clear-tile" : "hover:bg-clear-tile",
        )}
      >
        <span aria-hidden className="inline-flex shrink-0 [&>*]:size-[26px]! [&>*]:rounded-[8px]!">
          <Icon iconKey={o.iconKey ?? null} color={o.color ?? null} soft size="xs" glyphSize={15} />
        </span>
        <span className={cn("min-w-0 flex-1 truncate text-sm", selected ? "font-extrabold" : "font-bold")}>
          {o.label}
        </span>
        {selected && (
          <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-clear-primary text-clear-primary-ink">
            <IconCheck size={13} stroke={3} />
          </span>
        )}
      </button>
    );
  };

  const empty = special.length === 0 && groups.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5 font-clear text-clear-ink" onKeyDown={onKeyDown}>
      <div className="flex h-12 shrink-0 items-center gap-2.5 rounded-clear-row border-[1.5px] border-transparent bg-clear-tile pr-1.5 pl-4 text-clear-muted transition-colors focus-within:border-clear-ink">
        <IconSearch className="size-[18px] shrink-0" />
        <input
          ref={searchRef}
          type="search"
          role="combobox"
          aria-expanded
          aria-controls={`${uid}-list`}
          aria-activedescendant={active != null ? optionId(active) : undefined}
          aria-label={t("search")}
          placeholder={t("search")}
          value={search}
          onChange={(e) => {
            onSearchChange(e.target.value);
            setActiveValue(null);
          }}
          autoFocus={autoFocusSearch}
          data-no-keyboard-scroll
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-clear-ink outline-none placeholder:font-medium placeholder:text-clear-placeholder [&::-webkit-search-cancel-button]:hidden"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label={t("clearSearch")}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-clear-card text-clear-ink-2"
          >
            <IconX className="size-4" />
          </button>
        )}
      </div>

      {between}

      <div
        ref={listRef}
        id={`${uid}-list`}
        role="listbox"
        aria-label={t("list")}
        className="clear-scrollbar -mx-1 min-h-0 flex-1 overflow-y-auto border-t border-clear-ground px-1 pt-3.5 pb-0.5 lg:max-h-[476px]"
      >
        {empty ? (
          <p className="py-8 text-center text-sm text-clear-muted">{t("empty")}</p>
        ) : (
          <div className="lg:columns-2 lg:gap-4">
            {special.length > 0 && <div className="mb-3 flex break-inside-avoid flex-col gap-0.5">{special.map(renderOption)}</div>}
            {groups.map((g) => (
              <div key={g.key} role="group" aria-label={g.label} className="mb-3 flex break-inside-avoid flex-col gap-0.5">
                <GroupHeading color={g.color} label={g.label} />
                {g.options.map(renderOption)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** A group's heading in the list: its colour as a dot (the group's own colour, chosen by
 *  the user — a data value, not a theme colour) and its name. */
function GroupHeading({ color, label }: { color: string | null; label: string }) {
  return (
    <div className="flex h-[26px] break-after-avoid items-center gap-2 px-1.5 text-[13px] font-bold text-clear-ink-2">
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", !color && "bg-clear-placeholder")} style={color ? { backgroundColor: color } : undefined} />
      {label}
    </div>
  );
}

/**
 * Setting the category of saved transactions: the picker stages a pick, shows the
 * suggested categories and an "Also create a rule" switch, and applies it all on
 * "Apply to N transactions".
 */
export interface CategoryApply {
  /** The transactions being categorised. */
  ids: number[];
  /** Their names, when the caller already knows them (the subtitle shows them before
   *  the suggestions arrive). */
  names?: string[];
  /** False hides the rule switch — e.g. a recurring item already decides the category. */
  allowRule?: boolean;
  /** After the save: the category set (null = Uncategorized), every id it changed and
   *  whether the rule switch also created a rule (then no teach strip is needed). */
  onApplied: (categoryId: number | null, ids: number[], ruleCreated: boolean) => void;
}

type SheetProps = {
  categories: Category[];
  current?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Defaults to "Category" (pick) or "Set category" (apply). */
  title?: string;
  /** Layering for a picker opened over another sheet (see DialogContent). */
  sheetClassName?: string;
  overlayClassName?: string;
} & (
  | {
      /** Pick-and-close: reports the picked value ("none" = Uncategorized). */
      onChange: (value: string) => void;
      apply?: never;
    }
  | { apply: CategoryApply; onChange?: never }
);

async function postJson(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${url} failed`);
  return res;
}

/**
 * The picker on its own, without a trigger — for callers that already have their own
 * control and just need to open it. A full-height bottom sheet on phones, a centred
 * modal from lg. This is the app's single category picker: nothing should hand-roll a
 * category list dialog beside it.
 *
 * Two modes: with `onChange` a tap picks and closes (forms); with `apply` it sets the
 * category of saved transactions, with suggestions, a rule switch and an Apply footer.
 */
export function CategoryPickerSheet(props: SheetProps) {
  const { categories, current, open, onOpenChange, sheetClassName, overlayClassName, apply } = props;
  const t = useTranslations("categoryPicker");
  const locale = useLocale();
  const isDesktop = useIsDesktop();
  const [search, setSearch] = useState("");
  const [staged, setStaged] = useState<string | undefined>(current);
  const [ruleOn, setRuleOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [info, setInfo] = useState<{ key: string; data: CategorySuggestions } | null>(null);
  const ruleLabelId = useId();

  useKeyboardSafePicker(open);

  // Every opening starts from the transaction's own category, rule off.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStaged(current);
      setRuleOn(false);
      setFailed(false);
    }
  }

  const idsKey = apply ? apply.ids.join(",") : "";
  useEffect(() => {
    if (!open || !idsKey) return;
    let cancelled = false;
    postJson("/api/category-suggestions", "POST", { ids: idsKey.split(",").map(Number) })
      .then((r) => r.json())
      .then((data: CategorySuggestions) => {
        if (!cancelled) setInfo({ key: idsKey, data });
      })
      .catch(() => {
        // No suggestions and no rule — the plain list still works.
      });
    return () => {
      cancelled = true;
    };
  }, [open, idsKey]);
  const data = info && info.key === idsKey ? info.data : null;

  function change(next: boolean) {
    onOpenChange(next);
    if (!next) setSearch("");
  }

  const title = props.title ?? (apply ? t("setTitle") : t("title"));

  // ── apply mode
  const stagedId = staged && staged !== "none" ? Number(staged) : null;
  const ruleAvailable = !!apply && apply.allowRule !== false && (data?.patterns.length ?? 0) > 0;
  const withRule = ruleAvailable && ruleOn && stagedId != null;
  const applyIds = apply ? (withRule && data ? [...new Set([...apply.ids, ...data.similarIds])] : apply.ids) : [];
  const listFormat = new Intl.ListFormat(locale, { style: "long", type: "conjunction" });

  const sendRule = useSaveRule();

  async function applyStaged() {
    if (!apply || busy || staged === undefined) return;
    // Nothing changes: the same category and no rule.
    if (staged === (current ?? "none") && !withRule) return change(false);
    setBusy(true);
    setFailed(false);
    try {
      // The picked rows are set by hand; the similar ones the rule brings along are
      // filed by the rule, so deleting it later can offer to send them back.
      await postJson("/api/transactions", "PATCH", { ids: apply.ids, categoryId: stagedId });
      const byRule = applyIds.filter((id) => !apply.ids.includes(id));
      if (byRule.length > 0) await postJson("/api/transactions", "PATCH", { ids: byRule, categoryId: stagedId, byRule: true });
      if (withRule && data) {
        // One that already files elsewhere asks before it moves; a Cancel leaves it out.
        let savedAny = false;
        for (const pattern of data.patterns) {
          const saved = await sendRule("POST", {
            categoryId: stagedId,
            namePattern: pattern,
            nameWildcard: true,
            nameWholeWord: false,
            direction: data.direction,
            bankId: null,
            amount: null,
            amountMin: null,
            amountMax: null,
          });
          if (saved === "failed") throw new Error("rule failed");
          if (saved !== "cancelled") savedAny = true;
        }
        if (savedAny) await postJson("/api/apply-rules", "POST", {});
      }
      apply.onApplied(stagedId, applyIds, withRule);
      change(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  let subtitle: string | undefined;
  if (apply) {
    const names = data?.names.length ? data.names : (apply.names ?? []);
    // One transaction: its name and amount, the amount once the suggestions arrive.
    const amount = data ? `${data.total < 0 ? "−" : "+"}${formatEur(Math.abs(data.total))}` : null;
    if (apply.ids.length === 1) subtitle = names[0] ? (amount ? t("subtitleOneAmount", { name: names[0], amount }) : t("subtitleOne", { name: names[0] })) : undefined;
    else {
      const shown = names.slice(0, 2).join(", ") + (names.length > 2 ? ` ${t("moreNames", { count: names.length - 2 })}` : "");
      subtitle = [t("subtitleMany", { count: apply.ids.length }), shown].filter(Boolean).join(" · ");
    }
  }

  const suggested = (data?.suggested ?? []).map((id) => categories.find((c) => c.id === id)).filter((c): c is Category => !!c);
  const suggestions = apply && suggested.length > 0 && (
    <div role="group" aria-labelledby={`${ruleLabelId}-sugg`} className="flex shrink-0 flex-wrap items-center gap-2">
      <span id={`${ruleLabelId}-sugg`} className="mr-1 text-[13px] font-bold text-clear-ink-2">
        {t("suggested")}
      </span>
      {suggested.map((c) => {
        const on = staged === String(c.id);
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            onClick={() => setStaged(String(c.id))}
            className={cn(
              "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full pr-3.5 pl-[5px] text-sm font-bold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-clear-ember/50",
              on ? "bg-clear-primary text-clear-primary-ink" : "bg-clear-ground text-clear-ink hover:bg-clear-line",
            )}
          >
            <span aria-hidden className="inline-flex shrink-0 [&>*]:size-[26px]!">
              <Icon iconKey={c.icon} color={c.color} soft round size="xs" glyphSize={14} />
            </span>
            {c.name}
          </button>
        );
      })}
    </div>
  );

  const similarCount = data?.similarIds.length ?? 0;
  const patternNames = listFormat.format(data?.patterns ?? []);

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent
        hideHeaderRow
        fullHeight
        title={title}
        sheetClassName={sheetClassName}
        overlayClassName={overlayClassName}
        className="gap-3.5 pt-[calc(var(--sat)+20px)] font-clear text-clear-ink lg:w-[600px] lg:max-w-full lg:pt-7"
      >
        <ClearDialogHeader title={title} subtitle={subtitle} onClose={() => change(false)} closeLabel={t("close")} />
        {/* Apply mode is new (suggestions, the rule switch); the pick mode explains the
            grouped, keyboard-driven list. */}
        <ContextualTip id={apply ? "categoryPickerSuggestions" : "categoryPickerByGroup"} active={open} />
        <CategoryGrid
          categories={categories}
          current={apply ? staged : current}
          onSelect={(v) => {
            if (apply) return setStaged(v);
            props.onChange?.(v);
            change(false);
          }}
          onConfirm={apply ? applyStaged : undefined}
          search={search}
          onSearchChange={setSearch}
          autoFocusSearch={isDesktop}
          between={suggestions}
        />

        {apply && ruleAvailable && (
          <label className="flex shrink-0 cursor-pointer items-center gap-3 rounded-clear-tile bg-clear-tile px-4 py-3">
            <IconTile tone="sky" size="sm" className="size-8 rounded-full [&_svg]:size-4">
              <IconFilter2 stroke={2.1} />
            </IconTile>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span id={ruleLabelId} className="text-[15px] font-bold">
                {t("rule.title")}
              </span>
              <span className="text-[13px] font-medium text-clear-ink-2">
                {similarCount > 0 ? t("rule.helpWithSimilar", { names: patternNames, count: similarCount }) : t("rule.help", { names: patternNames })}
              </span>
            </span>
            <ClearSwitch checked={ruleOn && stagedId != null} onCheckedChange={setRuleOn} labelledBy={ruleLabelId} disabled={stagedId == null || busy} />
          </label>
        )}

        {apply && (
          <div className="flex shrink-0 flex-wrap items-center gap-2.5 border-t border-clear-ground pt-4">
            {failed && (
              <p role="alert" className="m-0 min-w-0 flex-1 text-[13px] font-semibold text-clear-negative">
                {t("applyFailed")}
              </p>
            )}
            <span className="flex-1" />
            <button type="button" onClick={() => change(false)} className={clearButtonVariants({ variant: "secondary" })}>
              {t("cancel")}
            </button>
            <button type="button" onClick={applyStaged} disabled={busy || staged === undefined} className={clearButtonVariants()}>
              {busy ? t("applying") : t("apply", { count: applyIds.length })}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A trigger field plus the picker, for forms: reports the picked id ("" = none). */
export function CategoryPicker({
  categories,
  current,
  onChange,
  triggerClassName,
  placeholder,
  showSelectedIcon = false,
}: {
  categories: Category[];
  current?: string;
  onChange: (value: string) => void;
  triggerClassName?: string;
  /** Label shown on the trigger when nothing is selected. Defaults to "Category". */
  placeholder?: string;
  /** When set, the trigger shows the selected category's icon beside its name. */
  showSelectedIcon?: boolean;
}) {
  const t = useTranslations("categoryPicker");
  const [open, setOpen] = useState(false);

  let label = placeholder ?? t("placeholder");
  let selectedCat: Category | undefined;
  if (current === "none") label = t("uncategorized");
  else if (current) {
    selectedCat = categories.find((c) => String(c.id) === current);
    if (selectedCat) label = selectedCat.name;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          "flex h-12 cursor-pointer items-center gap-2.5 rounded-clear-row bg-clear-tile px-3.5 text-left font-clear text-[15px] font-bold text-clear-ink outline-none transition-colors focus-visible:ring-3 focus-visible:ring-clear-ember/50",
          !current && "text-clear-muted",
          triggerClassName,
        )}
      >
        {showSelectedIcon && selectedCat && <Icon iconKey={selectedCat.icon} color={selectedCat.color} soft size="xs" />}
        <span className="flex-1 truncate">{label}</span>
        <IconChevronDown className="size-4.5 shrink-0" />
      </button>
      <CategoryPickerSheet
        categories={categories}
        current={current}
        open={open}
        onOpenChange={setOpen}
        onChange={(value) => onChange(value === "none" ? "" : value)}
      />
    </>
  );
}
