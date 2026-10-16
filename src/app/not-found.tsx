import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { IconHome } from "@tabler/icons-react";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { ReceiptIllustration, StatusCard } from "@/components/clear/status-card";

export default async function NotFound() {
  const t = await getTranslations("statusPages.notFound");

  return (
    <StatusCard
      illustration={<ReceiptIllustration badge="question" />}
      title={t("title")}
      body={t("body")}
      actions={
        <Link href="/" className={clearButtonVariants({ variant: "primary", size: "lg" })}>
          <IconHome stroke={2} aria-hidden />
          {t("backHome")}
        </Link>
      }
    />
  );
}
