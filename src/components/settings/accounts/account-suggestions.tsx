"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconBuildingBank, IconX } from "@tabler/icons-react";
import { ListRow } from "@/components/clear/list-row";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { AccountGlyph, ASSET_TYPE_STYLE, DEFAULT_BANK_COLOR, type AccountDraft } from "@/app/settings/account-edit-dialogs";
import { IconTile } from "@/components/clear/icon-tile";
import { formatEur } from "@/lib/format";
import { parseMatchNames } from "@/lib/account-names";
import type { AccountSuggestion } from "@/lib/account-suggestions";

/**
 * Settings › Accounts › "Found in your transactions" (src/lib/account-suggestions.ts):
 * accounts that money keeps going to or coming from, with the type already chosen.
 * Add opens the account dialog filled in, to check before saving; a card that tops up
 * an imported account is added to that account as another name in one tap. ✕ hides it.
 */
export function AccountSuggestions({ suggestions: initial, onAdd }: { suggestions: AccountSuggestion[]; onAdd: (draft: AccountDraft) => void }) {
  const t = useTranslations("accountForms.suggestions");
  const router = useRouter();
  const [suggestions, setSuggestions] = useState(initial);
  const [synced, setSynced] = useState(initial);
  if (synced !== initial) {
    setSynced(initial);
    setSuggestions(initial);
  }
  if (suggestions.length === 0) return null;

  const drop = (key: string) => setSuggestions((list) => list.filter((s) => s.key !== key));

  async function dismiss(key: string) {
    drop(key);
    await fetch("/api/account-suggestions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dismiss: key }) });
  }

  async function addName(s: Extract<AccountSuggestion, { target: "bank" }>) {
    drop(s.key);
    const banks: { id: number; matchNames: string | null }[] = await fetch("/api/banks").then((r) => r.json());
    const current = parseMatchNames(banks.find((b) => b.id === s.bankId)?.matchNames);
    await fetch("/api/banks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.bankId, matchNames: [...current, s.matchName] }),
    });
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="m-0 px-1 text-[15px] font-bold">{t("title")}</h3>
      <p className="m-0 px-1 pb-1 text-[13px] leading-[1.5] text-clear-muted">{t("intro")}</p>
      <div className="flex flex-col">
        {suggestions.map((s) => {
          const amount = t("meta", { count: s.count, amount: formatEur(s.total) });
          const isBank = s.target === "bank";
          const style = isBank ? null : ASSET_TYPE_STYLE[s.type];
          const Glyph = style?.icon;
          return (
            <ListRow
              key={s.key}
              icon={
                isBank ? (
                  <AccountGlyph icon={null} color={DEFAULT_BANK_COLOR} fallback={IconBuildingBank} />
                ) : (
                  <IconTile tone={style!.tone}>{Glyph && <Glyph aria-hidden stroke={2} />}</IconTile>
                )
              }
              title={s.name}
              meta={isBank ? `${t("nameFor", { bank: s.bankName })} · ${amount}` : `${t(`types.${s.type}`)} · ${amount}`}
              trailing={
                <>
                  <button
                    type="button"
                    onClick={() =>
                      isBank ? addName(s) : onAdd({ name: s.name, type: s.type, accountNumber: s.accountNumber, matchNames: s.matchNames })
                    }
                    aria-label={t("addLabel", { name: s.name })}
                    className={clearButtonVariants({ variant: "secondary", size: "sm" })}
                  >
                    {t("add")}
                  </button>
                  <button
                    type="button"
                    onClick={() => dismiss(s.key)}
                    aria-label={t("dismissLabel", { name: s.name })}
                    title={t("dismiss")}
                    className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-clear-muted transition-colors hover:bg-clear-tile hover:text-clear-ink"
                  >
                    <IconX aria-hidden size={18} stroke={2} />
                  </button>
                </>
              }
            />
          );
        })}
      </div>
    </section>
  );
}
