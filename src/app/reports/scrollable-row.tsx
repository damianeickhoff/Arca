"use client";

import { useRef, type ReactNode } from "react";

export function ScrollableRow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, moved: false, startX: 0, startScrollLeft: 0 });

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    // Only mouse needs drag-to-scroll — touch already scrolls natively, and capturing
    // touch pointers here would fight the browser's native touch scrolling/snap.
    if (!el || e.pointerType !== "mouse") return;
    drag.current = { active: true, moved: false, startX: e.clientX, startScrollLeft: el.scrollLeft };
    el.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || !drag.current.active) return;
    const delta = e.clientX - drag.current.startX;
    if (Math.abs(delta) > 3) drag.current.moved = true;
    el.scrollLeft = drag.current.startScrollLeft - delta;
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    drag.current.active = false;
    ref.current?.releasePointerCapture(e.pointerId);
  }

  function onClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    // Suppress the click that would otherwise fire on a link/button after a drag.
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  }

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={onClickCapture}
      className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-1 cursor-grab active:cursor-grabbing select-none"
    >
      {children}
    </div>
  );
}
