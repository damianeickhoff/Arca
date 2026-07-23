"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  IconTrashFilled as Trash2,
  IconChevronRight as ChevronRight,
  IconCheck as Check,
  IconCreditCardFilled as CreditCard,
  IconCoinEuro as Coin,
  IconCalendarEvent as Calendar,
  IconCategory2 as CategoryIcon,
  IconNote as Note,
  IconPencilFilled as Pencil,
  IconScale as Scale,
  IconAlertTriangle as AlertTriangle,
} from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/date-picker";
import { IconPicker } from "@/components/icon-picker";
import { ColorPicker } from "@/components/color-picker";
import { ToggleSwitch } from "@/components/toggle-switch";
import { SubSheet } from "@/components/sub-sheet";
import { Icon, isBrandIcon } from "@/components/icon";
import { AmountKeypad } from "@/components/amount-keypad";
import { WarningBanner } from "@/components/warning-banner";
import { evaluateExpression } from "@/lib/amount-expression";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Bank, VermogenAccount } from "@/db/schema";
import { TRANSFER_TYPES } from "@/lib/transfer-types";

// ─── Shared option constants / labels (single source of truth) ───────────────

export const TRANSFER_KIND_OPTIONS = [
  { value: "", label: "None" },
  ...TRANSFER_TYPES.filter((t) => t.value !== "other").map((t) => ({ value: t.value, label: t.label })),
];

export const VERMOGEN_TYPES: { value: string; label: string }[] = [
  { value: "spaarrekening", label: "Savings account" },
  { value: "beleggingen",   label: "Investments" },
  { value: "betaalrekening", label: "Checking account" },
  { value: "bezitting",     label: "Possession" },
];

export const VERMOGEN_TYPE_OPTIONS = VERMOGEN_TYPES;

export function vermogenTypeLabel(type: string) {
  return VERMOGEN_TYPES.find((t) => t.value === type)?.label ?? type;
}

// "Type" options for the mobile add/edit account dialogs. Bank-kind values reuse
// the existing banks.cardType vocabulary (just relabeled: debitcard -> "Bank"), so
// no schema change is needed for them. "investment" is the one value that maps to
// a vermogen_accounts row instead (type="beleggingen") — only offered in the Add
// dialog, since converting an existing bank row into an asset row isn't supported.
export const BANK_TYPE_OPTIONS = [
  { value: "cash",       label: "Cash" },
  { value: "debitcard",  label: "Bank" },
  { value: "creditcard", label: "Credit card" },
  { value: "savings",    label: "Savings" },
];

export const ACCOUNT_TYPE_OPTIONS = [
  ...BANK_TYPE_OPTIONS,
  { value: "investment", label: "Investment" },
];

export const CARD_TYPE_OPTIONS = BANK_TYPE_OPTIONS;

export const CARD_TYPE_LABELS: Record<string, string> = {
  debitcard:  "Betaalpas",
  creditcard: "Creditcard",
  savings:    "Spaarrekening",
  cash:       "Contant",
};

// Row that opens a slide-in SubSheet subpage — matches the debt/savings-goal/
// recurring-item edit dialogs, so tapping any field behaves the same everywhere.
function Row({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 rounded-2xl bg-[var(--dialog-content-background)] px-4 py-4 text-left active:bg-foreground/[0.04] transition-colors">
      <span className="text-foreground/40 shrink-0">{icon}</span>
      <span className="flex-1 font-medium text-foreground">{label}</span>
      <span className="flex items-center gap-1.5 text-foreground/60 min-w-0">
        <span className="truncate max-w-[45vw]">{value}</span>
      </span>
      <ChevronRight className="size-5 text-foreground/30 shrink-0" />
    </button>
  );
}

function OptionList({ options, value, onSelect }: { options: { value: string; label: string }[]; value: string; onSelect: (v: string) => void }) {
  return (
    <div className="rounded-2xl bg-[var(--dialog-content-background)] overflow-hidden divide-y divide-border/50">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onSelect(o.value)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-foreground/[0.04] transition-colors">
          <span className="flex-1 font-medium">{o.label}</span>
          {value === o.value && <Check className="size-5 text-foreground/70 shrink-0" />}
        </button>
      ))}
    </div>
  );
}

// Compact +/- segmented pill for picking the sign of the balance being entered —
// same "raised active segment" language as the Expense/Income toggle on the add-
// transaction page, just reduced to two icon-only segments.
function SignPill({ value, onChange }: { value: "+" | "−"; onChange: (v: "+" | "−") => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-card p-1">
      {(["+", "−"] as const).map((s) => {
        const active = value === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            aria-label={s === "+" ? "Positive" : "Negative"}
            className={cn(
              "flex items-center justify-center size-10 rounded-full text-lg font-bold transition-colors",
              active
                ? s === "+"
                  ? "bg-success text-background"
                  : "bg-destructive text-background"
                : "bg-foreground/8 text-foreground/45",
            )}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}

// Simple boolean row — no tap-to-expand needed for a single switch.
function NetWorthToggleRow({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-center gap-3 rounded-2xl bg-[var(--dialog-content-background)] px-4 py-4 text-left active:bg-foreground/[0.04] transition-colors"
    >
      <span className="text-foreground/40 shrink-0"><Scale className="size-5" /></span>
      <span className="flex-1 font-medium text-foreground">Include in net worth</span>
      <ToggleSwitch on={checked} />
    </button>
  );
}

// ─── Bank edit dialog (controlled) ───────────────────────────────────────────
// The caller owns open/close state; on a successful save/delete the dialog reports
// the change back so the caller can update its own local list and refresh.

export function BankEditDialog({
  bank,
  open,
  onOpenChange,
  onSaved,
  onDeleted,
}: {
  bank: Bank | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (updated: Bank) => void;
  onDeleted: (id: number) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [subpage, setSubpage] = useState<string | null>(null);
  const [subVisible, setSubVisible] = useState(false);
  function openSub(k: string) { setSubpage(k); requestAnimationFrame(() => setSubVisible(true)); }
  function closeSub() { setSubVisible(false); setTimeout(() => setSubpage(null), 300); }

  const [displayName, setDisplayName]       = useState("");
  const [icon, setIcon]                     = useState<string | null>(null);
  const [color, setColor]                   = useState("#2f7bf6");
  const [iconOpen, setIconOpen]             = useState(false);
  const [cardType, setCardType]             = useState("");
  const [expiration, setExpiration]         = useState("");
  const [includeInNetWorth, setIncludeInNetWorth] = useState(false);

  // The "Balance" row edits the account's live, transaction-derived balance (not the
  // raw startingBalance column directly) — see the balance-correction math in save().
  // Nothing here takes effect until the balance subpage's own Save button is pressed
  // and its warning is accepted — closing the subpage via the back arrow (or the whole
  // dialog) discards whatever was typed, per confirmedBalance staying untouched.
  const [liveBalance, setLiveBalance] = useState<number | null>(null);
  const [confirmedBalance, setConfirmedBalance] = useState<number | null>(null);
  const [balanceExpr, setBalanceExpr] = useState("");
  const [balanceSign, setBalanceSign] = useState<"+" | "−">("+");

  // Re-seed the form whenever a different bank is opened.
  const [seededFor, setSeededFor] = useState<number | null>(null);
  if (bank && open && seededFor !== bank.id) {
    setSeededFor(bank.id);
    setDisplayName(bank.displayName ?? "");
    setIcon(bank.icon ?? null);
    setColor(bank.color ?? "#2f7bf6");
    setCardType(bank.cardType ?? "");
    setExpiration(bank.expirationDate ?? "");
    setIncludeInNetWorth(bank.includeInNetWorth ?? false);
    setLiveBalance(null);
    setConfirmedBalance(null);
  }
  if (!open && seededFor !== null) setSeededFor(null);

  // Fetch the live balance once per bank — just for display and for the txnSum math,
  // the amount pad itself is seeded lazily when the subpage opens (see openBalanceSub).
  useEffect(() => {
    if (!bank || !open) return;
    let cancelled = false;
    fetch(`/api/banks/${bank.id}/balance`)
      .then((r) => r.json())
      .then((data: { balance?: number }) => {
        if (cancelled || data.balance == null) return;
        setLiveBalance(data.balance);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only bank.id/open should retrigger the fetch
  }, [bank?.id, open]);

  const displayBalance = confirmedBalance ?? liveBalance;
  const enteredBalance = (balanceSign === "−" ? -1 : 1) * (evaluateExpression(balanceExpr) ?? 0);

  function openBalanceSub() {
    const base = confirmedBalance ?? liveBalance ?? 0;
    setBalanceSign(base < 0 ? "−" : "+");
    setBalanceExpr(String(Math.abs(base)).replace(".", ","));
    openSub("balance");
  }

  // Pressing "Save balance" persists immediately (everything else currently in the
  // form too, same as the outer Save) and closes the whole dialog — it does not just
  // stage the value for a second, separate press of the outer Save button.
  async function confirmBalance() {
    if (!confirm("You're correcting this account's balance directly, not logging a transaction. This shifts every past and future balance shown for this account — make sure the new amount is right. Continue?")) {
      return;
    }
    setConfirmedBalance(enteredBalance);
    await save(enteredBalance);
  }

  async function save(balanceOverride?: number) {
    if (!bank) return;
    // Editing "Balance" corrects the transaction-derived total, not the raw offset —
    // recompute startingBalance so that startingBalance + (existing txn sum) equals
    // whatever the user confirmed on the balance subpage. This is a balance correction,
    // never a fake transaction.
    const effectiveBalance = balanceOverride ?? confirmedBalance;
    let nextStartingBalance = bank.startingBalance ?? null;
    if (effectiveBalance != null && liveBalance != null) {
      const txnSum = liveBalance - (bank.startingBalance ?? 0);
      nextStartingBalance = effectiveBalance - txnSum;
    }
    setSaving(true);
    const res = await fetch("/api/banks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: bank.id,
        displayName: displayName || null,
        icon: icon || null,
        color: color || null,
        cardType: cardType || null,
        expirationDate: expiration || null,
        startingBalance: nextStartingBalance,
        includeInNetWorth,
      }),
    });
    const updated = await res.json();
    onSaved(updated);
    onOpenChange(false);
    setSaving(false);
    router.refresh();
  }

  async function remove() {
    if (!bank) return;
    if (!confirm("Delete this bank account?")) return;
    await fetch("/api/banks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: bank.id }) });
    onDeleted(bank.id);
    onOpenChange(false);
    router.refresh();
  }

  const cardTypeLabel = BANK_TYPE_OPTIONS.find((o) => o.value === cardType)?.label ?? "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="px-0"
        title="Edit account"
        accentColor={color || null}
        scrollBlur
        headerAction={
          <button
            type="button"
            onClick={remove}
            aria-label="Delete"
            className="size-11 rounded-full bg-white/60 dark:bg-white/7 flex items-center justify-center text-foreground active:scale-[0.95] transition-transform"
          >
            <Trash2 className="size-4.5" />
          </button>
        }
        footer={
          <Button
            onClick={() => save()}
            disabled={saving}
            className="w-full h-13 rounded-full bg-foreground text-background hover:bg-foreground/90 text-base font-semibold"
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        }
      >
        {/* Hero — big account glyph (tap to change icon) + name. */}
        <div className="flex flex-col items-center gap-3 pb-6 pt-1">
          <button
            type="button"
            onClick={() => setIconOpen(true)}
            aria-label="Change icon"
            className="relative active:scale-95 transition-transform"
          >
            {icon ? (
              <Icon iconKey={icon} color={color} size="xxl" />
            ) : (
              <span className="flex size-16 items-center justify-center rounded-3xl text-white shadow-lg" style={{ backgroundColor: color }}>
                <CreditCard className="size-8" />
              </span>
            )}
            <span className="absolute -right-1.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-black text-white shadow-md ring-2 ring-background">
              <Pencil className="size-3.5" />
            </span>
          </button>
          <p className="text-xl font-bold text-foreground text-center px-6 truncate max-w-full">
            {displayName || bank?.accountNumber || "Account"}
          </p>
          {/* Controlled — opened by tapping the hero above. */}
          <IconPicker value={icon} onChange={setIcon} previewColor={color} open={iconOpen} onOpenChange={setIconOpen} hideDefaultTrigger />
        </div>

        <div className="space-y-3 px-5 pb-2">
          {/* Name input + color swatch, matching the account edit sheet. */}
          <div className="flex flex-wrap items-center gap-x-3">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Name" className="flex-1 h-14 rounded-2xl bg-[var(--dialog-content-background)] border-0 px-4 text-base" />
            {!(icon && isBrandIcon(icon)) && (
              <ColorPicker value={color} onChange={setColor} inline />
            )}
          </div>

          <Row icon={<CreditCard className="size-5" />} label="Type" value={cardTypeLabel} onClick={() => openSub("cardType")} />
          <Row icon={<Calendar className="size-5" />} label="Expiry date" value={expiration || "—"} onClick={() => openSub("expiration")} />
          <Row icon={<Coin className="size-5" />} label="Balance" value={displayBalance != null ? formatEur(displayBalance) : "—"} onClick={openBalanceSub} />

          <NetWorthToggleRow checked={includeInNetWorth} onChange={setIncludeInNetWorth} />
        </div>

        {subpage && (
          <SubSheet title={BANK_SUB_TITLES[subpage]} visible={subVisible} onClose={closeSub}>
            {subpage === "cardType" && (
              <OptionList options={BANK_TYPE_OPTIONS} value={cardType} onSelect={(v) => { setCardType(v); closeSub(); }} />
            )}
            {subpage === "expiration" && (
              <div className="pt-2">
                <DatePicker value={expiration} onChange={(v) => { setExpiration(v); closeSub(); }} triggerClassName="w-full justify-between border rounded-xl px-4 h-12 bg-[var(--dialog-content-background)]" />
              </div>
            )}
            {subpage === "balance" && (
              <div className="pt-2 space-y-4">
                <WarningBanner severity="warning">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>This corrects the account&apos;s balance directly — it does not create a transaction. Changing it shifts every balance shown for this account, so only use it to fix a real discrepancy. Nothing changes until you save below.</span>
                </WarningBanner>
                <div className="flex justify-center">
                  <SignPill value={balanceSign} onChange={setBalanceSign} />
                </div>
                <AmountKeypad
                  expr={balanceExpr}
                  onChange={setBalanceExpr}
                  sign={balanceSign}
                  positive={balanceSign === "+"}
                  calcEnabled
                />
                <Button
                  onClick={confirmBalance}
                  className="w-full h-13 rounded-full bg-foreground text-background hover:bg-foreground/90 text-base font-semibold"
                >
                  Save balance
                </Button>
              </div>
            )}
          </SubSheet>
        )}
      </DialogContent>
    </Dialog>
  );
}

const BANK_SUB_TITLES: Record<string, string> = {
  cardType: "Type",
  expiration: "Expiry date",
  balance: "Balance",
};

// ─── Asset (vermogen) edit dialog (controlled) ───────────────────────────────

export function VermogenEditDialog({
  account,
  open,
  onOpenChange,
  onSaved,
  onDeleted,
}: {
  account: VermogenAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (updated: VermogenAccount) => void;
  onDeleted: (id: number) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [subpage, setSubpage] = useState<string | null>(null);
  const [subVisible, setSubVisible] = useState(false);
  function openSub(k: string) { setSubpage(k); requestAnimationFrame(() => setSubVisible(true)); }
  function closeSub() { setSubVisible(false); setTimeout(() => setSubpage(null), 300); }

  const [name, setName]               = useState("");
  const [type, setType]               = useState("");
  const [value, setValue]             = useState("");
  const [color, setColor]             = useState("#0f9d8c");
  const [notes, setNotes]             = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [includeInNetWorth, setIncludeInNetWorth] = useState(true);

  const [seededFor, setSeededFor] = useState<number | null>(null);
  if (account && open && seededFor !== account.id) {
    setSeededFor(account.id);
    setName(account.name);
    setType(account.type);
    setValue(String(account.value));
    setColor(account.color ?? "#0f9d8c");
    setNotes(account.notes ?? "");
    setLastUpdated(account.lastUpdated ?? "");
    setIncludeInNetWorth(account.includeInNetWorth ?? true);
  }
  if (!open && seededFor !== null) setSeededFor(null);

  async function save() {
    if (!account) return;
    setSaving(true);
    const res = await fetch("/api/vermogen", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: account.id,
        name,
        type,
        value: parseFloat(value) || 0,
        color: color || null,
        notes: notes || null,
        lastUpdated: lastUpdated || null,
        includeInNetWorth,
      }),
    });
    const updated = await res.json();
    onSaved(updated);
    onOpenChange(false);
    setSaving(false);
    router.refresh();
  }

  async function remove() {
    if (!account) return;
    if (!confirm("Delete dit item?")) return;
    await fetch("/api/vermogen", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: account.id }) });
    onDeleted(account.id);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="px-0"
        title="Edit item"
        accentColor={color || null}
        scrollBlur
        headerAction={
          <button
            type="button"
            onClick={remove}
            aria-label="Delete"
            className="size-11 rounded-full bg-foreground/10 flex items-center justify-center text-foreground active:scale-[0.95] transition-transform"
          >
            <Trash2 className="size-4.5" />
          </button>
        }
        footer={
          <Button
            onClick={save}
            disabled={saving}
            className="w-full h-13 rounded-full bg-foreground text-background hover:bg-foreground/90 text-base font-semibold"
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        }
      >
        {/* Hero — large account glyph + name, matching the bank edit sheet. */}
        <div className="flex flex-col items-center gap-3 pb-6 pt-1">
          <div className="flex size-20 items-center justify-center rounded-3xl text-white shadow-lg" style={{ backgroundColor: color }}>
            <Coin className="size-9" />
          </div>
          <p className="text-xl font-bold text-foreground text-center px-6 truncate max-w-full">
            {name || "Account"}
          </p>
        </div>

        <div className="space-y-3 px-5 pb-2">
          <div className="flex flex-wrap items-center gap-x-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="flex-1 h-14 rounded-2xl bg-[var(--dialog-content-background)] border-0 px-4 text-base" />
            <ColorPicker value={color} onChange={setColor} inline />
          </div>

          <Row icon={<CategoryIcon className="size-5" />} label="Type" value={vermogenTypeLabel(type)} onClick={() => openSub("type")} />
          <Row icon={<Coin className="size-5" />} label="Value" value={value !== "" ? formatEur(parseFloat(value)) : "—"} onClick={() => openSub("value")} />
          <Row icon={<Calendar className="size-5" />} label="Last updated" value={lastUpdated || "—"} onClick={() => openSub("lastUpdated")} />
          <Row icon={<Note className="size-5" />} label="Notes" value={notes || "—"} onClick={() => openSub("notes")} />

          <NetWorthToggleRow checked={includeInNetWorth} onChange={setIncludeInNetWorth} />
        </div>

        {subpage && (
          <SubSheet title={VERMOGEN_SUB_TITLES[subpage]} visible={subVisible} onClose={closeSub}>
            {subpage === "type" && (
              <OptionList options={VERMOGEN_TYPE_OPTIONS} value={type} onSelect={(v) => { setType(v); closeSub(); }} />
            )}
            {subpage === "value" && (
              <div className="pt-2">
                <AmountInput value={value} onChange={(e) => setValue(e.target.value)} data-autofocus data-no-keyboard-scroll />
              </div>
            )}
            {subpage === "lastUpdated" && (
              <div className="pt-2">
                <DatePicker value={lastUpdated} onChange={(v) => { setLastUpdated(v); closeSub(); }} triggerClassName="w-full justify-between border rounded-xl px-4 h-12 bg-[var(--dialog-content-background)]" />
              </div>
            )}
            {subpage === "notes" && (
              <div className="pt-2">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} data-autofocus data-no-keyboard-scroll className="h-12" />
              </div>
            )}
          </SubSheet>
        )}
      </DialogContent>
    </Dialog>
  );
}

const VERMOGEN_SUB_TITLES: Record<string, string> = {
  type: "Type",
  value: "Value",
  lastUpdated: "Last updated",
  notes: "Notes",
};

// ─── Add account dialog (controlled) ─────────────────────────────────────────
// Single entry point for adding either kind of account — the "Type" picker decides
// whether Save creates a `banks` row or a `vermogen_accounts` row (see ACCOUNT_TYPE_OPTIONS).
// Styled to match BankEditDialog/VermogenEditDialog rather than the old two-step
// chooser + routed form pages.

export function AddAccountDialog({
  open,
  onOpenChange,
  onBankAdded,
  onAssetAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBankAdded: (bank: Bank) => void;
  onAssetAdded: (account: VermogenAccount) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [subpage, setSubpage] = useState<string | null>(null);
  const [subVisible, setSubVisible] = useState(false);
  function openSub(k: string) { setSubpage(k); requestAnimationFrame(() => setSubVisible(true)); }
  function closeSub() { setSubVisible(false); setTimeout(() => setSubpage(null), 300); }

  const [name, setName]                 = useState("");
  const [icon, setIcon]                 = useState<string | null>(null);
  const [color, setColor]               = useState("#2f7bf6");
  const [iconOpen, setIconOpen]         = useState(false);
  const [type, setType]                 = useState("");
  const [initialBalanceExpr, setInitialBalanceExpr] = useState("");
  const [initialBalanceSign, setInitialBalanceSign] = useState<"+" | "−">("+");
  const [includeInNetWorth, setIncludeInNetWorth] = useState(false);

  const isAsset = type === "investment";
  const initialBalance = initialBalanceExpr === "" ? null : (initialBalanceSign === "−" ? -1 : 1) * (evaluateExpression(initialBalanceExpr) ?? 0);

  // Reset the form whenever the dialog is (re-)opened.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setIcon(null);
      setColor("#2f7bf6");
      setType("");
      setInitialBalanceExpr("");
      setInitialBalanceSign("+");
      setIncludeInNetWorth(false);
    }
  }

  async function save() {
    if (!name || !type) return;
    setSaving(true);
    if (isAsset) {
      const res = await fetch("/api/vermogen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type: "beleggingen",
          value: initialBalance ?? 0,
          color: color || null,
          includeInNetWorth,
        }),
      });
      const created = await res.json();
      onAssetAdded(created);
    } else {
      const res = await fetch("/api/banks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: name,
          icon: icon || null,
          color: color || null,
          cardType: type,
          startingBalance: initialBalance,
          includeInNetWorth,
        }),
      });
      const created = await res.json();
      onBankAdded(created);
    }
    setSaving(false);
    onOpenChange(false);
    router.refresh();
  }

  const typeLabel = ACCOUNT_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? "—";
  const canSave = !saving && !!name && !!type;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="px-0"
        title="Add account"
        accentColor={color || null}
        scrollBlur
        footer={
          <Button
            onClick={save}
            disabled={!canSave}
            className="w-full h-13 rounded-full bg-foreground text-background hover:bg-foreground/90 text-base font-semibold"
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        }
      >
        {/* Hero — big account glyph (tap to change icon) + name. */}
        <div className="flex flex-col items-center gap-3 pb-6 pt-1">
          <button
            type="button"
            onClick={() => setIconOpen(true)}
            aria-label="Change icon"
            className="relative active:scale-95 transition-transform"
          >
            {icon ? (
              <Icon iconKey={icon} color={color} size="xxl" />
            ) : (
              <span className="flex size-16 items-center justify-center rounded-3xl text-white shadow-lg" style={{ backgroundColor: color }}>
                {isAsset ? <Coin className="size-8" /> : <CreditCard className="size-8" />}
              </span>
            )}
            <span className="absolute -right-1.5 -top-1.5 flex size-7 items-center justify-center rounded-full bg-foreground text-background shadow-md ring-2 ring-background">
              <Pencil className="size-3.5" />
            </span>
          </button>
          <p className="text-xl font-bold text-foreground text-center px-6 truncate max-w-full">
            {name || "Account"}
          </p>
          <IconPicker value={icon} onChange={setIcon} previewColor={color} open={iconOpen} onOpenChange={setIconOpen} hideDefaultTrigger />
        </div>

        <div className="space-y-3 px-5 pb-2">
          <div className="flex flex-wrap items-center gap-x-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="flex-1 h-14 rounded-2xl bg-[var(--dialog-content-background)] border-0 px-4 text-base" />
            {!(icon && isBrandIcon(icon)) && (
              <ColorPicker value={color} onChange={setColor} inline />
            )}
          </div>

          <Row icon={<CategoryIcon className="size-5" />} label="Type" value={typeLabel} onClick={() => openSub("type")} />
          {!isAsset && (
            <Row icon={<Coin className="size-5" />} label="Initial balance" value={initialBalance !== null ? formatEur(initialBalance) : "—"} onClick={() => openSub("initialBalance")} />
          )}

          <NetWorthToggleRow checked={includeInNetWorth} onChange={setIncludeInNetWorth} />
        </div>

        {subpage && (
          <SubSheet title={ADD_ACCOUNT_SUB_TITLES[subpage]} visible={subVisible} onClose={closeSub}>
            {subpage === "type" && (
              <OptionList options={ACCOUNT_TYPE_OPTIONS} value={type} onSelect={(v) => { setType(v); closeSub(); }} />
            )}
            {subpage === "initialBalance" && (
              <div className="pt-2 space-y-4">
                <div className="flex justify-center">
                  <SignPill value={initialBalanceSign} onChange={setInitialBalanceSign} />
                </div>
                <AmountKeypad
                  expr={initialBalanceExpr}
                  onChange={setInitialBalanceExpr}
                  sign={initialBalanceSign}
                  positive={initialBalanceSign === "+"}
                  calcEnabled
                />
                <p className="text-xs text-foreground/50 text-center">
                  The initial balance is added to this account&apos;s balance but never affects reports.
                </p>
              </div>
            )}
          </SubSheet>
        )}
      </DialogContent>
    </Dialog>
  );
}

const ADD_ACCOUNT_SUB_TITLES: Record<string, string> = {
  type: "Type",
  initialBalance: "Initial balance",
};
