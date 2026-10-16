"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RecurringClient } from "@/components/settings/recurring/recurring-client";

/**
 * "Set your salary" in Home's heading: opens the recurring form set to income, so the
 * heading can count down to payday once it's saved.
 */
export function SetSalaryButton({ label, salaryName }: { label: string; salaryName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="cursor-pointer font-bold text-clear-ember-text hover:underline">
        {label}
      </button>
      {open && (
        <RecurringClient
          action="add"
          open
          title={label}
          prefill={{ type: "income", name: salaryName }}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) router.refresh();
          }}
        />
      )}
    </>
  );
}
