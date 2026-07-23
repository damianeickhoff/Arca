"use client";

import { useState, useRef } from "react";

export function TransactionTooltip({
  description,
  rawDescription,
}: {
  description: string;
  rawDescription?: string | null;
}) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasTip = rawDescription && rawDescription !== description;

  function onEnter() {
    if (!hasTip) return;
    timerRef.current = setTimeout(() => setVisible(true), 1200);
  }

  function onLeave() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }

  return (
    <span
      className="relative font-medium truncate"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {description}
      {visible && (
        <span className="absolute left-0 top-full mt-1.5 z-50 bg-popover text-popover-foreground text-xs rounded-md px-2.5 py-1.5 shadow-lg border max-w-72 whitespace-normal leading-relaxed pointer-events-none">
          {rawDescription}
        </span>
      )}
    </span>
  );
}
