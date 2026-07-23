// Sub-types for internal (own-account) transfers, plus the icon shown for each in
// transaction lists. A transaction's effective type is either a manual per-transaction
// override (transactions.transferType) or, when unset, inherited from the opposite
// account's tagged kind (banks.transferKind) — see effectiveTransferTypeExpr in
// src/lib/internal-transfers.ts.
export const TRANSFER_TYPES = [
  { value: "savings",             label: "Savings",                icon: "IconPigMoney",       color: "#14b8a6" },
  { value: "investments",         label: "Investments",             icon: "IconChartLine",      color: "#6366f1" },
  { value: "credit_card_payment", label: "Credit card payment",     icon: "IconCreditCard",     color: "#a855f7" },
  { value: "cash_withdrawal",     label: "Cash withdrawal",         icon: "IconCash",           color: "#22c55e" },
  { value: "shared_account",      label: "Shared account transfer", icon: "IconUsers",          color: "#3b82f6" },
  { value: "other",               label: "Other",                   icon: "IconArrowsLeftRight", color: "#64748b" },
] as const;

export type TransferType = (typeof TRANSFER_TYPES)[number]["value"];

export const TRANSFER_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  TRANSFER_TYPES.map((t) => [t.value, t.label]),
);

export const TRANSFER_TYPE_ICONS: Record<string, string> = Object.fromEntries(
  TRANSFER_TYPES.map((t) => [t.value, t.icon]),
);

export const TRANSFER_TYPE_COLORS: Record<string, string> = Object.fromEntries(
  TRANSFER_TYPES.map((t) => [t.value, t.color]),
);

export const DEFAULT_TRANSFER_ICON = "IconArrowsLeftRight";
export const DEFAULT_TRANSFER_COLOR = "#64748b";
