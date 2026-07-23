"use client";

import Link from "next/link";
import { IconPlus } from "@tabler/icons-react";

// Hovering "+ Add" pill shown on mobile pages, floating just above the bottom
// navigation. Fixed-positioned, so it can be rendered from anywhere (e.g. a header
// slot) and still float in place without taking up layout space. Pass `onClick` to
// open a dialog, or `href` to navigate to a full-page flow (e.g. /transactions/add).
const className =
  "lg:hidden fixed left-4 right-4 bottom-[calc(3.5rem+var(--sab))] z-50 flex items-center justify-center gap-2 rounded-full bg-white backdrop-blur-lg text-black h-14 font-semibold text-md shadow-floating shadow-primary/30 active:scale-[0.92] transition-transform";

export function FloatingAddButton({
  onClick,
  href,
  label = "Add",
  ariaLabel,
}: {
  onClick?: () => void;
  href?: string;
  label?: string;
  ariaLabel?: string;
}) {
  if (href) {
    return (
      <Link href={href} aria-label={ariaLabel ?? label} className={className}>
        {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel ?? label} className={className}>
      {label}
    </button>
  );
}