"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Category } from "@/db/schema";
import type { TransactionDetail } from "@/app/transactions/transaction-types";

// Loaded lazily to break a module cycle: the transaction sheet renders the merchant
// profile, and the merchant profile renders this to open a transaction from its list.
// A static import would leave one of the two undefined at render time depending on
// which module initialised first — the same reason the sheet loads the recurring
// detail dialog this way.
const TransactionDetailDialog = dynamic(
  () => import("@/app/transactions/transaction-detail-dialog").then((m) => m.TransactionDetailDialog),
  { ssr: false },
);

/**
 * Opens the app's transaction detail sheet for a transaction the caller only knows the
 * id of. The merchant and category profiles list transactions from their own trimmed
 * payloads (id, date, amount, name), so the full row — and the category list the sheet
 * needs — is fetched here on demand.
 *
 * Nothing is fetched until an id is set, and the sheet opens once the row lands, so a
 * profile that's never drilled into costs no extra requests.
 */
export function TransactionDetailByIdDialog({
  transactionId,
  onClose,
  onChanged,
  sheetClassName,
  overlayClassName,
}: {
  transactionId: number | null;
  onClose: () => void;
  /** Fired after an edit that the surrounding profile's own figures depend on, so it
   *  can refetch (recategorising a transaction moves it between category profiles). */
  onChanged?: () => void;
  sheetClassName?: string;
  overlayClassName?: string;
}) {
  const router = useRouter();
  const [row, setRow] = useState<TransactionDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  // Categories are only needed once something is actually opened, and they don't
  // change while a profile is on screen — fetched once, then kept.
  useEffect(() => {
    if (transactionId == null || categories.length) return;
    let cancelled = false;
    fetch("/api/categories")
      .then((r) => r.json())
      .then((c) => { if (!cancelled) setCategories(Array.isArray(c) ? c : []); })
      .catch(() => { /* the sheet still opens; the category picker is just empty */ });
    return () => { cancelled = true; };
  }, [transactionId, categories.length]);

  useEffect(() => {
    if (transactionId == null) {
      // Hold the cached row briefly so the sheet can animate out (see the mount rule
      // below — dropping it immediately would unmount mid-slide), then release it.
      const timer = setTimeout(() => setRow(null), 500);
      return () => clearTimeout(timer);
    }
    let cancelled = false;
    fetch(`/api/transactions/${transactionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: TransactionDetail | null) => { if (!cancelled) setRow(d); })
      .catch(() => { if (!cancelled) onClose(); });
    return () => { cancelled = true; };
    // onClose is a caller-defined closure; re-running on its identity would refetch
    // on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId]);

  // Renders NOTHING until something is actually opened, and this is load-bearing, not
  // an optimisation: the sheet renders the merchant profile, which renders this — so a
  // version that always mounted the sheet would recurse forever and hang the page.
  // Bailing out while idle is what terminates that chain.
  //
  // Mounting only on demand still animates in: the row arrives from a fetch, so the
  // sheet always gets a frame at row=null (closed) before it opens.
  if (transactionId == null && row == null) return null;

  return (
    <TransactionDetailDialog
      // Cleared the moment the caller closes, so the sheet starts its exit animation
      // immediately even though `row` lingers for the unmount delay above.
      row={transactionId != null ? row : null}
      categories={categories}
      onClose={onClose}
      onCategorized={() => { onChanged?.(); router.refresh(); }}
      sheetClassName={sheetClassName}
      overlayClassName={overlayClassName}
    />
  );
}
