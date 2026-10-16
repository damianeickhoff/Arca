"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearButtonVariants } from "@/components/clear/button-variants";

/** "Skip": hides the Get started card for good (the home_get_started_dismissed setting). */
export function GetStartedSkip({ label }: { label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function skip() {
    setBusy(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "home_get_started_dismissed", value: "1" }),
    });
    startTransition(() => router.refresh());
  }

  return (
    <button type="button" onClick={skip} disabled={busy} className={clearButtonVariants({ variant: "ghost", size: "sm" })}>
      {label}
    </button>
  );
}
