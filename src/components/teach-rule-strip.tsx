"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconCheck, IconX } from "@tabler/icons-react";
import type { Category } from "@/db/schema";
import { ClearButton } from "@/components/clear/button";
import { AnchoredTip } from "@/components/anchored-tip";
import { RuleDialog, emptyRuleDraft, fetchRuleMatches, type RuleDraft, type RuleFields } from "@/components/rule-dialog";
import type { CategorySuggestions } from "@/lib/category-suggestions";

/** What was just filed: one transaction, into one category. */
export interface TeachMoment {
  transactionId: number;
  categoryId: number;
  /** The transaction's merchant, when known; else the strip names the pattern. */
  merchantName?: string | null;
}

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${url} failed`);
  return res;
}

/** Moves every transaction a rule matches now to its category, hand-filed ones too:
 *  that is what "N earlier transactions move too" promised. */
async function moveMatches(fields: RuleFields, categoryId: number) {
  const { ids = [] } = await fetchRuleMatches(fields, { ids: true });
  if (ids.length > 0) await send("/api/transactions", "PATCH", { ids, categoryId });
}

/** The rule "Always" creates for a pattern: the description contains it, same direction. */
function fieldsFor(pattern: string, direction: "income" | "expense" | null): RuleFields {
  return { namePattern: pattern, nameWildcard: true, nameWholeWord: false, amount: null, amountMin: null, amountMax: null, direction, bankId: null };
}

/**
 * The teach moment (merchant-first rules, step 1): right after a category is picked
 * for a transaction, offer to file every transaction from that merchant the same way.
 * Shows the patterns the rule would use, how many earlier transactions it moves and
 * how many of those wait in Needs review, with Always · Just this one · Edit match
 * (the full rule dialog, prefilled). Renders nothing when no pattern can be derived.
 */
export function TeachRuleStrip({
  teach,
  categories,
  onClose,
  onRuleCreated,
  sheetClassName,
  overlayClassName,
}: {
  teach: TeachMoment;
  categories: Category[];
  onClose: () => void;
  /** After a rule was saved and applied — the host refreshes its data. */
  onRuleCreated?: () => void;
  /** Layering for the rule dialog when the strip sits inside another sheet. */
  sheetClassName?: string;
  overlayClassName?: string;
}) {
  const t = useTranslations("teachRule");
  const locale = useLocale();
  const [data, setData] = useState<{ key: string; patterns: string[]; direction: "income" | "expense" | null; count: number; waiting: number; merchant: string | null } | null>(null);
  const [state, setState] = useState<"ask" | "saving" | "done" | "failed">("ask");
  const [editOpen, setEditOpen] = useState(false);
  const key = `${teach.transactionId}:${teach.categoryId}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await send("/api/category-suggestions", "POST", { ids: [teach.transactionId] });
      const s: CategorySuggestions = await res.json();
      const direction = s.direction === "income" || s.direction === "expense" ? s.direction : null;
      if (s.patterns.length === 0) {
        if (!cancelled) setData({ key, patterns: [], direction, count: 0, waiting: 0, merchant: null });
        return;
      }
      // Union of what each pattern matches; the transaction just filed doesn't count.
      const ids = new Set<number>();
      let waiting = 0;
      for (const p of s.patterns) {
        const m = await fetchRuleMatches(fieldsFor(p, direction), { ids: true });
        for (const id of m.ids ?? []) if (id !== teach.transactionId) ids.add(id);
        waiting += m.uncategorized;
      }
      if (!cancelled) setData({ key, patterns: s.patterns, direction, count: ids.size, waiting, merchant: s.merchantName });
    })().catch(() => {
      if (!cancelled) setData({ key, patterns: [], direction: null, count: 0, waiting: 0, merchant: null });
    });
    return () => {
      cancelled = true;
    };
  }, [key, teach.transactionId]);

  // A new teach moment starts from the question again.
  const [shownKey, setShownKey] = useState(key);
  if (shownKey !== key) {
    setShownKey(key);
    setState("ask");
  }

  const current = data?.key === key ? data : null;
  const category = categories.find((c) => c.id === teach.categoryId);
  if (!current || current.patterns.length === 0 || !category) return null;

  const merchant = teach.merchantName?.trim() || current.merchant || current.patterns[0];
  const patternList = new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(current.patterns);

  async function always() {
    if (!current || state === "saving") return;
    setState("saving");
    try {
      for (const p of current.patterns) {
        const fields = fieldsFor(p, current.direction);
        await send("/api/category-rules", "POST", { categoryId: teach.categoryId, ...fields });
        await moveMatches(fields, teach.categoryId);
      }
      await send("/api/apply-rules", "POST", {});
      setState("done");
      onRuleCreated?.();
    } catch {
      setState("failed");
    }
  }

  async function saveEdited(fields: RuleFields, categoryId: number | null) {
    const target = categoryId ?? teach.categoryId;
    await send("/api/category-rules", "POST", { categoryId: target, ...fields });
    await moveMatches(fields, target);
    await send("/api/apply-rules", "POST", {});
    setEditOpen(false);
    setState("done");
    onRuleCreated?.();
  }

  const initial: RuleDraft = {
    ...emptyRuleDraft(teach.categoryId),
    pattern: current.patterns[0],
    direction: current.direction ?? "",
  };

  if (state === "done") {
    return (
      <div role="status" className="flex items-center gap-3 rounded-clear-tile bg-clear-mint px-4 py-3 text-clear-ink">
        <IconCheck size={18} stroke={2.6} aria-hidden className="shrink-0 text-clear-mint-ink" />
        <span className="min-w-0 flex-1 text-sm font-semibold">{t("done", { merchant, category: category.name })}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-clear-ink-2 hover:bg-clear-card"
        >
          <IconX size={16} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <section data-tip-anchor="ruleTeach" aria-label={t("label")} className="flex flex-col gap-2.5 rounded-clear-tile bg-clear-mint p-4 text-clear-ink">
      <p className="m-0 text-[15px] font-extrabold">{t("title", { merchant, category: category.name })}</p>
      <p className="m-0 text-[13px] leading-snug text-clear-ink-2">
        {t.rich("body", {
          patterns: patternList,
          count: current.count,
          waiting: current.waiting,
          b: (chunks) => <strong className="font-bold text-clear-ink">{chunks}</strong>,
        })}
      </p>
      {state === "failed" && <p role="alert" className="m-0 text-[13px] font-semibold text-clear-negative">{t("failed")}</p>}
      <div className="flex flex-wrap gap-2">
        <ClearButton size="sm" onClick={always} disabled={state === "saving"}>
          {state === "saving" ? t("saving") : t("always")}
        </ClearButton>
        <ClearButton size="sm" variant="surface" onClick={onClose} disabled={state === "saving"}>
          {t("justThisOne")}
        </ClearButton>
        <ClearButton size="sm" variant="ghost" onClick={() => setEditOpen(true)} disabled={state === "saving"}>
          {t("editMatch")}
        </ClearButton>
      </div>

      <RuleDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={editOpen ? initial : null}
        title={t("editTitle", { merchant })}
        category={{ name: category.name, icon: category.icon, color: category.color }}
        moveAll
        submitLabel={t("always")}
        onSubmit={saveEdited}
        sheetClassName={sheetClassName}
        overlayClassName={overlayClassName}
      />
      <AnchoredTip id="ruleTeach" anchor="ruleTeach" />
    </section>
  );
}
