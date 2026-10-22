"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { useChoice, useConfirm } from "@/components/clear/confirm-dialog";
import type { CategoryRule } from "@/db/schema";
import type { RuleFields } from "@/components/rule-dialog";

/* Saving and deleting a rule, for every place that does either. Apart from the rule
 * dialog, so the category picker can use it without importing the dialog (which
 * imports the picker). */

/** The rule "also create a rule" and the teach strip make: the description contains
 *  `pattern`, same direction, any amount and account. */
export function containsRuleFields(pattern: string, direction: "income" | "expense" | null): RuleFields {
  return { namePattern: pattern, nameWildcard: true, nameWholeWord: false, amount: null, amountMin: null, amountMax: null, direction, bankId: null };
}

/** A rule's conditions as the preview endpoint's query string. */
export function previewQuery(f: RuleFields): string {
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

/** What saving a rule came to: the saved rule, "cancelled" (the move wasn't confirmed) or "failed". */
export type RuleSaveResult = CategoryRule | "cancelled" | "failed";

/**
 * Saves a rule (POST a new one with its categoryId, PATCH `{ id, … }` an existing one).
 * When the same rule — every condition equal — already files under another category,
 * the API answers 409 and this asks "This rule already files under A. Move it to B?";
 * only a tap on Move saves it again with `move: true`, which takes it out of A. Every
 * place that saves a rule goes through this.
 */
export function useSaveRule() {
  const t = useTranslations("activity.rule");
  const confirm = useConfirm();
  return useCallback(
    async (method: "POST" | "PATCH", body: object): Promise<RuleSaveResult> => {
      const send = (move: boolean) =>
        fetch("/api/category-rules", {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(move ? { ...body, move: true } : body),
        }).catch(() => null);
      let res = await send(false);
      if (res?.status === 409) {
        const clash: { from: { name: string }; to: { name: string } } = await res.json();
        const ok = await confirm({
          title: t("moveTitle"),
          body: t("moveBody", { from: clash.from.name, to: clash.to.name }),
          confirmLabel: t("moveConfirm"),
        });
        if (!ok) return "cancelled";
        res = await send(true);
      }
      return res?.ok ? ((await res.json()) as CategoryRule) : "failed";
    },
    [t, confirm],
  );
}

/**
 * Deletes a rule. The transactions it filed keep their category by default; when some
 * still carry it (and weren't set by hand) this first asks whether to keep them or send
 * them back to Needs review. With none it deletes without asking. Resolves "deleted",
 * "cancelled" or "failed".
 */
export function useDeleteRule() {
  const t = useTranslations("activity.rule");
  const choose = useChoice();
  return useCallback(
    async (rule: CategoryRule, categoryName: string): Promise<"deleted" | "cancelled" | "failed"> => {
      // Stored rules only ever hold these directions; anything else reads as "both".
      const direction = rule.direction === "income" || rule.direction === "expense" ? rule.direction : null;
      const filed = await fetch(`/api/category-rules/preview?${previewQuery({ ...rule, direction })}&categoryId=${rule.categoryId}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ filed?: number }>) : null))
        .then((data) => data?.filed ?? 0)
        .catch(() => 0);
      let revert = false;
      if (filed > 0) {
        const choice = await choose({
          title: t("deleteTitle"),
          body: t("deleteBody", { count: filed, category: categoryName }),
          confirmLabel: t("deleteKeep"),
          altLabel: t("deleteRevert", { count: filed }),
        });
        if (choice == null) return "cancelled";
        revert = choice === "alt";
      }
      const res = await fetch("/api/category-rules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, revert }),
      }).catch(() => null);
      return res?.ok ? "deleted" : "failed";
    },
    [t, choose],
  );
}
