"use client";

import { useEffect, useState } from "react";

// True once the window has scrolled past `threshold` px. Used to fade in the
// frosted backdrop behind sticky mobile headers only when content actually
// slides underneath them.
export function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > threshold);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return scrolled;
}
