"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Reserves --nav-clearance so no page's last row ends up under the floating bottom
// nav. The nav is the only navigation at every viewport width now (see bottom-nav.tsx),
// so the clearance is unconditional — except on the auth pages, where the nav hides
// itself and the padding would otherwise push their full-height layout past the
// viewport, forcing an unwanted scroll.
export function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login" || pathname === "/register" || pathname === "/offline";

  return (
    <main className={cn("flex-1 min-w-0 min-h-0", !isAuthPage && "pb-[var(--nav-clearance)]")}>
      {children}
    </main>
  );
}