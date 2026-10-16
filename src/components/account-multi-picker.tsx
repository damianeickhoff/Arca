"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { IconCheck as Check } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ResponsivePopover } from "@/components/clear/responsive-popover";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { CheckBox } from "@/components/category-multi-picker";
import { useIsDesktop } from "@/lib/use-is-desktop";
import type { Bank } from "@/db/schema";

// Multi-select account picker — same checkbox-row / confirm pattern as
// CategoryMultiPicker, but a flat list (accounts have no grouping). With a `trigger` it
// is a popover on desktop and a sheet on phones; without one, always a sheet.
export function AccountMultiPicker({
  banks,
  selected,
  open,
  onOpenChange,
  onApply,
  trigger,
}: {
  banks: Bank[];
  selected: string[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply: (accountNumbers: string[]) => void;
  trigger?: React.ReactElement<React.ComponentProps<"button">>;
}) {
  const t = useTranslations("transactions.filters");
  const isDesktop = useIsDesktop();
  const [staged, setStaged] = useState<string[]>(selected);

  useEffect(() => {
    if (!open) return;
    setStaged(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggle(accountNumber: string) {
    setStaged((prev) => (prev.includes(accountNumber) ? prev.filter((v) => v !== accountNumber) : [...prev, accountNumber]));
  }

  const allIds = banks.map((b) => b.accountNumber).filter((v): v is string => !!v);
  const allSelected = allIds.length > 0 && allIds.every((id) => staged.includes(id));
  function toggleAll() {
    setStaged(allSelected ? [] : allIds);
  }

  function confirm() {
    onApply(staged);
    onOpenChange(false);
  }

  const list = (
    <div className="flex flex-col gap-0.5">
      {banks.map((bank) => {
        const accountNumber = bank.accountNumber;
        if (!accountNumber) return null;
        const active = staged.includes(accountNumber);
        return (
          <button
            key={bank.id}
            type="button"
            onClick={() => toggle(accountNumber)}
            aria-pressed={active}
            className="flex w-full cursor-pointer items-center gap-3 rounded-clear-row px-3 py-2.5 text-left transition-colors hover:bg-clear-tile"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{bank.displayName ?? accountNumber}</span>
              {bank.displayName && <span className="mt-0.5 block truncate text-xs text-clear-muted">{accountNumber}</span>}
            </span>
            <CheckBox active={active} />
          </button>
        );
      })}
      {banks.length === 0 && <p className="py-6 text-center text-sm text-clear-muted">{t("noAccounts")}</p>}
    </div>
  );

  const confirmButton = (
    <button type="button" onClick={confirm} aria-label={t("confirm")} className={clearButtonVariants({ size: "icon" })}>
      <Check className="size-5" />
    </button>
  );

  const selectAll = (
    <button type="button" onClick={toggleAll} className={clearButtonVariants({ variant: isDesktop ? "ghost" : "secondary", size: isDesktop ? "sm" : "md" })}>
      {allSelected ? t("deselectAll") : t("selectAll")}
    </button>
  );

  if (!trigger) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent fullHeight hideHandle className="pt-3" title={t("selectAccounts")} headerAction={confirmButton} footer={selectAll}>
          {list}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={onOpenChange}
      title={t("selectAccounts")}
      trigger={trigger}
      sheet={{ fullHeight: true, hideHandle: true, className: "pt-3", headerAction: confirmButton }}
      footer={
        isDesktop ? (
          <div className="flex items-center justify-between gap-2">
            {selectAll}
            <button type="button" onClick={confirm} className={clearButtonVariants({ size: "sm" })}>
              {t("apply")}
            </button>
          </div>
        ) : (
          selectAll
        )
      }
    >
      {list}
    </ResponsivePopover>
  );
}
