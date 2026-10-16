"use client";

import { useTranslations } from "next-intl";
import { IconRefresh } from "@tabler/icons-react";
import { ClearButton } from "@/components/clear/button";
import { OfflineIllustration } from "@/components/clear/status-card";

// Static fallback served by the service worker when a navigation fails offline.
// No data fetching here — this page must render with zero network access.
export default function OfflinePage() {
  const t = useTranslations("statusPages.offline");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-[22px] px-6 pt-[calc(var(--sat)+16px)] pb-[calc(var(--sab)+40px)] text-center font-clear text-clear-ink">
      <OfflineIllustration />
      <div className="flex flex-col items-center gap-2.5">
        <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.03em] lg:text-[32px]">{t("title")}</h1>
        <p className="m-0 max-w-[320px] text-[15px] leading-normal text-clear-ink-2">{t("body")}</p>
      </div>
      <ClearButton size="lg" onClick={() => window.location.reload()} className="w-full max-w-[342px] lg:w-auto">
        <IconRefresh stroke={2} aria-hidden />
        {t("tryAgain")}
      </ClearButton>
    </div>
  );
}
