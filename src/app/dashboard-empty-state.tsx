import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { IconFileUpload, IconPlus } from "@tabler/icons-react";

// Home's first-run state: nothing imported yet, with the two ways to get started.
export async function DashboardEmptyState() {
  const t = await getTranslations("home.empty");
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-7 text-center">
      <p className="heading text-[15px] text-ink">{t("title")}</p>
      <p className="text-[13px] text-ink-3">{t("body")}</p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/import"
          className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[13px] font-bold text-bg transition-transform active:scale-95"
        >
          <IconFileUpload size={16} stroke={1.8} />
          {t("import")}
        </Link>
        <Link
          href="/transactions/add"
          className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-[13px] font-bold text-ink transition-transform active:scale-95"
        >
          <IconPlus size={16} stroke={1.8} />
          {t("create")}
        </Link>
      </div>
    </div>
  );
}
