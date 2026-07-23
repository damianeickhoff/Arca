"use client";

import { useState } from "react";
import {
  IconPlus as Plus
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { AddTransactionModal } from "@/components/quick-add-button";
import { cn } from "@/lib/utils";
import { glassIconButton } from "@/lib/styles";
import type { Category } from "@/db/schema";

export function TransactionAddButton({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn("size-12 shrink-0", glassIconButton)}
        title="Add transaction"
      >
        <Plus className="stroke-[1.5] size-7 text-foreground dark:text-gray-300" />
      </button>
      <AddTransactionModal
        open={open}
        onClose={() => setOpen(false)}
        onDone={() => { setOpen(false); router.refresh(); }}
        categories={categories}
      />
    </>
  );
}
