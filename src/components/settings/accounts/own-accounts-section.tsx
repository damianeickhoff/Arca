"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconArrowsLeftRight, IconChartLine, IconPencil, IconPigMoney, IconPlus, IconTrash, IconUsers, IconX } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogFooter, ClearDialogFooterDock, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField, ClearInput } from "@/components/clear/field";
import { Segmented } from "@/components/clear/segmented";
import { IconTile } from "@/components/clear/icon-tile";
import { ListRow } from "@/components/clear/list-row";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { useConfirm } from "@/components/clear/confirm-dialog";
import type { ClearTone } from "@/components/clear/tones";
import { FIELD_LABEL } from "@/app/settings/account-edit-dialogs";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OwnAccount } from "@/db/schema";
import type { OwnAccountKind, OwnAccountSuggestion } from "@/lib/own-account-suggestions";

const KINDS: OwnAccountKind[] = ["savings", "investments", "shared_account", "other"];

const KIND_STYLE: Record<OwnAccountKind, { icon: typeof IconPigMoney; tone: ClearTone }> = {
  savings: { icon: IconPigMoney, tone: "sky" },
  investments: { icon: IconChartLine, tone: "mint" },
  shared_account: { icon: IconUsers, tone: "lilac" },
  other: { icon: IconArrowsLeftRight, tone: "stone" },
};

const kindOf = (value: string | null | undefined): OwnAccountKind => (KINDS as string[]).includes(value ?? "") ? (value as OwnAccountKind) : "other";

function KindGlyph({ kind }: { kind: string }) {
  const style = KIND_STYLE[kindOf(kind)];
  const Glyph = style.icon;
  return (
    <IconTile tone={style.tone}>
      <Glyph aria-hidden stroke={2} />
    </IconTile>
  );
}

type Draft = Pick<OwnAccount, "name" | "accountNumber" | "matchText" | "transferKind">;

/**
 * Settings › Accounts › Own accounts: the owner's accounts that are not imported (a
 * savings, investment or joint account, card top-ups). Money to and from one is an
 * internal transfer on every screen. Below the list, own accounts found in the
 * transactions (src/lib/own-account-suggestions.ts) to add with one tap or hide.
 */
export function OwnAccountsSection({ accounts: initialAccounts, suggestions: initialSuggestions }: { accounts: OwnAccount[]; suggestions: OwnAccountSuggestion[] }) {
  const t = useTranslations("accountForms.own");
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  // A router.refresh() brings new props (another tab added one): take them over.
  const [synced, setSynced] = useState({ initialAccounts, initialSuggestions });
  if (synced.initialAccounts !== initialAccounts || synced.initialSuggestions !== initialSuggestions) {
    setSynced({ initialAccounts, initialSuggestions });
    setAccounts(initialAccounts);
    setSuggestions(initialSuggestions);
  }

  // The account being edited, or a draft to add (blank, or from a suggestion).
  const [editing, setEditing] = useState<OwnAccount | null>(null);
  const [adding, setAdding] = useState<{ draft: Draft; suggestion: string | null } | null>(null);

  const meta = (a: Pick<OwnAccount, "transferKind" | "accountNumber" | "matchText">) =>
    [t(`kinds.${kindOf(a.transferKind)}`), a.accountNumber, a.matchText ? t("matches", { text: a.matchText }) : null].filter(Boolean).join(" · ");

  async function dismiss(key: string) {
    setSuggestions((list) => list.filter((s) => s.key !== key));
    await fetch("/api/own-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dismiss: key }) });
  }

  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex h-10 items-center gap-2 rounded-clear-icon bg-clear-tile px-3">
        <h3 className="m-0 text-[15px] font-bold">
          {t("title")} <span className="font-semibold text-clear-muted">· {accounts.length}</span>
        </h3>
      </div>
      <p className="m-0 px-1 pt-1 pb-1.5 text-[13px] leading-[1.5] text-clear-muted">{t("intro")}</p>
      {accounts.length === 0 ? (
        <div className="rounded-clear-tile border-2 border-dashed border-clear-line px-4 py-5 text-center text-[13px] text-clear-muted">{t("empty")}</div>
      ) : (
        <div className="flex flex-col">
          {accounts.map((a) => (
            <ListRow
              key={a.id}
              onClick={() => setEditing(a)}
              icon={<KindGlyph kind={a.transferKind} />}
              title={a.name}
              meta={meta(a)}
              trailing={
                <span aria-hidden title={t("edit", { name: a.name })} className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-clear-tile text-clear-ink">
                  <IconPencil size={18} stroke={2} />
                </span>
              }
            />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setAdding({ draft: { name: "", accountNumber: null, matchText: null, transferKind: "savings" }, suggestion: null })}
        className={cn(clearButtonVariants({ variant: "secondary" }), "mt-2 self-start")}
      >
        <IconPlus aria-hidden stroke={2.2} />
        {t("add")}
      </button>

      {suggestions.length > 0 && (
        <div className="mt-4 flex flex-col gap-1.5">
          <h4 className="m-0 px-1 text-[13px] font-bold text-clear-ink-2">{t("suggestions")}</h4>
          <div className="flex flex-col">
            {suggestions.map((s) => (
              <ListRow
                key={s.key}
                icon={<KindGlyph kind={s.transferKind} />}
                title={s.name}
                meta={[meta(s), t("suggestionMeta", { count: s.count, amount: formatEur(s.total) })].join(" · ")}
                trailing={
                  <>
                    <button
                      type="button"
                      onClick={() => setAdding({ draft: { name: s.name, accountNumber: s.accountNumber, matchText: s.matchText, transferKind: s.transferKind }, suggestion: s.key })}
                      aria-label={t("reviewLabel", { name: s.name })}
                      className={clearButtonVariants({ variant: "secondary", size: "sm" })}
                    >
                      {t("review")}
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
            ))}
          </div>
        </div>
      )}

      <OwnAccountDialog
        account={editing}
        draft={adding?.draft ?? null}
        open={editing !== null || adding !== null}
        onOpenChange={(v) => {
          if (v) return;
          setEditing(null);
          setAdding(null);
        }}
        onSaved={(saved, isNew) => {
          setAccounts((list) => (isNew ? [...list, saved] : list.map((x) => (x.id === saved.id ? saved : x))).sort((a, b) => a.name.localeCompare(b.name)));
          if (isNew && adding?.suggestion) setSuggestions((list) => list.filter((s) => s.key !== adding.suggestion));
          router.refresh();
        }}
        onDeleted={(id) => {
          setAccounts((list) => list.filter((x) => x.id !== id));
          router.refresh();
        }}
      />
    </section>
  );
}

function OwnAccountDialog({
  account,
  draft,
  open,
  onOpenChange,
  onSaved,
  onDeleted,
}: {
  account: OwnAccount | null;
  draft: Draft | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (account: OwnAccount, isNew: boolean) => void;
  onDeleted: (id: number) => void;
}) {
  const t = useTranslations("accountForms.own");
  // Keep showing the last account or draft while the sheet animates out.
  const current = account ?? draft;
  const [shown, setShown] = useState<{ account: OwnAccount | null; draft: Draft | null }>({ account, draft });
  if (current && (account !== shown.account || draft !== shown.draft)) setShown({ account, draft });
  const title = shown.account ? t("editTitle") : t("addTitle");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideHeaderRow title={title} className="gap-[18px] pt-6 font-clear text-clear-ink" sheetClassName="lg:max-w-[560px]">
        <OwnAccountForm
          account={shown.account}
          draft={shown.draft}
          title={title}
          onClose={() => onOpenChange(false)}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      </DialogContent>
    </Dialog>
  );
}

function OwnAccountForm({
  account,
  draft,
  title,
  onClose,
  onSaved,
  onDeleted,
}: {
  account: OwnAccount | null;
  draft: Draft | null;
  title: string;
  onClose: () => void;
  onSaved: (account: OwnAccount, isNew: boolean) => void;
  onDeleted: (id: number) => void;
}) {
  const t = useTranslations("accountForms.own");
  const tForms = useTranslations("accountForms");
  const confirm = useConfirm();
  const ids = useId();
  const start = account ?? draft;
  const [name, setName] = useState(start?.name ?? "");
  const [accountNumber, setAccountNumber] = useState(start?.accountNumber ?? "");
  const [matchText, setMatchText] = useState(start?.matchText ?? "");
  const [kind, setKind] = useState<OwnAccountKind>(kindOf(start?.transferKind));
  const [busy, setBusy] = useState(false);

  // Same rule as the API: a name, and an account number or 4+ characters to match.
  const hasMatch = !!accountNumber.trim() || matchText.replace(/\s+/g, "").length >= 4;
  const canSave = !busy && !!name.trim() && hasMatch;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    const res = await fetch("/api/own-accounts", {
      method: account ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: account?.id, name, accountNumber, matchText, transferKind: kind }),
    });
    setBusy(false);
    if (!res.ok) return;
    onSaved(await res.json(), !account);
    onClose();
  }

  async function remove() {
    if (!account) return;
    const ok = await confirm({ title: t("confirmDelete"), body: t("confirmDeleteBody"), confirmLabel: t("confirmDeleteLabel"), destructive: true });
    if (!ok) return;
    setBusy(true);
    await fetch("/api/own-accounts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: account.id }) });
    setBusy(false);
    onDeleted(account.id);
    onClose();
  }

  return (
    <>
      <ClearDialogHeader title={title} subtitle={t("subtitle")} onClose={onClose} closeLabel={tForms("close")} />

      <ClearField label={t("name")} htmlFor={`${ids}-name`}>
        <ClearInput id={`${ids}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} autoComplete="off" />
      </ClearField>

      <div className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL} aria-hidden>{t("kind")}</span>
        <Segmented
          label={t("kind")}
          surface="tile"
          value={kind}
          onChange={setKind}
          className="w-full [&>button]:flex-1 [&>button]:gap-2 [&>button]:px-2"
          items={KINDS.map((v) => {
            const KindIcon = KIND_STYLE[v].icon;
            return {
              value: v,
              label: (
                <>
                  <KindIcon aria-hidden size={16} stroke={2} className="hidden sm:block" />
                  {t(`kinds.${v}`)}
                </>
              ),
            };
          })}
        />
      </div>

      <ClearField label={t("accountNumber")} htmlFor={`${ids}-number`} hint={t("accountNumberHint")}>
        <ClearInput
          id={`${ids}-number`}
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
          placeholder="NL00 BANK 0000 0000 00"
          autoComplete="off"
          className="font-bold tracking-[0.02em] tabular-nums"
        />
      </ClearField>

      <ClearField label={t("matchText")} htmlFor={`${ids}-match`} hint={t("matchTextHint")}>
        <ClearInput id={`${ids}-match`} value={matchText} onChange={(e) => setMatchText(e.target.value)} placeholder="Revolut**1234" autoComplete="off" />
      </ClearField>

      {!hasMatch && <p className="m-0 -mt-1.5 text-[13px] text-clear-ember-text">{t("needsMatch")}</p>}

      <ClearDialogFooterDock className="border-t border-clear-ground pt-[18px] pb-1">
        <ClearDialogFooter
          destructive={
            account && (
              <button type="button" onClick={remove} disabled={busy} className={clearButtonVariants({ variant: "danger" })}>
                <IconTrash aria-hidden />
                {tForms("delete")}
              </button>
            )
          }
        >
          <button type="button" onClick={onClose} className={clearButtonVariants({ variant: "secondary" })}>
            {tForms("cancel")}
          </button>
          <button type="button" onClick={save} disabled={!canSave} className={clearButtonVariants()}>
            {busy ? tForms("saving") : account ? tForms("save") : t("addShort")}
          </button>
        </ClearDialogFooter>
      </ClearDialogFooterDock>
    </>
  );
}
