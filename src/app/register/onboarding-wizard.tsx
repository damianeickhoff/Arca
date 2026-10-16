"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { m, AnimatePresence, spring, easeOutQuart } from "@/lib/motion";
import { useTheme } from "@/lib/theme";
import { LOCALE_COOKIE, type Locale } from "@/i18n/config";
import { useFinishTransition } from "@/lib/finish-transition-state";
import type { BudgetStrategyDraft } from "@/app/budget/budget-strategy-editor";
import { cn } from "@/lib/utils";
import { OnboardingBrand, OnboardingStepper, StepNotice, StepProgress, type StepperGroup } from "./onboarding-ui";
import { AboutYouStep, PasswordStep, WelcomeStep, aboutYouValid, passwordValid, type AboutYou } from "./steps/account-steps";
import { BackupCodesStep, TwoFactorStep } from "./steps/security-steps";
import { MakeItYoursStep, ProfileStep } from "./steps/you-steps";
import { BillStep, ImportStep, StrategyStep, type ImportedFile } from "./steps/money-steps";
import { AppLockStep, FinishStep } from "./steps/lock-steps";

// The Clear onboarding (Onboard-01 … Onboard-12): a black stepper panel on the left
// (lg+) and one white step card on the grey ground. Twelve steps in five groups.
const GROUPS = [
  { key: "account", steps: ["welcome", "about", "password"] },
  { key: "security", steps: ["mfa", "backupCodes"] },
  { key: "you", steps: ["profile", "makeItYours"] },
  { key: "money", steps: ["strategy", "bill", "import"] },
  { key: "lock", steps: ["appLock", "finish"] },
] as const;

type StepKey = (typeof GROUPS)[number]["steps"][number];
const STEPS: StepKey[] = GROUPS.flatMap((g) => [...g.steps]);
const groupOf = (step: StepKey) => GROUPS.find((g) => (g.steps as readonly StepKey[]).includes(step))!.key;
const at = (step: StepKey) => STEPS.indexOf(step);

/** The card's width per step, as drawn. */
const CARD_WIDTH: Partial<Record<StepKey, string>> = {
  welcome: "max-w-[780px]",
  makeItYours: "max-w-[640px]",
  strategy: "max-w-[600px]",
  bill: "max-w-[640px]",
  finish: "max-w-[860px]",
};

const slide = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 40 : -40 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -40 : 40 }),
};

export interface ResumeUser {
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  mfaEnabled: boolean;
}

// The step a session that already has an account picks up at — the account row exists
// once the password step has run (see /api/onboarding), so the steps before it can't
// run again (re-submitting the same email would 409 as "already registered").
const RESUME_STEP: StepKey = "mfa";

export function OnboardingWizard({ resumeUser }: { resumeUser?: ResumeUser | null }) {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const currentLocale = useLocale() as Locale;
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const { active: finishing, start: startFinishTransition } = useFinishTransition();

  const [accountCreated, setAccountCreated] = useState(!!resumeUser);
  const [index, setIndex] = useState(() => (resumeUser ? at(RESUME_STEP) : 0));
  const [dir, setDir] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Account
  const [about, setAbout] = useState<AboutYou>({
    firstName: resumeUser?.firstName ?? "",
    lastName: resumeUser?.lastName ?? "",
    email: resumeUser?.email ?? "",
    birthday: "",
  });
  const [emailError, setEmailError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // Security
  const [mfaEnabled, setMfaEnabled] = useState(resumeUser?.mfaEnabled ?? false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  // You
  const [avatarUrl, setAvatarUrl] = useState<string | null>(resumeUser?.avatarUrl ?? null);
  const [locale, setLocale] = useState<Locale>(currentLocale);

  // Money and lock
  const [strategy, setStrategy] = useState<BudgetStrategyDraft>({ nodig: 50, willen: 30, sparen: 20 });
  const [billsSaved, setBillsSaved] = useState(0);
  const [imports, setImports] = useState<ImportedFile[]>([]);
  const [appLockOn, setAppLockOn] = useState(false);

  const step = STEPS[index];
  const minIndex = accountCreated ? at(RESUME_STEP) : 0;

  function go(next: StepKey, direction = at(next) > index ? 1 : -1) {
    setError(null);
    setDir(direction);
    setIndex(at(next));
  }
  const forward = () => go(STEPS[index + 1], 1);

  function back() {
    if (index <= minIndex) return;
    // Backup codes only show right after turning two-factor on.
    if (step === "profile" && backupCodes.length === 0) return go("mfa", -1);
    go(STEPS[index - 1], -1);
  }
  const onBack = index > minIndex && !finishing ? back : undefined;

  // Catches a duplicate email when leaving the step instead of only after the password;
  // /api/onboarding still re-checks at account creation, this is just earlier feedback.
  async function submitAbout() {
    if (!aboutYouValid(about)) return;
    setPending(true);
    setEmailError(null);
    try {
      const res = await fetch(`/api/onboarding/check-email?email=${encodeURIComponent(about.email.trim())}`);
      const data = await res.json().catch(() => ({ available: true }));
      if (!data.available) {
        setEmailError(t("about.emailTaken"));
        return;
      }
    } catch {
      /* the check itself failed — fall through, /api/onboarding still guards it */
    } finally {
      setPending(false);
    }
    forward();
  }

  // Creates the account and signs in. A plain fetch to a route handler (not a server
  // action), so nothing refreshes /register halfway through the wizard.
  async function createAccount() {
    if (!passwordValid(password, confirm, about.email)) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...about, password }),
      });
      if (!res.ok) {
        if (res.status === 409) {
          setEmailError(t("about.emailTaken"));
          go("about", -1);
        } else {
          setError(t("genericError"));
        }
        return;
      }
    } catch {
      setError(t("genericError"));
      return;
    } finally {
      setPending(false);
    }
    setAccountCreated(true);
    setPassword("");
    setConfirm("");
    forward();
  }

  // The locale lives in a cookie (no /en or /nl routes); refreshing re-renders the
  // server tree with the new messages while the wizard keeps its state.
  function chooseLocale(next: Locale) {
    setLocale(next);
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    router.refresh();
  }

  async function saveStrategy() {
    setPending(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "budget_strategy", value: JSON.stringify(strategy) }),
      });
      if (!res.ok) throw new Error();
      forward();
    } catch {
      setError(t("genericError"));
    } finally {
      setPending(false);
    }
  }

  // Marks onboarding complete (the account row exists since the password step, so
  // /register needs this separate signal), then hands off to the overlay in the root
  // layout, which survives the navigation — see finish-transition-state.tsx.
  async function finish() {
    await fetch("/api/onboarding/finish", { method: "POST" }).catch(() => {});
    const imported = imports.reduce((n, f) => n + f.imported, 0);
    startFinishTransition({
      name: about.firstName,
      importResult: imports.length ? { imported, autoCategorised: imports.reduce((n, f) => n + f.autoCategorised, 0) } : null,
    });
  }

  const groups: StepperGroup[] = GROUPS.map((g) => ({
    name: t(`groups.${g.key}`),
    steps: g.steps.map((s) => ({ key: s, label: t(`steps.${s}`) })),
  }));

  const signInLink = !accountCreated && (
    <>
      {t("haveAccount")}{" "}
      <Link href="/login" className="font-bold text-current underline-offset-2 hover:underline">
        {t("signIn")}
      </Link>
    </>
  );

  function renderStep() {
    switch (step) {
      case "welcome":
        return <WelcomeStep onStart={forward} signedIn={accountCreated} />;
      case "about":
        return (
          <AboutYouStep
            value={about}
            onChange={(v) => {
              if (v.email !== about.email) setEmailError(null);
              setAbout(v);
            }}
            emailError={emailError}
            checking={pending}
            onBack={onBack}
            onNext={submitAbout}
          />
        );
      case "password":
        return (
          <PasswordStep
            password={password}
            confirm={confirm}
            email={about.email}
            onChange={(p, c) => {
              setPassword(p);
              setConfirm(c);
            }}
            pending={pending}
            onBack={onBack}
            onNext={createAccount}
          />
        );
      case "mfa":
        return (
          <TwoFactorStep
            enabled={mfaEnabled}
            onEnabled={(codes) => {
              setMfaEnabled(true);
              setBackupCodes(codes);
              go("backupCodes", 1);
            }}
            onBack={onBack}
            onSkip={() => go("profile", 1)}
            onNext={() => go(backupCodes.length ? "backupCodes" : "profile", 1)}
          />
        );
      case "backupCodes":
        return <BackupCodesStep codes={backupCodes} email={about.email} onBack={onBack} onNext={forward} />;
      case "profile":
        return (
          <ProfileStep
            firstName={about.firstName}
            lastName={about.lastName}
            avatarUrl={avatarUrl}
            onAvatarUploaded={setAvatarUrl}
            locale={locale}
            onLocale={chooseLocale}
            onBack={onBack}
            onNext={forward}
          />
        );
      case "makeItYours":
        return (
          <MakeItYoursStep
            theme={themeMode}
            onTheme={setThemeMode}
            onBack={onBack}
            onNext={forward}
          />
        );
      case "strategy":
        return <StrategyStep value={strategy} onChange={setStrategy} pending={pending} onBack={onBack} onNext={saveStrategy} />;
      case "bill":
        return <BillStep savedCount={billsSaved} onSaved={() => setBillsSaved((n) => n + 1)} onBack={onBack} onSkip={forward} onNext={forward} />;
      case "import":
        return <ImportStep files={imports} onImported={(f) => setImports((list) => [...list, f])} onBack={onBack} onSkip={forward} onNext={forward} />;
      case "appLock":
        return (
          <AppLockStep
            onLocked={() => {
              setAppLockOn(true);
              forward();
            }}
            onBack={onBack}
            onSkip={forward}
          />
        );
      case "finish":
        return (
          <FinishStep
            firstName={about.firstName}
            imported={imports.reduce((n, f) => n + f.imported, 0)}
            bills={billsSaved}
            strategy={strategy}
            appLock={appLockOn}
            finishing={finishing}
            onFinish={finish}
          />
        );
    }
  }

  return (
    <div className="flex min-h-dvh w-full bg-clear-ground font-clear text-clear-ink">
      <OnboardingStepper groups={groups} currentKey={step} footer={signInLink || undefined} />

      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        {/* Phones: the logo (and sign-in link) above the card instead of the panel. */}
        <div className="flex items-center justify-between gap-3 px-4 pt-[calc(16px+var(--sat,0px))] lg:hidden">
          <OnboardingBrand />
          {signInLink && (
            <Link href="/login" className="text-sm font-bold text-clear-ember-text no-underline hover:underline">
              {t("signIn")}
            </Link>
          )}
        </div>

        <div className="flex flex-1 items-start justify-center px-4 pt-4 pb-[calc(24px+var(--sab,0px))] sm:items-center sm:p-10">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <m.div
              key={step}
              custom={dir}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ x: spring.gentle, opacity: { duration: 0.2, ease: easeOutQuart } }}
              className={cn("w-full", CARD_WIDTH[step] ?? "max-w-[560px]")}
            >
              {step === "finish" ? (
                renderStep()
              ) : (
                // Never taller than the window: the card scrolls inside and the step footer sticks
                // to its bottom (StepFooter), so Continue stays in view when a step grows.
                <div
                  className={cn(
                    "clear-scrollbar flex max-h-[calc(100dvh-7.5rem-var(--sat,0px)-var(--sab,0px))] flex-col overflow-y-auto rounded-clear-dialog bg-clear-card p-6 sm:max-h-[calc(100dvh-8.5rem)] lg:max-h-[calc(100dvh-5rem)]",
                    step === "welcome" ? "gap-[30px] sm:p-11" : "gap-6 sm:p-9",
                  )}
                >
                  <StepProgress current={index + 1} total={STEPS.length} group={t(`groups.${groupOf(step)}`)} />
                  {error && <StepNotice>{error}</StepNotice>}
                  {renderStep()}
                </div>
              )}
            </m.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
