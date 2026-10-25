"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconAlertTriangle, IconCheck, IconRefresh } from "@tabler/icons-react";
import { syncBankAction } from "@/app/actions/bank";
import { useBankErrorText } from "@/components/settings/bank-error-text";
import type { SyncOutcome } from "@/lib/bank-sync";
import { cn } from "@/lib/utils";

type Notice = { tone: "success" | "attention"; text: string };

/**
 * The round sync button beside Import in the desktop sidebar (only while a bank is
 * connected): syncs every connection through the same server action as Settings ›
 * Import's "Sync all" (syncBankAction → syncBankConnections, which refuses while an
 * import or another sync runs), then says how it went in a short notice at the bottom
 * of the page and refreshes the server components so new transactions show.
 */
export function BankSyncButton({ onDark }: { /** The Import row is active (black). */ onDark: boolean }) {
  const t = useTranslations("nav.bankSync");
  const errorText = useBankErrorText();
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function describe(outcome: SyncOutcome): Notice {
    if (!outcome.ok) return { tone: "attention", text: errorText(outcome.error) };
    const failed = outcome.results.find((r) => r.summary.error && r.summary.error !== "expired");
    if (failed) return { tone: "attention", text: errorText(failed.summary.error!) };
    if (outcome.results.some((r) => r.summary.error === "expired")) return { tone: "attention", text: t("expired") };
    return { tone: "success", text: t("done", { count: outcome.results.reduce((n, r) => n + r.summary.imported, 0) }) };
  }

  async function sync() {
    setSyncing(true);
    setNotice(null);
    const result = await syncBankAction().catch(() => ({ error: "unavailable" as const }));
    setSyncing(false);
    setNotice("error" in result ? { tone: "attention", text: errorText(result.error) } : describe(result.outcome));
    // The layout's props (the "Last synced" line, counts) and the page's rows.
    router.refresh();
  }

  const label = syncing ? t("syncing") : t("syncNow");

  return (
    <>
      <button
        type="button"
        onClick={() => void sync()}
        disabled={syncing}
        aria-label={label}
        title={label}
        className={cn(
          "absolute top-1/2 right-2 inline-flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full transition-colors disabled:cursor-default",
          onDark
            ? "text-clear-primary-ink hover:bg-clear-primary-ink/15"
            : "text-clear-muted hover:bg-clear-line hover:text-clear-ink disabled:hover:bg-transparent",
        )}
      >
        <IconRefresh size={18} stroke={2} aria-hidden className={cn(syncing && "motion-safe:animate-spin")} />
      </button>
      {notice &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-6 left-[calc(50%+130px)] z-[70] flex max-w-[min(480px,calc(100vw-292px))] -translate-x-1/2 items-center gap-2.5 rounded-clear-tile bg-clear-primary px-4 py-3 font-clear text-[15px] font-semibold text-clear-primary-ink shadow-clear-float"
          >
            {notice.tone === "success" ? (
              <IconCheck size={18} stroke={2.4} aria-hidden className="shrink-0" />
            ) : (
              <IconAlertTriangle size={18} stroke={2.2} aria-hidden className="shrink-0 text-clear-ember" />
            )}
            <span className="min-w-0">{notice.text}</span>
          </div>,
          document.body,
        )}
    </>
  );
}
