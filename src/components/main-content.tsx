"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// The mobile hamburger bar and bottom nav both hide themselves on /login and /register
// (see nav.tsx / mobile-bottom-nav.tsx), but this padding — reserved to clear them — was
// applied unconditionally, adding ~120px of unused space on the auth pages and pushing
// their full-height layout past the viewport, forcing an unwanted scroll.
export function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login" || pathname === "/register" || pathname === "/offline";

  return (
<main
  className={cn(
    "flex-1 min-w-0 min-h-0",
    !isAuthPage && "pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0"
  )}
>
      {children}
    </main>
  );
}