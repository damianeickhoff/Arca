"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { IconHome, IconInfoCircle, IconRefresh } from "@tabler/icons-react";
import { ClearButton } from "@/components/clear/button";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { ClearChip } from "@/components/clear/chip";
import { ReceiptIllustration, StatusCard } from "@/components/clear/status-card";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useTranslations("statusPages.error");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusCard
      illustration={<ReceiptIllustration badge="alert" />}
      title={t("title")}
      body={t("body")}
      chip={
        error.digest ? (
          <ClearChip tone="stone" icon={<IconInfoCircle stroke={2.2} aria-hidden />} className="h-8 tabular-nums">
            {t("reference", { digest: error.digest })}
          </ClearChip>
        ) : undefined
      }
      actions={
        <>
          <ClearButton size="lg" onClick={() => unstable_retry()}>
            <IconRefresh stroke={2} aria-hidden />
            {t("tryAgain")}
          </ClearButton>
          <Link href="/" className={clearButtonVariants({ variant: "secondary", size: "lg" })}>
            <IconHome stroke={2} aria-hidden />
            {t("backHome")}
          </Link>
        </>
      }
      footer={t.rich("help", {
        link: (chunks) => (
          <Link href="/settings?panel=help" className="font-bold text-clear-ember-text no-underline hover:underline">
            {chunks}
          </Link>
        ),
      })}
    />
  );
}
