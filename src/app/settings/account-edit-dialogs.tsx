"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  IconAlertTriangle,
  IconBuildingBank,
  IconCash,
  IconChartLine,
  IconCheck,
  IconCreditCard,
  IconHome,
  IconInfoCircle,
  IconLink,
  IconPigMoney,
  IconTrash,
  IconWallet,
} from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField, ClearInput } from "@/components/clear/field";
import { ClearSwitch } from "@/components/clear/switch";
import { Segmented } from "@/components/clear/segmented";
import { IconTile } from "@/components/clear/icon-tile";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { useConfirm } from "@/components/clear/confirm-dialog";
import type { ClearTone } from "@/components/clear/tones";
import { ClearSelect } from "@/components/settings/accounts/clear-select";
import { DatePicker } from "@/components/date-picker";
import { IconPickerDialog } from "@/components/icon-picker";
import { Icon, softIconColors } from "@/components/icon";
import { parseAmountInput } from "@/app/debts/debt-form-dialog";
import { currencySymbol, formatEur } from "@/lib/format";
import { roundToCents } from "@/lib/transaction-splits";
import { TRANSFER_TYPES } from "@/lib/transfer-types";
import { cn } from "@/lib/utils";
import type { Bank, VermogenAccount } from "@/db/schema";
import { MoneyText } from "@/components/clear/money";

// ─── Account vocabularies ────────────────────────────────────────────────────
// banks.cardType and vermogen_accounts.type keep their stored values; only the
// labels (accountForms.bankTypes / accountForms.assetTypes) and glyphs live here.

export const BANK_TYPES = ["debitcard", "savings", "creditcard", "cash"] as const;
type BankType = (typeof BANK_TYPES)[number];

const BANK_TYPE_ICON: Record<BankType, typeof IconWallet> = {
  debitcard: IconWallet,
  savings: IconPigMoney,
  creditcard: IconCreditCard,
  cash: IconCash,
};

export const ASSET_TYPES = ["spaarrekening", "beleggingen", "bezitting", "betaalrekening"] as const;
type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_TYPE_STYLE: Record<AssetType, { icon: typeof IconWallet; tone: ClearTone }> = {
  spaarrekening: { icon: IconPigMoney, tone: "sky" },
  beleggingen: { icon: IconChartLine, tone: "mint" },
  bezitting: { icon: IconHome, tone: "butter" },
  betaalrekening: { icon: IconWallet, tone: "stone" },
};

const TRANSFER_KINDS = TRANSFER_TYPES.filter((t) => t.value !== "other").map((t) => t.value);

export const DEFAULT_BANK_COLOR = "#2f7bf6";
export const DEFAULT_ASSET_COLOR = "#0f9d8c";

function isBankType(v: string | null | undefined): v is BankType {
  return !!v && (BANK_TYPES as readonly string[]).includes(v);
}

function isAssetType(v: string | null | undefined): v is AssetType {
  return !!v && (ASSET_TYPES as readonly string[]).includes(v);
}

/** Translated labels for a bank's cardType and an asset's type; unknown values pass through. */
export function useAccountTypeLabels() {
  const t = useTranslations("accountForms");
  return {
    bankType: (v: string | null | undefined) => (isBankType(v) ? t(`bankTypes.${v}`) : v ?? ""),
    assetType: (v: string | null | undefined) => (isAssetType(v) ? t(`assetTypes.${v}`) : v ?? ""),
  };
}

/** The glyph of an account: its chosen icon as a soft tile, else `fallback` tinted with its colour. */
export function AccountGlyph({
  icon,
  color,
  fallback: Fallback,
  size = "md",
}: {
  icon: string | null;
  color: string;
  fallback: typeof IconWallet;
  size?: "sm" | "md";
}) {
  if (icon) return <Icon iconKey={icon} color={color} size={size} soft />;
  const tint = softIconColors(color);
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-clear-icon", size === "sm" ? "size-8" : "size-10")}
      style={{ background: tint.background, color: tint.foreground }}
    >
      <Fallback size={size === "sm" ? 17 : 20} stroke={2} />
    </span>
  );
}

export function assetGlyph(type: string) {
  return isAssetType(type) ? ASSET_TYPE_STYLE[type].icon : IconWallet;
}

// ─── Shared form bits ────────────────────────────────────────────────────────

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** An amount as typed, a leading minus allowed ("−420,00", "-1.950,50", "100+25"). */
export function parseMoney(raw: string): number | null {
  const s = raw.trim();
  const negative = /^[-−]/.test(s);
  const value = parseAmountInput(negative ? s.slice(1) : s);
  return value == null ? null : negative ? -value : value;
}

/** A number as the money field shows it: "1950,5" → "1950,50"-style, no float noise. */
export function moneyToExpr(n: number) {
  return String(roundToCents(n)).replace(".", ",");
}

const OPERATOR = /\d\s*[+*/×÷]\s*\d|\d\s*[-−]\s*\d/;

const FIELD_BOX =
  "flex h-12 items-center gap-1.5 rounded-clear-row border-[1.5px] border-transparent bg-clear-tile px-4 transition-colors focus-within:border-clear-ink";
const FIELD_INPUT =
  "min-w-0 w-full flex-1 border-none bg-transparent p-0 font-clear text-[15px] font-extrabold tabular-nums text-clear-ink outline-none placeholder:font-semibold placeholder:text-clear-placeholder";
export const FIELD_LABEL = "text-[13px] font-bold text-clear-ink-2";
export const DATE_TRIGGER =
  "mt-0 mb-0 h-12 rounded-clear-row border-[1.5px] border-transparent bg-clear-tile px-4 font-clear text-[15px] font-bold text-clear-ink focus-visible:border-clear-ink focus-visible:ring-0";

/** A money field: currency sign, the amount (sums and a leading minus allowed) and what a sum comes to. */
export function MoneyInput({
  id,
  value,
  onChange,
  describedBy,
  className,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  describedBy?: string;
  className?: string;
}) {
  const result = OPERATOR.test(value) ? parseMoney(value) : null;
  return (
    <div className={cn(FIELD_BOX, className)}>
      <span aria-hidden className="text-[15px] font-bold text-clear-muted">{currencySymbol()}</span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0,00"
        aria-describedby={describedBy}
        className={FIELD_INPUT}
      />
      {result != null && <span className="shrink-0 text-[13px] font-semibold whitespace-nowrap text-clear-muted">= <MoneyText>{formatEur(result)}</MoneyText></span>}
    </div>
  );
}

function useDateLabel() {
  const t = useTranslations("accountForms");
  const locale = useLocale();
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  return (date: string) => (date === todayISO() ? t("today") : fmt.format(new Date(`${date}T12:00:00`)));
}

/** Label + DatePicker, the label naming the picker's group. */
function DateField({
  label,
  value,
  onChange,
  onClear,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onClear?: () => void;
}) {
  const t = useTranslations("accountForms");
  const dateLabel = useDateLabel();
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-1.5">
      <span id={id} className={FIELD_LABEL}>{label}</span>
      <DatePicker
        value={value}
        onChange={onChange}
        onClear={onClear}
        label={value ? dateLabel(value) : t("notSet")}
        triggerClassName={DATE_TRIGGER}
      />
    </div>
  );
}

/** The "Include in net worth" tile. */
function NetWorthSwitch({ checked, onChange, hint }: { checked: boolean; onChange: (v: boolean) => void; hint: string }) {
  const t = useTranslations("accountForms");
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 rounded-clear-tile bg-clear-tile px-4 py-3.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span id={`${id}-label`} className="text-[15px] font-bold">{t("includeInNetWorth")}</span>
        <span id={`${id}-hint`} className="text-[13px] text-clear-muted">{hint}</span>
      </div>
      <ClearSwitch checked={checked} onCheckedChange={onChange} labelledBy={`${id}-label`} />
    </div>
  );
}

/** Name field with the account glyph inside it; the glyph opens the icon & colour sheet. */
function NameField({
  id,
  label,
  value,
  onChange,
  placeholder,
  glyph,
  onGlyphClick,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  glyph: React.ReactNode;
  onGlyphClick: () => void;
}) {
  const t = useTranslations("accountForms");
  return (
    <ClearField label={label} htmlFor={id}>
      <div className={cn(FIELD_BOX, "gap-2.5 pl-2")}>
        <button
          type="button"
          onClick={onGlyphClick}
          aria-label={t("chooseIconColor")}
          title={t("chooseIconColor")}
          className="shrink-0 cursor-pointer rounded-clear-icon outline-none transition-transform focus-visible:ring-3 focus-visible:ring-clear-ember/50 active:scale-[0.94]"
        >
          {glyph}
        </button>
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="min-w-0 w-full flex-1 border-none bg-transparent p-0 font-clear text-[15px] font-bold text-clear-ink outline-none placeholder:font-semibold placeholder:text-clear-placeholder"
        />
      </div>
    </ClearField>
  );
}

/** The nested "Icon & colour" picker for an account. */
function IconColorDialog({
  open,
  onOpenChange,
  name,
  icon,
  onIconChange,
  color,
  onColorChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  icon: string | null;
  onIconChange: (v: string | null) => void;
  color: string;
  onColorChange: (v: string) => void;
}) {
  return (
    <IconPickerDialog
      open={open}
      onOpenChange={onOpenChange}
      subject={{ kind: "account", name: name.trim() }}
      value={{ icon, color }}
      onApply={(c) => {
        onIconChange(c.icon);
        if (c.color) onColorChange(c.color);
      }}
    />
  );
}

function FormFooter({
  busy,
  canSave,
  primaryLabel,
  onCancel,
  onSave,
  onDelete,
}: {
  busy: boolean;
  canSave: boolean;
  primaryLabel: string;
  onCancel: () => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  const t = useTranslations("accountForms");
  return (
    <div className="border-t border-clear-ground pt-[18px] pb-1">
      <ClearDialogFooter
        destructive={
          onDelete && (
            <button type="button" onClick={onDelete} disabled={busy} className={clearButtonVariants({ variant: "danger" })}>
              <IconTrash aria-hidden />
              {t("delete")}
            </button>
          )
        }
      >
        <button type="button" onClick={onCancel} className={clearButtonVariants({ variant: "secondary" })}>
          {t("cancel")}
        </button>
        <button type="button" onClick={onSave} disabled={!canSave} className={clearButtonVariants()}>
          {busy ? t("saving") : primaryLabel}
        </button>
      </ClearDialogFooter>
    </div>
  );
}

// ─── Bank account: add or edit ───────────────────────────────────────────────

/**
 * Add a bank account (`bank` null) or edit one. Adding sets the IBAN that imported
 * rows are matched on, a starting balance and the date it was true, and the transfer
 * type; editing corrects the live, transaction-derived balance instead (recomputing
 * startingBalance — never a fake transaction). The caller owns open/close and gets
 * the saved row back.
 */
export function BankFormDialog({
  bank,
  open,
  onOpenChange,
  onSaved,
  onDeleted,
}: {
  bank: Bank | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (bank: Bank) => void;
  onDeleted?: (id: number) => void;
}) {
  const t = useTranslations("accountForms");
  // The caller clears `bank` as the sheet closes; keep showing the last one while it
  // animates out, so the form never flips to "add" on its way down.
  const [shown, setShown] = useState(bank);
  if (bank && bank !== shown) setShown(bank);
  const current = bank ?? (open ? null : shown);
  const title = current ? t("bank.editTitle") : t("bank.addTitle");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideHeaderRow title={title} className="gap-[18px] pt-6 font-clear text-clear-ink" sheetClassName="lg:max-w-[560px]">
        {/* Mounted per opening (the sheet unmounts its content once closed), so every
            opening starts from the account as saved — or a blank form. */}
        <BankFormBody bank={current} title={title} onClose={() => onOpenChange(false)} onSaved={onSaved} onDeleted={onDeleted} />
      </DialogContent>
    </Dialog>
  );
}

function BankFormBody({
  bank,
  title,
  onClose,
  onSaved,
  onDeleted,
}: {
  bank: Bank | null;
  title: string;
  onClose: () => void;
  onSaved: (bank: Bank) => void;
  onDeleted?: (id: number) => void;
}) {
  const t = useTranslations("accountForms");
  const router = useRouter();
  const confirm = useConfirm();
  const isEdit = bank != null;
  const ids = useId();

  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(bank?.displayName ?? "");
  const [icon, setIcon] = useState<string | null>(bank?.icon ?? null);
  const [color, setColor] = useState(bank?.color ?? DEFAULT_BANK_COLOR);
  const [iconColorOpen, setIconColorOpen] = useState(false);
  const savedType = bank?.cardType;
  const [cardType, setCardType] = useState<BankType>(isBankType(savedType) ? savedType : "debitcard");
  const [expiration, setExpiration] = useState(bank?.expirationDate ?? "");
  const [includeInNetWorth, setIncludeInNetWorth] = useState(bank?.includeInNetWorth ?? false);
  const [overdraftExpr, setOverdraftExpr] = useState(bank?.overdraftLimit ? moneyToExpr(bank.overdraftLimit) : "");
  // Adding only.
  const [accountNumber, setAccountNumber] = useState("");
  const [startingExpr, setStartingExpr] = useState("");
  const [startingDate, setStartingDate] = useState(todayISO());
  const [transferKind, setTransferKind] = useState("");

  // Editing only: the live balance (transactions + starting balance). The field shows
  // it until the user types; a changed amount is a balance correction (see save()).
  const [liveBalance, setLiveBalance] = useState<number | null>(null);
  const [balanceExpr, setBalanceExpr] = useState<string | null>(null);

  useEffect(() => {
    if (!bank) return;
    let cancelled = false;
    fetch(`/api/banks/${bank.id}/balance`)
      .then((r) => r.json())
      .then((data: { balance?: number }) => {
        if (!cancelled && data.balance != null) setLiveBalance(data.balance);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bank]);

  const shownBalance = balanceExpr ?? (liveBalance != null ? moneyToExpr(liveBalance) : "");
  const enteredBalance = balanceExpr != null ? parseMoney(balanceExpr) : null;
  const balanceChanged = enteredBalance != null && liveBalance != null && Math.abs(enteredBalance - liveBalance) >= 0.005;

  // A real IBAN (not the CUSTOM-<id> placeholder a manual account gets) is shown on edit.
  const iban = bank?.accountNumber && !bank.accountNumber.startsWith("CUSTOM-") ? bank.accountNumber : null;
  const canSave = !busy && (!!name.trim() || (!isEdit && !!accountNumber.trim()));

  async function save() {
    if (!canSave) return;
    if (bank) {
      if (
        balanceChanged &&
        !(await confirm({
          title: t("bank.balanceConfirm"),
          body: t("bank.balanceConfirmBody"),
          confirmLabel: t("bank.balanceConfirmLabel"),
        }))
      )
        return;
      // startingBalance + (existing transaction sum) must equal the confirmed balance.
      let nextStartingBalance = bank.startingBalance ?? null;
      if (balanceChanged && enteredBalance != null && liveBalance != null) {
        const txnSum = liveBalance - (bank.startingBalance ?? 0);
        nextStartingBalance = roundToCents(enteredBalance - txnSum);
      }
      setBusy(true);
      const res = await fetch("/api/banks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: bank.id,
          displayName: name.trim() || null,
          icon: icon || null,
          color: color || null,
          cardType,
          expirationDate: expiration || null,
          startingBalance: nextStartingBalance,
          includeInNetWorth,
          overdraftLimit: parseMoney(overdraftExpr),
        }),
      });
      onSaved(await res.json());
    } else {
      setBusy(true);
      const res = await fetch("/api/banks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountNumber: accountNumber.trim() || null,
          displayName: name.trim() || null,
          icon: icon || null,
          color: color || null,
          cardType,
          expirationDate: expiration || null,
          startingBalance: parseMoney(startingExpr),
          startingDate: startingDate || null,
          transferKind: transferKind || null,
          includeInNetWorth,
          overdraftLimit: parseMoney(overdraftExpr),
        }),
      });
      onSaved(await res.json());
    }
    setBusy(false);
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!bank) return;
    const ok = await confirm({
      title: t("bank.confirmDelete"),
      body: t("bank.confirmDeleteBody"),
      confirmLabel: t("bank.confirmDeleteLabel"),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    await fetch("/api/banks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: bank.id }) });
    setBusy(false);
    onDeleted?.(bank.id);
    onClose();
    router.refresh();
  }

  return (
    <>
      <ClearDialogHeader
        title={title}
        subtitle={isEdit ? t("bank.editSubtitle") : t("bank.addSubtitle")}
        onClose={onClose}
        closeLabel={t("close")}
      />

      <NameField
        id={`${ids}-name`}
        label={t("bank.name")}
        value={name}
        onChange={setName}
        placeholder={t("bank.namePlaceholder")}
        glyph={<AccountGlyph icon={icon} color={color} fallback={IconBuildingBank} size="sm" />}
        onGlyphClick={() => setIconColorOpen(true)}
      />

      {isEdit ? (
        iban && (
          <p className="m-0 -mt-2 inline-flex items-center gap-1.5 text-[13px] text-clear-muted">
            <IconLink aria-hidden size={14} stroke={2} />
            <span className="tabular-nums">{t("bank.ibanReadOnly", { iban })}</span>
          </p>
        )
      ) : (
        <ClearField
          label={t("bank.iban")}
          htmlFor={`${ids}-iban`}
          hint={
            <span className="inline-flex items-center gap-1.5">
              <IconLink aria-hidden size={14} stroke={2} />
              {t("bank.ibanHint")}
            </span>
          }
        >
          <ClearInput
            id={`${ids}-iban`}
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="NL00 BANK 0000 0000 00"
            autoComplete="off"
            className="font-bold tracking-[0.02em] tabular-nums"
          />
        </ClearField>
      )}

      <div className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL} aria-hidden>{t("bank.type")}</span>
        <Segmented
          label={t("bank.type")}
          surface="tile"
          value={cardType}
          onChange={setCardType}
          className="w-full [&>button]:flex-1 [&>button]:gap-2 [&>button]:px-2"
          items={BANK_TYPES.map((v) => {
            const TypeIcon = BANK_TYPE_ICON[v];
            return {
              value: v,
              label: (
                <>
                  <TypeIcon aria-hidden size={16} stroke={2} className="hidden sm:block" />
                  {t(`bankTypes.${v}`)}
                </>
              ),
            };
          })}
        />
      </div>

      {isEdit ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <ClearField label={t("bank.balance")} htmlFor={`${ids}-balance`} hint={t("bank.balanceHint")}>
            <MoneyInput id={`${ids}-balance`} value={shownBalance} onChange={setBalanceExpr} />
          </ClearField>
          <DateField label={t("bank.expiry")} value={expiration} onChange={setExpiration} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <ClearField label={t("bank.startingBalance")} htmlFor={`${ids}-start`}>
            <MoneyInput id={`${ids}-start`} value={startingExpr} onChange={setStartingExpr} describedBy={`${ids}-start-hint`} />
          </ClearField>
          <DateField label={t("bank.balanceAsOf")} value={startingDate} onChange={setStartingDate} />
          <p id={`${ids}-start-hint`} className="m-0 -mt-1.5 text-[13px] text-clear-muted sm:col-span-2">{t("bank.startingBalanceHint")}</p>
          <DateField label={t("bank.expiry")} value={expiration} onChange={setExpiration} onClear={() => setExpiration("")} />
          <div className="flex flex-col gap-1.5">
            <span id={`${ids}-kind`} className={FIELD_LABEL}>{t("bank.transferKind")}</span>
            <ClearSelect
              value={transferKind}
              onChange={setTransferKind}
              ariaLabelledBy={`${ids}-kind`}
              options={[{ value: "", label: t("transferKinds.none") }, ...TRANSFER_KINDS.map((v) => ({ value: v, label: t(`transferKinds.${v}`) }))]}
            />
          </div>
          <p className="m-0 -mt-1.5 text-[13px] text-clear-muted sm:col-span-2">{t("bank.transferKindHint")}</p>
        </div>
      )}

      {isEdit && balanceChanged && (
        <div role="note" className="flex items-start gap-3 rounded-clear-tile bg-clear-butter px-4 py-3.5 text-clear-butter-ink">
          <IconAlertTriangle aria-hidden size={18} stroke={2} className="mt-0.5 shrink-0" />
          <span className="text-[13px] leading-[1.5] font-semibold">{t("bank.balanceWarning")}</span>
        </div>
      )}

      {/* Stored positive whatever sign is typed: 500 means the account may reach −500. */}
      <ClearField label={t("bank.overdraft")} htmlFor={`${ids}-overdraft`} hint={t("bank.overdraftHint")}>
        <MoneyInput id={`${ids}-overdraft`} value={overdraftExpr} onChange={setOverdraftExpr} />
      </ClearField>

      <NetWorthSwitch checked={includeInNetWorth} onChange={setIncludeInNetWorth} hint={t("bank.netWorthHint")} />

      <FormFooter
        busy={busy}
        canSave={canSave}
        primaryLabel={isEdit ? t("save") : t("bank.add")}
        onCancel={onClose}
        onSave={save}
        onDelete={isEdit ? remove : undefined}
      />

      <IconColorDialog open={iconColorOpen} onOpenChange={setIconColorOpen} name={name} icon={icon} onIconChange={setIcon} color={color} onColorChange={setColor} />
    </>
  );
}

// ─── Asset: add or edit ──────────────────────────────────────────────────────

/** Add an asset (`account` null) or edit one — a vermogen_accounts row. */
export function AssetFormDialog({
  account,
  open,
  onOpenChange,
  onSaved,
  onDeleted,
}: {
  account: VermogenAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (account: VermogenAccount) => void;
  onDeleted?: (id: number) => void;
}) {
  const t = useTranslations("accountForms");
  // Keeps the last account while the sheet animates out (see BankFormDialog).
  const [shown, setShown] = useState(account);
  if (account && account !== shown) setShown(account);
  const current = account ?? (open ? null : shown);
  const title = current ? t("asset.editTitle") : t("asset.addTitle");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideHeaderRow title={title} className="gap-5 pt-6 font-clear text-clear-ink" sheetClassName="lg:max-w-[560px]">
        <AssetFormBody account={current} title={title} onClose={() => onOpenChange(false)} onSaved={onSaved} onDeleted={onDeleted} />
      </DialogContent>
    </Dialog>
  );
}

function AssetFormBody({
  account,
  title,
  onClose,
  onSaved,
  onDeleted,
}: {
  account: VermogenAccount | null;
  title: string;
  onClose: () => void;
  onSaved: (account: VermogenAccount) => void;
  onDeleted?: (id: number) => void;
}) {
  const t = useTranslations("accountForms");
  const router = useRouter();
  const confirm = useConfirm();
  const isEdit = account != null;
  const ids = useId();

  const [busy, setBusy] = useState(false);
  // An unknown stored type stays as it is until another one is picked.
  const [type, setType] = useState<string>(account?.type ?? "beleggingen");
  const [name, setName] = useState(account?.name ?? "");
  const [valueExpr, setValueExpr] = useState(account ? moneyToExpr(account.value) : "");
  const [lastUpdated, setLastUpdated] = useState(account ? account.lastUpdated ?? "" : todayISO());
  const [notes, setNotes] = useState(account?.notes ?? "");
  const [icon, setIcon] = useState<string | null>(account?.icon ?? null);
  const [color, setColor] = useState(account?.color ?? DEFAULT_ASSET_COLOR);
  const [iconColorOpen, setIconColorOpen] = useState(false);
  const [includeInNetWorth, setIncludeInNetWorth] = useState(account?.includeInNetWorth ?? true);

  const value = parseMoney(valueExpr);
  const canSave = !busy && !!name.trim() && !!type;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    const body = {
      name: name.trim(),
      type,
      value: value ?? 0,
      icon: icon || null,
      color: color || null,
      notes: notes.trim() || null,
      lastUpdated: lastUpdated || null,
      includeInNetWorth,
    };
    const res = await fetch("/api/vermogen", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(account ? { id: account.id, ...body } : body),
    });
    onSaved(await res.json());
    setBusy(false);
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!account) return;
    const ok = await confirm({
      title: t("asset.confirmDelete"),
      body: t("asset.confirmDeleteBody"),
      confirmLabel: t("asset.confirmDeleteLabel"),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    await fetch("/api/vermogen", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: account.id }) });
    setBusy(false);
    onDeleted?.(account.id);
    onClose();
    router.refresh();
  }

  const bold = (chunks: React.ReactNode) => <b className="font-extrabold tabular-nums">{chunks}</b>;

  return (
    <>
      <ClearDialogHeader title={title} subtitle={t("asset.subtitle")} onClose={onClose} closeLabel={t("close")} />

      <div className="flex flex-col gap-2">
        <span id={`${ids}-type`} className={FIELD_LABEL}>{t("asset.type")}</span>
        <div role="radiogroup" aria-labelledby={`${ids}-type`} className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {ASSET_TYPES.map((v) => {
            const { icon: TypeIcon, tone } = ASSET_TYPE_STYLE[v];
            const selected = type === v;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setType(v)}
                className={cn(
                  "relative flex h-[104px] cursor-pointer flex-col items-start justify-between rounded-clear-tile border-2 p-3 text-left font-clear text-clear-ink outline-none transition-colors focus-visible:ring-3 focus-visible:ring-clear-ember/50 sm:h-28",
                  selected ? "border-clear-ink bg-clear-card" : "border-transparent bg-clear-tile hover:bg-clear-line",
                )}
              >
                <IconTile tone={tone}>
                  <TypeIcon stroke={2} />
                </IconTile>
                <span className={cn("text-sm leading-tight", selected ? "font-extrabold" : "font-bold")}>{t(`assetTypes.${v}`)}</span>
                {selected && (
                  <span aria-hidden className="absolute top-2.5 right-2.5 inline-flex size-[22px] items-center justify-center rounded-full bg-clear-primary text-clear-primary-ink">
                    <IconCheck size={14} stroke={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <NameField
        id={`${ids}-name`}
        label={t("asset.name")}
        value={name}
        onChange={setName}
        placeholder={t("asset.namePlaceholder")}
        glyph={<AccountGlyph icon={icon} color={color} fallback={assetGlyph(type)} size="sm" />}
        onGlyphClick={() => setIconColorOpen(true)}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <ClearField label={t("asset.value")} htmlFor={`${ids}-value`}>
          <MoneyInput id={`${ids}-value`} value={valueExpr} onChange={setValueExpr} />
        </ClearField>
        <DateField label={t("asset.valueAsOf")} value={lastUpdated} onChange={setLastUpdated} />
      </div>

      <ClearField label={t("asset.notes")} htmlFor={`${ids}-notes`}>
        <ClearInput id={`${ids}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("asset.notesPlaceholder")} />
      </ClearField>

      <NetWorthSwitch checked={includeInNetWorth} onChange={setIncludeInNetWorth} hint={t("asset.netWorthHint")} />

      {value != null && (
        <div className={cn("flex items-center gap-3 rounded-clear-tile px-4 py-3.5", includeInNetWorth ? "bg-clear-mint" : "bg-clear-tile")}>
          <span
            aria-hidden
            className={cn(
              "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-clear-card",
              includeInNetWorth ? "text-clear-mint-ink" : "text-clear-muted",
            )}
          >
            {includeInNetWorth ? <IconChartLine size={16} stroke={2.2} /> : <IconInfoCircle size={16} stroke={2.2} />}
          </span>
          <span className="text-[15px] leading-[1.4] font-semibold">
            <MoneyText>{!includeInNetWorth
              ? t("asset.notInNetWorth")
              : isEdit
                ? t.rich("asset.countsInNetWorth", { amount: formatEur(value), b: bold })
                : t.rich("asset.addsToNetWorth", { amount: formatEur(value), b: bold })}</MoneyText>
          </span>
        </div>
      )}

      <FormFooter
        busy={busy}
        canSave={canSave}
        primaryLabel={isEdit ? t("save") : t("asset.add")}
        onCancel={onClose}
        onSave={save}
        onDelete={isEdit ? remove : undefined}
      />

      <IconColorDialog open={iconColorOpen} onOpenChange={setIconColorOpen} name={name} icon={icon} onIconChange={setIcon} color={color} onColorChange={setColor} />
    </>
  );
}
