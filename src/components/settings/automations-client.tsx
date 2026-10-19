"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconArrowRight, IconFlask, IconRobot, IconTrash } from "@tabler/icons-react";
import type { Bank, Category } from "@/db/schema";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Icon } from "@/components/icon";
import { ListRow } from "@/components/clear/list-row";
import { ClearButton } from "@/components/clear/button";
import { ClearChip } from "@/components/clear/chip";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { AnchoredTip } from "@/components/anchored-tip";
import { CategoryPickerSheet } from "@/components/category-picker";
import { RuleDialog, ruleDraftFromRule, type RuleFields } from "@/components/rule-dialog";
import { useDeleteRule, useSaveRule } from "@/components/rule-actions";
import { TeachRuleStrip, type TeachMoment } from "@/components/teach-rule-strip";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import { SettingsEmpty, SettingsNotice } from "@/components/settings/settings-ui";
import { EditMerchantDialog, MerchantSettingsClient } from "@/components/settings/merchant-settings-client";
import { merchantIcon } from "@/components/merchant-detail-portal";
import type { AutomationRule, AutomationsOverview } from "@/lib/automations";
import type { MerchantListItem } from "@/lib/merchants";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";

type TestResult = { days: number; changes: { id: number; date: string; description: string; from: number | null; to: number | null }[] };

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${url} failed`);
  return res;
}

/**
 * Settings › Automations (merchant-first rules, step 3): every merchant that files or
 * recognises something and every category rule, in one list, each with the number of
 * transactions it decides today. Rules that disagree about a recent transaction are
 * marked; busy merchants without a rule get a Suggest that opens the teach strip.
 * Test replays everything on the last 90 days and shows what would change first.
 */
export function AutomationsClient({ overview, categories, banks }: { overview: AutomationsOverview; categories: Category[]; banks: Bank[] }) {
  const t = useTranslations("settings.automations");
  const tPanels = useTranslations("settings.panels");
  const router = useRouter();
  const sendRule = useSaveRule();
  const removeRule = useDeleteRule();
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [editingMerchant, setEditingMerchant] = useState<MerchantListItem | null>(null);
  const [merchantOpen, setMerchantOpen] = useState(false);
  const [suggestFor, setSuggestFor] = useState<{ merchant: MerchantListItem; transactionId: number } | null>(null);
  const [teach, setTeach] = useState<(TeachMoment & { merchantId: number }) | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catById = new Map(categories.map((c) => [c.id, c]));
  const ruleById = new Map(overview.rules.map((r) => [r.rule.id, r]));
  const rulesByMerchant = new Map<number, AutomationRule[]>();
  for (const r of overview.rules) {
    if (r.merchantId == null) continue;
    rulesByMerchant.set(r.merchantId, [...(rulesByMerchant.get(r.merchantId) ?? []), r]);
  }
  const listedMerchants = new Set(overview.merchants.map((m) => m.merchant.id));
  const looseRules = overview.rules.filter((r) => r.merchantId == null || !listedMerchants.has(r.merchantId));
  const total = overview.merchants.reduce((s, m) => s + m.decides, 0) + overview.rules.reduce((s, r) => s + r.decides, 0);
  const empty = overview.rules.length === 0 && overview.merchants.length === 0;

  function ruleTitle(r: AutomationRule) {
    return r.rule.namePattern ? t("ruleTitle", { pattern: r.rule.namePattern }) : t("ruleNoPattern");
  }
  function ruleMeta(r: AutomationRule) {
    const parts = [catById.get(r.rule.categoryId)?.name ?? t("unknownCategory")];
    if (r.rule.amount != null) parts.push(t("conditionAmount", { amount: formatEur(r.rule.amount) }));
    if (r.rule.amountMin != null || r.rule.amountMax != null) parts.push(t("conditionRange", { min: formatEur(r.rule.amountMin ?? 0), max: formatEur(r.rule.amountMax ?? 0) }));
    if (r.rule.direction) parts.push(r.rule.direction === "income" ? t("conditionIncome") : t("conditionExpense"));
    if (r.rule.bankId != null) parts.push(t("conditionAccount"));
    return parts.join(" · ");
  }

  async function saveRule(fields: RuleFields, categoryId: number | null) {
    if (!editingRule) return;
    try {
      const saved = await sendRule("PATCH", { id: editingRule.rule.id, ...fields, categoryId: categoryId ?? editingRule.rule.categoryId });
      // The move wasn't confirmed: the rule dialog stays open to change it.
      if (saved === "cancelled") return;
      if (saved === "failed") throw new Error("rule failed");
      await send("/api/apply-rules", "POST", {});
      setRuleOpen(false);
      router.refresh();
    } catch {
      setError(t("saveError"));
    }
  }

  async function deleteRule(r: AutomationRule) {
    // Asks keep or send back when the rule still files transactions; Cancel deletes nothing.
    const result = await removeRule(r.rule, catById.get(r.rule.categoryId)?.name ?? t("unknownCategory"));
    if (result === "failed") setError(t("saveError"));
    else if (result === "deleted") router.refresh();
  }

  const ruleRow = (r: AutomationRule, nested = false) => {
    const cat = catById.get(r.rule.categoryId);
    return (
      <div key={`r-${r.rule.id}`} className={cn("flex items-center gap-1", nested && "pl-6")}>
        <ListRow
          className="min-w-0 flex-1"
          onClick={() => {
            setEditingRule(r);
            setRuleOpen(true);
          }}
          icon={<Icon iconKey={cat?.icon ?? null} color={cat?.color ?? null} soft size="md" />}
          title={ruleTitle(r)}
          meta={ruleMeta(r)}
          trailing={
            <span className="flex shrink-0 items-center gap-1.5">
              {r.conflictsWith.length > 0 && (
                <span title={r.conflictsWith.map((id) => (ruleById.get(id) ? ruleTitle(ruleById.get(id)!) : "")).join(", ")}>
                  <ClearChip tone="butter">{t("conflicts", { count: r.conflictsWith.length })}</ClearChip>
                </span>
              )}
              <ClearChip tone={r.decides > 0 ? "mint" : "stone"}>{t("decides", { count: r.decides })}</ClearChip>
            </span>
          }
        />
        <button
          type="button"
          onClick={() => deleteRule(r)}
          aria-label={t("deleteRule", { name: ruleTitle(r) })}
          className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-clear-muted hover:bg-clear-tile hover:text-clear-negative"
        >
          <IconTrash size={18} aria-hidden />
        </button>
      </div>
    );
  };

  return (
    <>
      <PanelHeader
        title={tPanels("automations.title")}
        action={
          !empty && (
            <span data-tip-anchor="automationsTest" className="inline-flex">
              <ClearButton variant="secondary" size="sm" onClick={() => setTestOpen(true)}>
                <IconFlask aria-hidden />
                {t("test")}
              </ClearButton>
            </span>
          )
        }
      />
      <div className="flex flex-col gap-5 px-4 pt-1 font-clear text-clear-ink">
        {!empty && (
          <p className="m-0 rounded-clear-tile bg-clear-tile px-4 py-3.5 text-[15px]">
            {t.rich("summary", {
              merchants: overview.merchants.length,
              rules: overview.rules.length,
              total,
              b: (chunks) => <strong className="font-extrabold">{chunks}</strong>,
            })}
          </p>
        )}

        {error && <SettingsNotice>{error}</SettingsNotice>}

        {overview.suggestions.length > 0 && (
          <section aria-labelledby="automations-suggest" className="flex flex-col gap-1">
            <h3 id="automations-suggest" className="m-0 text-[13px] font-bold text-clear-ink-2">{t("suggestionsTitle")}</h3>
            {overview.suggestions.map((s) => {
              const icon = merchantIcon(s.merchant);
              return (
                <div key={`s-${s.merchant.id}`} className="flex flex-col gap-2">
                  <ListRow
                    icon={<Icon iconKey={icon.iconKey} color={icon.color} background={icon.background} soft size="md" />}
                    title={s.merchant.name}
                    meta={t("suggestionMeta", { count: s.unfiled })}
                    trailing={
                      <ClearButton variant="ember" size="sm" onClick={() => setSuggestFor({ merchant: s.merchant, transactionId: s.sampleTransactionId })}>
                        {t("suggest")}
                      </ClearButton>
                    }
                  />
                  {teach?.merchantId === s.merchant.id && (
                    <TeachRuleStrip
                      teach={teach}
                      categories={categories}
                      onClose={() => setTeach(null)}
                      onRuleCreated={() => router.refresh()}
                    />
                  )}
                </div>
              );
            })}
          </section>
        )}

        {empty ? (
          <SettingsEmpty icon={<IconRobot stroke={1.9} />}>{t("empty")}</SettingsEmpty>
        ) : (
          <section aria-labelledby="automations-list" className="flex flex-col gap-1">
            <h3 id="automations-list" className="m-0 text-[13px] font-bold text-clear-ink-2">{t("listTitle")}</h3>
            {overview.merchants.map(({ merchant: m, decides }) => {
              const icon = merchantIcon(m);
              const own = rulesByMerchant.get(m.id) ?? [];
              const cat = m.defaultCategoryId != null ? catById.get(m.defaultCategoryId) : undefined;
              const meta = [
                m.patterns.length > 0 ? t("patternCount", { count: m.patterns.length }) : null,
                cat ? cat.name : null,
                own.length > 0 ? t("ruleCount", { count: own.length }) : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <div key={`m-${m.id}`} className="flex flex-col">
                  <ListRow
                    onClick={() => {
                      setEditingMerchant(m);
                      setMerchantOpen(true);
                    }}
                    icon={<Icon iconKey={icon.iconKey} color={icon.color} background={icon.background} soft size="md" />}
                    title={m.name}
                    meta={meta || t("merchantNoCategory")}
                    trailing={<ClearChip tone={decides > 0 ? "mint" : "stone"}>{t("decides", { count: decides })}</ClearChip>}
                  />
                  {own.map((r) => ruleRow(r, true))}
                </div>
              );
            })}
            {looseRules.length > 0 && overview.merchants.length > 0 && (
              <h4 className="m-0 mt-3 text-[13px] font-bold text-clear-ink-2">{t("looseRules")}</h4>
            )}
            {looseRules.map((r) => ruleRow(r))}
          </section>
        )}
      </div>

      {!empty && <AnchoredTip id="automations" anchor="automationsTest" />}

      <RuleDialog
        open={ruleOpen}
        onOpenChange={setRuleOpen}
        initial={ruleOpen && editingRule ? ruleDraftFromRule(editingRule.rule) : null}
        title={t("editRule")}
        categories={categories}
        banks={banks}
        onSubmit={saveRule}
      />

      <EditMerchantDialog open={merchantOpen} onClose={() => setMerchantOpen(false)}>
        {editingMerchant && (
          <MerchantSettingsClient key={editingMerchant.id} merchant={editingMerchant} categories={categories} onClose={() => setMerchantOpen(false)} />
        )}
      </EditMerchantDialog>

      <CategoryPickerSheet
        open={suggestFor != null}
        onOpenChange={(o) => {
          if (!o) setSuggestFor(null);
        }}
        categories={categories}
        title={suggestFor ? t("suggestTitle", { name: suggestFor.merchant.name }) : undefined}
        onChange={(v) => {
          if (suggestFor && v && v !== "none") {
            setTeach({ transactionId: suggestFor.transactionId, categoryId: Number(v), merchantName: suggestFor.merchant.name, merchantId: suggestFor.merchant.id });
          }
          setSuggestFor(null);
        }}
      />

      <TestDialog open={testOpen} onOpenChange={setTestOpen} categories={categories} onApplied={() => router.refresh()} />
    </>
  );
}

/** "Test": what replaying every rule on the last 90 days would change, then Apply. */
function TestDialog({
  open,
  onOpenChange,
  categories,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  onApplied: () => void;
}) {
  const t = useTranslations("settings.automations");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideHeaderRow title={t("testTitle")} className="gap-5 pt-6 font-clear text-clear-ink lg:px-7 lg:pt-7">
        {open && <TestBody categories={categories} onClose={() => onOpenChange(false)} onApplied={onApplied} />}
      </DialogContent>
    </Dialog>
  );
}

function TestBody({ categories, onClose, onApplied }: { categories: Category[]; onClose: () => void; onApplied: () => void }) {
  const t = useTranslations("settings.automations");
  const locale = useLocale();
  const [result, setResult] = useState<TestResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/automations/test")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: TestResult) => live && setResult(data))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);
  const name = (id: number | null) => (id == null ? t("noCategory") : categories.find((c) => c.id === id)?.name ?? t("unknownCategory"));
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });

  async function apply() {
    setBusy(true);
    try {
      await send("/api/automations/test", "POST");
      onApplied();
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ClearDialogHeader
        title={t("testTitle")}
        subtitle={result ? t("testSubtitle", { count: result.changes.length, days: result.days }) : t("testRunning")}
        onClose={onClose}
        closeLabel={t("close")}
      />
      {failed && <SettingsNotice>{t("testFailed")}</SettingsNotice>}
      {!result && !failed && <div aria-busy role="status" className="h-24 animate-pulse rounded-clear-tile bg-clear-tile" />}
      {result && result.changes.length === 0 && (
        <p className="m-0 rounded-clear-tile bg-clear-mint px-4 py-3.5 text-[15px] font-semibold">{t("testNothing")}</p>
      )}
      {result && result.changes.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {result.changes.map((c) => (
            <li key={c.id} className="flex flex-col gap-0.5 border-b border-clear-ground py-2.5 last:border-b-0">
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{c.description}</span>
                <span className="shrink-0 text-[13px] text-clear-muted">{fmt.format(new Date(`${c.date}T12:00:00`))}</span>
              </span>
              <span className="flex items-center gap-1.5 text-[13px] text-clear-ink-2">
                <span className="truncate">{name(c.from)}</span>
                <IconArrowRight size={14} aria-label={t("becomes")} className="shrink-0" />
                <span className="truncate font-bold text-clear-ink">{name(c.to)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <ClearDialogFooter>
        <ClearButton variant="secondary" onClick={onClose}>
          {t("close")}
        </ClearButton>
        {result && result.changes.length > 0 && (
          <ClearButton onClick={apply} disabled={busy}>
            {busy ? t("applying") : t("apply", { count: result.changes.length })}
          </ClearButton>
        )}
      </ClearDialogFooter>
    </>
  );
}
