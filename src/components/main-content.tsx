"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { isChromeless } from "@/components/shell/nav-config";
import { cn } from "@/lib/utils";

// Keeps page content clear of the app shell (components/shell/app-shell.tsx):
//   • --nav-clearance at the bottom, so no page's last row ends up under the phone tab
//     bar (it shrinks to a plain margin from lg up, see globals.css);
//   • the floating 260px sidebar on the left from lg up (16px inset + 260px).
// Neither applies on the auth pages or an embedded view, where the shell renders no
// chrome and the padding would only push a full-height layout past the viewport.
export function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const chromeless = isChromeless(pathname) || searchParams.get("embed") === "1";

  return <main className={cn("min-w-0", !chromeless && "pb-[var(--nav-clearance)] lg:pl-[260px]")}>{children}</main>;
}
