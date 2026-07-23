"use client";

import Link from "next/link";
import {
  IconPlus as Plus,
  IconDotsVertical as EllipsisVertical,
} from "@tabler/icons-react";
import type { Debt } from "@/db/schema";
import { FloatingAddButton } from "@/components/floating-add-button";

interface AddProps {
  action: "add";
  /** "default" (small primary-colored "+" button), "icon" (circular white button used
   *  in the mobile header) or "fab" (hovering "+ Add" pill). */
  variant?: "default" | "icon" | "fab";
}
interface EditProps { action: "edit"; debt: Debt }
type Props = AddProps | EditProps;

// Triggers only. Both adding and editing are routed subpages now
// (/debts/add and /debts/[id]/edit, both rendering DebtForm) — the old
// dialog that lived here has been removed.
export function DebtClient(props: Props) {
  if (props.action === "edit") {
    return (
      <Link
        href={`/debts/${props.debt.id}/edit`}
        aria-label={`Edit ${props.debt.name}`}
        className="flex items-center justify-center p-1.5 hover:bg-foreground/10 text-foreground rounded-sm bg-foreground/5 hover:text-foreground shrink-0 size-9"
      >
        <EllipsisVertical className="size-4" />
      </Link>
    );
  }

  if (props.variant === "fab") {
    return <FloatingAddButton href="/debts/add" ariaLabel="Add debt" />;
  }

  if (props.variant === "icon") {
    return (
      <Link href="/debts/add" className="glass-icon-btn size-12" aria-label="Add debt">
        <Plus className="stroke-[1.5] size-7 text-foreground dark:text-gray-300" />
      </Link>
    );
  }

  return (
    <Link
      href="/debts/add"
      className="size-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity shrink-0"
      title="Add debt"
    >
      <Plus className="size-5" />
    </Link>
  );
}
