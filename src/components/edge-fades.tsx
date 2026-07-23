"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Soft gradient fades at the top and bottom screen edges (mobile/PWA only — see globals.css).
// Top fade: hidden over the dashboard hero, appears once the white section scrolls up to the notch.
// Bottom fade: always visible on the dashboard; matches top visibility on other pages.
export function EdgeFades() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const embedded = searchParams.get("embed") === "1";
  const isDashboard = pathname === "/";

  const [topVisible, setTopVisible] = useState(!isDashboard);
  const [bottomVisible, setBottomVisible] = useState(true);

  useEffect(() => {
    if (!isDashboard) {
      setTopVisible(true);
      setBottomVisible(true);
      return;
    }

    setTopVisible(false);
    setBottomVisible(true);

    const anchor = document.getElementById("dash-scroll-anchor");
    if (!anchor) return;

    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;top:0;height:env(safe-area-inset-top);";
    document.body.appendChild(probe);
    const inset = probe.offsetHeight;
    probe.remove();

    let raf = 0;
    const check = () => {
      raf = 0;
      setTopVisible(anchor.getBoundingClientRect().top <= inset + 4);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    check();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isDashboard]);

  if (pathname === "/login" || pathname === "/register" || pathname === "/offline") return null;
  // Embedded (iframe) pages inside the sidebar render this whole layout; the top fade
  // would paint a gray band under the sidebar's own header. Suppress it there.
  if (embedded) return null;

  return (
    <>
      <div className="edge-fade-top" data-visible={topVisible ? "true" : "false"} aria-hidden />
      <div className="edge-fade-top-blur" data-visible={topVisible ? "true" : "false"} aria-hidden />
      <div className="edge-fade-bottom" data-visible={bottomVisible ? "true" : "false"} aria-hidden />
    </>
  );
}
