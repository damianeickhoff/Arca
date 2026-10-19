import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { IconBolt, IconCheck, IconLock, IconTarget } from "@tabler/icons-react";
import { getCurrentUser } from "@/lib/auth";
import { isFirstUser } from "@/app/actions/auth";
import { isOpenSignupAllowed } from "@/lib/invites";
import { Amount } from "@/components/clear/amount";
import { BrandMark } from "@/components/clear/brand-mark";
import { ClearChip } from "@/components/clear/chip";
import { IconTile } from "@/components/clear/icon-tile";
import { formatEurWhole } from "@/lib/format";
import { LoginForm } from "./login-form";

// Reads the session and the locale cookie on every request.
export const dynamic = "force-dynamic";

// Sign-in (Clear): on desktop a black brand panel on the left and the sign-in card
// centred on the grey ground to its right; on phones only the form, straight on the
// ground (see the Desktop-Login / Phone-Login-2FA mockups).
export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  // Fresh install (no accounts yet) → send them straight into onboarding.
  if (await isFirstUser()) redirect("/register");

  const t = await getTranslations("auth");

  return (
    <div className="flex min-h-dvh bg-clear-ground font-clear text-clear-ink">
      <BrandPanel />

      <div className="relative flex min-w-0 flex-1 flex-col items-center px-4 pt-[calc(var(--sat)+16px)] pb-[calc(var(--sab)+16px)] lg:justify-center lg:p-12">
        <div className="flex w-full max-w-[440px] flex-1 flex-col lg:flex-none lg:rounded-clear-dialog lg:bg-clear-card lg:p-9">
          <Suspense>
            {/* Sign-up closes after the first user: the link only shows while the
                ALLOW_OPEN_SIGNUP escape hatch is set; invited people arrive by link. */}
            <LoginForm signupOpen={isOpenSignupAllowed()} />
          </Suspense>
        </div>
        <p className="m-0 hidden text-center text-xs text-clear-muted lg:absolute lg:inset-x-0 lg:bottom-7 lg:block">
          {t("copyright", { year: new Date().getFullYear() })}
        </p>
      </div>
    </div>
  );
}

/** The left half on desktop: what Arca does, with a small decorative preview. */
async function BrandPanel() {
  const t = await getTranslations("auth.brand");
  // Dark in both themes: the hero colours in light mode, the card colours in dark mode
  // (an inverted, near-white half screen would glare there).
  const ink2 = "text-clear-hero-ink-2 dark:text-clear-ink-2";

  return (
    <section
      aria-label={t("label")}
      className="relative hidden min-w-0 flex-1 flex-col overflow-hidden bg-clear-hero px-16 py-12 text-clear-hero-ink lg:flex dark:bg-clear-card dark:text-clear-ink"
    >
      <span className="inline-flex items-center gap-2.5 text-[19px] font-extrabold tracking-[-0.02em]">
        <BrandMark />
        Arca
      </span>

      <h2 className="m-0 mt-[72px] max-w-[560px] text-[44px] leading-[1.05] font-extrabold tracking-[-0.035em] xl:text-[56px]">{t("title")}</h2>
      <p className={`m-0 mt-[22px] max-w-[480px] text-lg leading-[1.55] ${ink2}`}>{t("body")}</p>

      <div aria-hidden className="relative mt-11 hidden h-[300px] xl:block">
        <div className="absolute top-[34px] left-0 flex w-[360px] -rotate-3 flex-col gap-3.5 rounded-clear-card bg-clear-card p-[22px] text-clear-ink dark:bg-clear-tile">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[15px] font-bold">{t("previewSafeToSpend")}</span>
            <ClearChip tone="mint" icon={<IconCheck stroke={3} />}>
              {t("previewOnPace")}
            </ClearChip>
          </div>
          <Amount value={973.25} className="text-[46px] leading-none tracking-[-0.035em]" />
          <div className="clear-hatch flex h-2.5 overflow-hidden rounded-full">
            <span className="w-[58%] rounded-full bg-clear-ember" />
          </div>
          <span className="text-[13px] text-clear-ink-2">
            {t.rich("previewPerDay", {
              amount: formatEurWhole(97),
              b: (chunks) => <b className="text-clear-ink">{chunks}</b>,
            })}
          </span>
        </div>

        <div className="absolute top-0 left-[318px] inline-flex h-[52px] rotate-[4deg] items-center gap-2.5 rounded-full bg-clear-ember pr-5 pl-2 text-[15px] font-extrabold text-clear-ember-ink">
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-clear-ember-ink/10">
            <IconTarget size={18} stroke={1.9} />
          </span>
          {t("previewSaved", { amount: formatEurWhole(650), percent: 16 })}
        </div>

        <div className="absolute top-[196px] left-[390px] flex w-[220px] rotate-2 items-center gap-3 rounded-clear-tile bg-current/8 px-4 py-3.5">
          <IconTile tone="stone" size="sm">
            <IconBolt stroke={1.9} />
          </IconTile>
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-bold">{t("previewBill", { amount: formatEurWhole(142) })}</span>
            <span className={`text-xs ${ink2}`}>{t("previewBillDue")}</span>
          </span>
        </div>
      </div>

      <span className={`mt-auto inline-flex items-center gap-2.5 pt-10 text-sm ${ink2}`}>
        <IconLock size={18} stroke={1.9} aria-hidden />
        {t("privacy")}
      </span>
    </section>
  );
}
