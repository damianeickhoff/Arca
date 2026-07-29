"use client";

import Link from "next/link";
import { bottomDockClass } from "@/components/bottom-nav";
import { cn } from "@/lib/utils";

// Hovering "+ Add" pill floating just above the bottom navigation. Fixed-positioned,
// so it can be rendered from anywhere (e.g. a header slot) and still float in place
// without taking up layout space. Pass `onClick` to open a dialog, or `href` to
// navigate to a full-page flow (e.g. /transactions/add).
//
// The fixed positioning lives on a wrapper rather than the pill itself, because
// bottomDockClass carries the column gutters as padding — putting it on the pill
// would indent its label instead of insetting the pill.
const wrapperClassName = cn(bottomDockClass, "bottom-[var(--nav-clearance)] z-50");
const pillClassName =
  "flex w-full items-center justify-center gap-2 rounded-full bg-white backdrop-blur-lg text-black h-14 font-semibold text-md shadow-floating shadow-primary/30 active:scale-[0.92] transition-transform";

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
  return (
    <div className={wrapperClassName}>
      {href ? (
        <Link href={href} aria-label={ariaLabel ?? label} className={pillClassName}>
          {label}
        </Link>
      ) : (
        <button type="button" onClick={onClick} aria-label={ariaLabel ?? label} className={pillClassName}>
          {label}
        </button>
      )}
    </div>
  );
}
