"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMotionValue, useTransform } from "motion/react";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/components/ui/amount-input";
import { AuthPillButton } from "@/components/auth-pill-button";
import { BrandMark } from "@/components/brand-mark";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { CalendarContent } from "@/components/date-picker";
import { useIsMobile } from "@/lib/use-is-mobile";
import { m, AnimatePresence, spring, easeOutQuart, LazyMotion, domMax, animate } from "@/lib/motion";
import { useTheme, type ThemeMode } from "@/lib/theme";
import {
  AUTH_BACKGROUND_PRESETS,
  DEFAULT_AUTH_BACKGROUND_ID,
  authBackgroundStyle,
  authBackgroundPreviewStyle,
  getAuthBackgroundPreset,
} from "@/lib/auth-background";
import { setPinAction, setAppLockEnabledAction } from "@/app/actions/app-lock";
import { useFinishTransition } from "@/lib/finish-transition-state";
import {
  IconChevronLeft as ChevronLeft,
  IconXFilled as XIcon,
  IconArrowRight as ArrowRight,
  IconCalendarFilled as CalendarIcon,
  IconEye as Eye,
  IconEyeOff as EyeOff,
  IconUpload as Upload,
  IconFileTextFilled as FileText,
  IconCircleCheckFilled as CheckCircle2,
  IconAlertCircleFilled as AlertCircle,
  IconCake as Cake,
  IconUserFilled as UserIcon,
  IconMailFilled as Mail,
  IconLockFilled as Lock,
  IconRepeatOnce as Repeat,
  IconWallet,
  IconShieldCheck as ShieldCheck,
  IconShieldLockFilled as ShieldLock,
  IconMoonFilled,
  IconSunFilled,
  IconSunMoon,
  IconLanguage,
} from "@tabler/icons-react";
import { AvatarCropDialog } from "@/app/settings/avatar-crop-dialog";
import { NewAccountsPrompt } from "@/components/new-accounts-prompt";
import { locales, localeNames, LOCALE_COOKIE, type Locale } from "@/i18n/config";
import { BudgetStrategySliders, type BudgetStrategy } from "@/components/budget-strategy-sliders";
import { startTotpEnrollmentAction, confirmTotpEnrollmentAction } from "@/app/actions/mfa";
import type { Bank } from "@/db/schema";

type StepKey =
  | "name" | "email" | "birthday" | "password" | "mfa" | "photo"
  | "language" | "strategy" | "bill" | "import" | "appearance" | "appLock" | "finish";

const STEPS: StepKey[] = [
  "name", "email", "birthday", "password", "mfa", "photo",
  "language", "strategy", "bill", "import", "appearance", "appLock", "finish",
];

interface ImportResult {
  imported: number;
  skipped: number;
  autoCategorised: number;
  total: number;
  newAccounts?: Bank[];
}

const BILL_TYPES = [
  { value: "bill", label: "Bill" },
  { value: "subscription", label: "Subscription" },
  { value: "debt", label: "Debt" },
];

const THEME_MODES: { mode: ThemeMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { mode: "light", label: "Light", icon: IconSunFilled },
  { mode: "system", label: "Auto", icon: IconSunMoon },
  { mode: "dark", label: "Dark", icon: IconMoonFilled },
];

// Slide variants for the step-to-step transitions.
const slide = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 48 : -48 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -48 : 48 }),
};

// The wizard always sits on the auth pages' dark gradient scene regardless of the
// visitor's light/dark theme preference, so it can't lean on the app's theme-aware
// tokens (foreground/muted-foreground/etc. flip color with the OS theme and would
// go invisible against a fixed-dark background) — these local glass-styled
// replacements hardcode white-on-dark instead.
const glassInputClass = "border-white/15 bg-white/10 text-white placeholder:text-white/35 focus-visible:border-white/40 focus-visible:ring-white/20";

function GlassInput(props: React.ComponentProps<typeof Input>) {
  return <Input {...props} className={`${glassInputClass} ${props.className ?? ""}`} />;
}

function GlassLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-medium text-white/70">{children}</label>;
}

// A password input with a peek toggle — wraps GlassInput, swapping type between
// "password" and "text" rather than duplicating its styling.
function PasswordField({ className, ...props }: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <GlassInput {...props} type={show ? "text" : "password"} className={`pr-11 ${className ?? ""}`} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/45 hover:text-white/85 transition-colors"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

// A real calendar date picker for the birthday step — shows dd/mm/yyyy (day before
// month, unambiguous) rather than a native <input type="date">, whose display format
// otherwise follows the visitor's browser locale (often mm/dd/yyyy). `value`/`onChange`
// still deal in the ISO "YYYY-MM-DD" string the rest of the wizard (and the
// /api/onboarding route) expects. Uses the shared CalendarContent grid in `dark` mode,
// with its own glass-styled trigger and a dark-tinted Popover/Dialog shell — the shared
// DatePicker's own chrome leans on theme tokens that would go invisible against this
// hardcoded dark gradient.
function BirthdayPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const parsed = value ? new Date(`${value}T12:00:00`) : null;
  const [cursor, setCursor] = useState(() => parsed ?? new Date(2000, 0, 1));
  const isMobile = useIsMobile();

  function openChange(next: boolean) {
    setOpen(next);
    if (next) setCursor(parsed ?? new Date(2000, 0, 1));
  }

  const label = parsed
    ? parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "DD/MM/YYYY";

  const triggerClass = `${glassInputClass} h-13 rounded-xl flex items-center gap-2.5 px-3.5 w-full text-left`;

  const calendar = (
    <CalendarContent
      value={value}
      onChange={onChange}
      granularity="day"
      cursor={cursor}
      setCursor={setCursor}
      onClose={() => setOpen(false)}
      dark
    />
  );

  if (isMobile) {
    return (
      <>
        <button type="button" onClick={() => openChange(true)} className={triggerClass}>
          <CalendarIcon className="size-4 text-white/50 shrink-0" />
          <span className={value ? "text-white" : "text-white/35"}>{label}</span>
        </button>
        <Dialog open={open} onOpenChange={setOpen}>
          {/* `hideHeaderRow` + a fully custom header: the shared DialogContent's own
              auto-generated header/close-button spacing isn't easily tunable to an
              exact value, so this renders its own — 20px from the top of the sheet to
              the close button, 12px from there down to the calendar. */}
          <DialogContent hideHeaderRow sheetClassName="bg-[#0f1533]/70 backdrop-blur-xl text-white" className="pt-5">
            <div className="relative flex items-center justify-center mb-3">
              <DialogClose>
                <button
                  type="button"
                  aria-label="Close"
                  className="absolute left-0 flex items-center justify-center size-9 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  <XIcon className="size-4" />
                </button>
              </DialogClose>
              <p className="text-white font-medium">Pick your birthday date</p>
            </div>
            {calendar}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger className={triggerClass}>
        <CalendarIcon className="size-4 text-white/50 shrink-0" />
        <span className={value ? "text-white" : "text-white/35"}>{label}</span>
      </PopoverTrigger>
      <PopoverContent className="w-64 rounded-lg border border-white/10 bg-[#0f1533]/95 backdrop-blur-xl text-white shadow-xl">
        {calendar}
      </PopoverContent>
    </Popover>
  );
}

// The intro splash's CTA — a "slide to start" control: drag the arrow badge across the
// track (or just tap it) to advance. `domMax` is loaded locally since drag/layout
// projection isn't part of the app-wide `domAnimation` bundle (see lib/motion.ts).
function IntroStartButton({ onClick, className }: { onClick: () => void; className?: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [maxX, setMaxX] = useState(0);
  const [committed, setCommitted] = useState(false);
  const glow = useTransform(x, (v) => (maxX > 0 ? Math.min(v / maxX, 1) : 0));

  useEffect(() => {
    function measure() {
      if (trackRef.current) setMaxX(Math.max(trackRef.current.offsetWidth - 88, 40));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  function commit() {
    if (committed) return;
    setCommitted(true);
    animate(x, maxX, { type: "spring", stiffness: 280, damping: 26 });
    setTimeout(onClick, 260);
  }

  function handleDragEnd() {
    if (committed) return;
    if (x.get() > maxX * 0.55) commit();
    else animate(x, 0, { type: "spring", stiffness: 420, damping: 32 });
  }

  return (
    <LazyMotion features={domMax} strict>
      <div
        ref={trackRef}
        className={`relative w-full h-20 rounded-full bg-white/10 backdrop-blur-md border border-white/10 overflow-hidden select-none ${className ?? ""}`}
      >
        <m.div className="absolute inset-0 bg-white/20 pointer-events-none" style={{ opacity: glow }} />
        <span className="absolute inset-0 flex items-center justify-center text-white font-semibold text-lg pointer-events-none">
          Swipe to commit
        </span>
        <m.div
          drag={committed ? false : "x"}
          dragConstraints={{ left: 0, right: maxX }}
          dragElastic={0.08}
          dragMomentum={false}
          style={{ x }}
          onDragEnd={handleDragEnd}
          onClick={commit}
          whileTap={{ scale: 0.95 }}
          className="absolute left-2 top-2 bottom-2 aspect-square rounded-full bg-white/20 flex items-center justify-center text-white cursor-grab active:cursor-grabbing shadow-lg"
        >
          <ArrowRight className="size-6" />
        </m.div>
      </div>
    </LazyMotion>
  );
}

function GlassOutlineButton({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      {...props}
      className={`w-full h-13 rounded-full border border-white/20 bg-white/5 text-white font-medium active:scale-[0.98] transition-transform disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2 ${className ?? ""}`}
    />
  );
}

interface ResumeUser {
  firstName: string;
  lastName: string;
  email: string;
}

// The account/profile steps a returning-but-unfinished session shouldn't repeat —
// the account row (and these fields) already exist by the time any of them could be
// reached again after a refresh (see the "password" step's account creation below).
const RESUME_STEP: StepKey = "mfa";

export function OnboardingWizard({ resumeUser }: { resumeUser?: ResumeUser | null }) {
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const { active: finishing, start: startFinishTransition } = useFinishTransition();

  // The intro splash is a fully separate overlay (its own AnimatePresence, own fade
  // transition) rather than a step in the STEPS/index system — forcing it through the
  // same slide-variant machinery as the real steps produced a mismatched, janky
  // transition (a fixed full-bleed fade colliding with a normal-flow horizontal slide).
  // Keeping it independent also means the "name" step only mounts (and autofocuses)
  // once the splash is actually dismissed. Skipped entirely when resuming.
  const [showIntro, setShowIntro] = useState(() => !resumeUser);

  const resumeIndex = STEPS.indexOf(RESUME_STEP);
  const [index, setIndex] = useState(() => (resumeUser ? resumeIndex : 0));
  const [dir, setDir] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Account/profile fields — pre-filled from the existing account when resuming, so
  // "back" past the resume point still shows real values instead of blanks.
  const [firstName, setFirstName] = useState(resumeUser?.firstName ?? "");
  const [lastName, setLastName] = useState(resumeUser?.lastName ?? "");
  const [birthday, setBirthday] = useState("");
  const [email, setEmail] = useState(resumeUser?.email ?? "");
  const [password, setPassword] = useState("");

  // MFA step (optional, skippable) — reuses the same enrollment actions as the Settings
  // page. The account/session already exist by this point (created in the password step),
  // so getCurrentUser() inside these actions resolves correctly.
  const [mfaStep, setMfaStep] = useState<"offer" | "qr" | "backupCodes">("offer");
  const [mfaEnrollment, setMfaEnrollment] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBackupCodes, setMfaBackupCodes] = useState<string[]>([]);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaPending, setMfaPending] = useState(false);

  // Language step. Writes the locale cookie directly on the client instead of going
  // through the shared `setLocale` server action — calling a Server Action that sets a
  // cookie automatically invalidates the Next.js router cache for the current route,
  // which re-runs /register's `if (user) redirect("/")` guard (the account already
  // exists by this point) and ejects the user straight to the dashboard, skipping the
  // rest of the wizard. A plain cookie write has no such side effect.
  const [locale, setLocaleState] = useState<Locale>("en");
  function chooseLocale(next: Locale) {
    setLocaleState(next);
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  }

  // Photo step
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [cropSource, setCropSource] = useState<{ url: string; isBlob: boolean } | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Strategy step
  const [strategy, setStrategy] = useState<BudgetStrategy>({ nodig: 50, willen: 30, sparen: 20 });
  const [strategySaved, setStrategySaved] = useState(false);

  // Bill step
  const [billName, setBillName] = useState("");
  const [billType, setBillType] = useState("bill");
  const [billAmount, setBillAmount] = useState("");
  const [billDueDay, setBillDueDay] = useState("");
  const [billSaved, setBillSaved] = useState(false);

  // Import step
  const [importStatus, setImportStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [newAccounts, setNewAccounts] = useState<Bank[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Appearance step — the background preset applies live via a client-side overlay
  // (bgPreview) on top of AuthShell's server-rendered gradient, in addition to being
  // persisted for future page loads.
  const [bgPreview, setBgPreview] = useState<string | null>(null);
  async function chooseBackground(id: string) {
    setBgPreview(id);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "auth_background", value: id }),
    });
  }

  // App lock step — passcode only (no biometrics) to keep onboarding quick; the full
  // WebAuthn flow is still available afterwards in Settings → App Lock.
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinStage, setPinStage] = useState<"enter" | "confirm">("enter");
  const [appLockError, setAppLockError] = useState<string | null>(null);
  const [appLockSaving, setAppLockSaving] = useState(false);

  // Persistent top bar (back chevron + logo + progress) — pinned to the actual top of
  // the viewport (not AuthShell's centered/padded column) and always mounted once the
  // intro splash is dismissed, so step-to-step navigation never remounts it.
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  useEffect(() => {
    function measure() {
      setHeaderHeight(headerRef.current?.offsetHeight ?? 0);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const step = STEPS[index];
  const progress = (index / (STEPS.length - 1)) * 100;

  function go(next: number, direction: number) {
    setError(null);
    setDir(direction);
    setIndex(next);
  }

  // A resumed session's account already exists — stepping back into name/email/
  // birthday/password would let "Continue" re-submit the same email and 409 as
  // "already registered", so back() can't go earlier than the resume point.
  const minIndex = resumeUser ? resumeIndex : 0;
  function back() {
    if (index > minIndex) go(index - 1, -1);
  }

  // Validation for the current step's "next".
  function stepValid(): boolean {
    switch (step) {
      case "name":
        return firstName.trim().length > 0 && lastName.trim().length > 0;
      case "email":
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
      case "birthday":
        return birthday.trim().length > 0;
      case "password":
        return password.length >= 8;
      default:
        return true;
    }
  }

  async function next() {
    if (!stepValid()) return;

    // Catch a duplicate email as soon as the visitor leaves the email step, instead of
    // only surfacing it after they've also filled in a password. /api/onboarding still
    // re-checks at account creation — this is just earlier feedback, not the real guard.
    if (step === "email") {
      setPending(true);
      setError(null);
      try {
        const res = await fetch(`/api/onboarding/check-email?email=${encodeURIComponent(email.trim())}`);
        const data = await res.json().catch(() => ({ available: true }));
        if (!data.available) {
          setError("This email address is already registered.");
          return;
        }
      } catch {
        /* if the check itself fails, fall through — /api/onboarding still guards it */
      } finally {
        setPending(false);
      }
    }

    // Creating the account happens when leaving the password step. Uses a plain fetch to
    // the /api/onboarding route (not a server action) so it doesn't auto-refresh the
    // /register RSC and trip its `if (user) redirect("/")` guard mid-wizard.
    if (step === "password") {
      setPending(true);
      setError(null);
      try {
        const res = await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firstName, lastName, birthday, email, password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Something went wrong. Please try again.");
          return;
        }
      } catch {
        setError("Something went wrong. Please try again.");
        return;
      } finally {
        setPending(false);
      }
    }

    go(index + 1, 1);
  }

  async function uploadAvatar(blob: Blob) {
    setAvatarUploading(true);
    const formData = new FormData();
    formData.append("file", blob, "avatar.png");
    try {
      const res = await fetch("/api/profile/avatar", { method: "POST", body: formData });
      if (res.ok) {
        const body = await res.json();
        setAvatarUrl(body.url);
      }
    } finally {
      setAvatarUploading(false);
    }
  }

  function closeCropper() {
    if (cropSource?.isBlob) URL.revokeObjectURL(cropSource.url);
    setCropSource(null);
  }

  async function startMfaSetup() {
    setMfaPending(true);
    setMfaError(null);
    const result = await startTotpEnrollmentAction();
    setMfaPending(false);
    if ("error" in result) { setMfaError(result.error); return; }
    setMfaEnrollment(result);
    setMfaCode("");
    setMfaStep("qr");
  }

  async function confirmMfaSetup() {
    setMfaPending(true);
    setMfaError(null);
    const result = await confirmTotpEnrollmentAction(mfaCode);
    setMfaPending(false);
    if (result.error) { setMfaError(result.error); return; }
    setMfaBackupCodes(result.backupCodes ?? []);
    setMfaStep("backupCodes");
  }

  async function saveStrategy() {
    setPending(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "budget_strategy", value: JSON.stringify(strategy) }),
      });
      setStrategySaved(true);
      go(index + 1, 1);
    } finally {
      setPending(false);
    }
  }

  async function saveBill() {
    if (!billName.trim() || !billAmount) return;
    setPending(true);
    try {
      await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: billName.trim(),
          type: billType,
          amount: parseFloat(billAmount),
          frequency: "monthly",
          budgetType: "nodig",
          dueDay: billDueDay ? parseInt(billDueDay, 10) : null,
          matchPattern: billName.trim(),
        }),
      });
      setBillSaved(true);
      go(index + 1, 1);
    } finally {
      setPending(false);
    }
  }

  async function uploadCsv(file: File) {
    setImportStatus("loading");
    setImportError(null);
    setImportResult(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error ?? "Something went wrong");
        setImportStatus("error");
      } else {
        setImportResult(data);
        setImportStatus("success");
        if (data.newAccounts?.length > 0) setNewAccounts(data.newAccounts);
      }
    } catch (e) {
      setImportError(String(e));
      setImportStatus("error");
    }
  }

  async function savePinStep() {
    if (pinStage === "enter") {
      if (!/^\d{4,6}$/.test(pin)) { setAppLockError("Use 4–6 digits."); return; }
      setAppLockError(null);
      setPinStage("confirm");
      return;
    }
    if (pinConfirm !== pin) { setAppLockError("Codes don't match."); return; }
    setAppLockSaving(true);
    setAppLockError(null);
    const res = await setPinAction(pin);
    if (res.error) {
      setAppLockSaving(false);
      setAppLockError(res.error);
      return;
    }
    await setAppLockEnabledAction(true);
    setAppLockSaving(false);
    go(index + 1, 1);
  }

  // Marks onboarding as actually complete (see /api/onboarding/finish — the account
  // row itself was created back at the password step, so /register's guard needs this
  // separate signal to stop treating "a session exists" as "onboarding is done"), then
  // hands off to the persistent overlay (mounted in the root layout) rather than
  // navigating itself — see finish-transition-state.tsx for why.
  async function finish() {
    await fetch("/api/onboarding/finish", { method: "POST" }).catch(() => {});
    startFinishTransition({
      name: firstName,
      importResult: importResult ? { imported: importResult.imported, autoCategorised: importResult.autoCategorised } : null,
    });
  }

  const canGoBack = index > minIndex && !finishing;

  return (
    <div className="relative w-full">
      {/* Top bar — circular back-chevron (once there's somewhere to go back to), a
          persistent small "Arca" mark, and the progress bar. Pinned to the true top of
          the viewport; only mounts once the intro splash is dismissed. */}
      {!showIntro && (
        <>
          <div
            ref={headerRef}
            className="fixed inset-x-0 top-0 z-20 px-6 pt-[calc(1rem+var(--sat))] pb-2"
          >
            <div className="mx-auto h-1.5 w-full max-w-sm rounded-full bg-white/10 overflow-hidden mb-4">
              <m.div
                className="h-full rounded-full bg-white"
                animate={{ width: `${progress}%` }}
                transition={spring.snappy}
              />
            </div>
            <div className="relative mx-auto flex w-full max-w-sm items-center justify-center h-9">
              <AnimatePresence>
                {canGoBack && (
                  <m.button
                    type="button"
                    onClick={back}
                    aria-label="Back"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute left-0 flex items-center justify-center size-9 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors active:scale-95"
                  >
                    <ChevronLeft className="size-4.5" />
                  </m.button>
                )}
              </AnimatePresence>
              <BrandMark variant="light" size="md" />
            </div>
          </div>
          <div style={{ height: headerHeight }} aria-hidden />
        </>
      )}

      {/* Background preset preview — a client-controlled overlay so picking a preset in
          the "appearance" step applies immediately, instead of only on the next load.
          z-[1]: just above AuthShell's own background/scrim/blobs (which have no
          z-index of their own), but below the form content (z-10) so picking a preset
          doesn't cover the page — it replaces the *background*, not the form. */}
      <AnimatePresence>
        {bgPreview && (
          <m.div
            key={bgPreview}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="fixed inset-0 z-[1] pointer-events-none"
            style={authBackgroundStyle(getAuthBackgroundPreset(bgPreview), { theme: "dark" })}
          />
        )}
      </AnimatePresence>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <m.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="relative z-10 mb-4 rounded-xl bg-red-400/15 text-red-200 text-sm px-3.5 py-2.5"
          >
            {error}
          </m.div>
        )}
      </AnimatePresence>

      {/* Sliding step content — only mounts once the intro splash is dismissed, so the
          first step doesn't autofocus its input behind the splash. `mode="wait"` keeps
          only one step in the DOM at a time — without it, the entering and exiting
          steps briefly coexist as normal-flow siblings (they aren't absolutely
          positioned over each other) and stack on top of one another, causing a jump.
          A small horizontal padding + matching negative margin gives focus rings/
          borders room so they aren't clipped by this wrapper's `overflow-hidden`. */}
      {!showIntro && (
        <div className="relative z-10 overflow-hidden -mx-1.5 px-1.5">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <m.div
              key={step}
              custom={dir}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ x: spring.gentle, opacity: { duration: 0.2, ease: easeOutQuart } }}
            >
              {renderStep()}
            </m.div>
          </AnimatePresence>
        </div>
      )}

      {/* Intro splash — a fully independent overlay (own AnimatePresence, own fade)
          so dismissing it never has to share transition machinery with the step
          slider underneath. */}
      <AnimatePresence>
        {showIntro && (
          <m.div
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: easeOutQuart }}
            className="fixed inset-0 z-30 flex flex-col justify-end px-6 pb-[calc(4rem+var(--sab))] text-left"
          >
            <BrandMark variant="light" size="md" />
            <h1 className="mt-10 text-5xl sm:text-5xl font-light tracking-tight leading-[1.08] text-white max-w-sm text-left">
              A better way to stay on top of your money.
            </h1>
            <IntroStartButton onClick={() => setShowIntro(false)} className="mt-10" />
          </m.div>
        )}
      </AnimatePresence>

    </div>
  );

  function StepHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
    return (
      <div className="mb-6">
        <div className="mb-4 inline-flex size-15 items-center justify-center rounded-full bg-white/12 text-white [&_svg]:size-5">
          {icon}
        </div>
        <h1 className="text-2xl font-black tracking-tight mb-1 text-white">{title}</h1>
        <p className="text-sm text-white/55">{subtitle}</p>
      </div>
    );
  }

  function PrimaryButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
    return (
      <>
        <AuthPillButton onClick={onClick} disabled={disabled} className="mt-6">
          {children}
        </AuthPillButton>
        <p className="text-sm text-white/50 text-center mt-4">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-white hover:underline">
            Log in
          </Link>
        </p>
      </>
    );
  }

  function renderStep() {
    switch (step) {
      case "name":
        return (
          <div className="space-y-2">
            <StepHeader icon={<UserIcon />} title="Welcome to Arca" subtitle="Let's start with your name." />
            <GlassLabel>First name</GlassLabel>
            <GlassInput value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus placeholder="John" autoComplete="given-name" />
            <GlassLabel>Last name</GlassLabel>
            <GlassInput value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" autoComplete="family-name" />
            <PrimaryButton onClick={next} disabled={!stepValid()}>Continue</PrimaryButton>
          </div>
        );
      case "email":
        return (
          <div className="space-y-2">
            <StepHeader icon={<Mail />} title="Your email" subtitle="Used to sign in to your account." />
            <GlassLabel>Email address</GlassLabel>
            <GlassInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus placeholder="you@email.com" autoComplete="email" />
            <PrimaryButton onClick={next} disabled={!stepValid() || pending}>
              {pending ? "Checking…" : "Continue"}
            </PrimaryButton>
          </div>
        );
      case "birthday":
        return (
          <div className="space-y-2">
            <StepHeader icon={<Cake />} title={`Nice to meet you, ${firstName || "there"}`} subtitle="When's your birthday?" />
            <GlassLabel>Birthday</GlassLabel>
            <BirthdayPicker value={birthday} onChange={setBirthday} />
            <PrimaryButton onClick={next} disabled={!stepValid()}>Continue</PrimaryButton>
          </div>
        );
      case "password":
        return (
          <div className="space-y-2">
            <StepHeader icon={<Lock />} title="Choose a password" subtitle="At least 8 characters." />
            <GlassLabel>Password</GlassLabel>
            <PasswordField value={password} onChange={(e) => setPassword(e.target.value)} autoFocus placeholder="••••••••" autoComplete="new-password" />
            <PrimaryButton onClick={next} disabled={!stepValid() || pending}>
              {pending ? "Creating account…" : "Create account"}
            </PrimaryButton>
          </div>
        );
      case "mfa":
        if (mfaStep === "backupCodes") {
          return (
            <div>
              <StepHeader icon={<ShieldCheck />} title="Save your backup codes" subtitle="Each code works once if you ever lose access to your authenticator app." />
              <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-white/10 p-3 font-mono text-sm text-white">
                {mfaBackupCodes.map((c) => <span key={c}>{c}</span>)}
              </div>
              <PrimaryButton onClick={next}>I&apos;ve saved these</PrimaryButton>
            </div>
          );
        }
        if (mfaStep === "qr") {
          return (
            <div className="space-y-2">
              <StepHeader icon={<ShieldCheck />} title="Scan the QR code" subtitle="Use Google Authenticator or any TOTP app." />
              {mfaEnrollment && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mfaEnrollment.qrDataUrl} alt="QR code" className="mx-auto mb-3 size-40 rounded-lg bg-white p-2" />
              )}
              <p className="text-xs text-white/45 break-all mb-3">
                Or enter manually: <span className="font-mono">{mfaEnrollment?.secret}</span>
              </p>
              <GlassLabel>6-digit code</GlassLabel>
              <GlassInput
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="123456"
                autoFocus
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") confirmMfaSetup(); }}
              />
              {mfaError && <p className="text-xs text-red-300">{mfaError}</p>}
              <AuthPillButton onClick={confirmMfaSetup} disabled={mfaPending || mfaCode.length !== 6} className="mt-6">
                {mfaPending ? "Confirming…" : "Confirm"}
              </AuthPillButton>
              <button
                type="button"
                onClick={() => { setMfaStep("offer"); setMfaEnrollment(null); setMfaError(null); }}
                className="w-full mt-3 text-sm text-white/50 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          );
        }
        return (
          <div>
            <StepHeader icon={<ShieldCheck />} title="Add extra security" subtitle="Set up two-factor authentication with an authenticator app — optional, you can do this later in Settings." />
            {mfaError && <p className="text-xs text-red-300 mb-2">{mfaError}</p>}
            <GlassOutlineButton onClick={startMfaSetup} disabled={mfaPending}>
              <ShieldCheck className="size-4" />
              {mfaPending ? "Loading…" : "Set up two-factor authentication"}
            </GlassOutlineButton>
            <button type="button" onClick={() => go(index + 1, 1)} className="w-full mt-3 text-sm text-white/50 hover:text-white transition-colors">
              Skip for now
            </button>
          </div>
        );
      case "photo":
        return (
          <div>
            <StepHeader icon={<UserIcon />} title="Add a profile photo" subtitle="Shown in the sidebar and menu — you can skip this." />
            <div className="flex flex-col items-center gap-4 py-2">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="size-32 rounded-full object-cover shadow-sm" />
              ) : (
                <div className="size-32 rounded-full bg-white/10 flex items-center justify-center text-white/40">
                  <UserIcon className="size-14" />
                </div>
              )}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setCropSource({ url: URL.createObjectURL(file), isBlob: true });
                  e.target.value = "";
                }}
              />
              <GlassOutlineButton type="button" disabled={avatarUploading} onClick={() => photoInputRef.current?.click()} className="w-auto px-6">
                <Upload className="size-4" />
                {avatarUploading ? "Uploading…" : avatarUrl ? "Change photo" : "Choose photo"}
              </GlassOutlineButton>
            </div>
            <AvatarCropDialog
              imageUrl={cropSource?.url ?? null}
              open={cropSource !== null}
              onOpenChange={(open) => { if (!open) closeCropper(); }}
              onCropped={(blob) => { closeCropper(); uploadAvatar(blob); }}
              dark
            />
            <PrimaryButton onClick={next}>{avatarUrl ? "Continue" : "Skip for now"}</PrimaryButton>
          </div>
        );
      case "language":
        return (
          <div>
            <StepHeader icon={<IconLanguage />} title="Preferred language" subtitle="You can change this anytime in settings." />
            <div className="grid grid-cols-2 gap-3 py-2">
              {locales.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => chooseLocale(l)}
                  className={`h-14 rounded-xl text-sm font-semibold transition-colors border-2 ${
                    locale === l
                      ? "border-blue-400 bg-blue-400/15 text-white"
                      : "border-white/10 text-white/55 hover:bg-white/5"
                  }`}
                >
                  {localeNames[l]}
                </button>
              ))}
            </div>
            <PrimaryButton onClick={next}>Continue</PrimaryButton>
          </div>
        );
      case "strategy": {
        const total = strategy.nodig + strategy.willen + strategy.sparen;
        return (
          <div>
            <StepHeader icon={<IconWallet />} title="Your budget strategy" subtitle="How should your income split across Needs, Wants, and Savings & Debts?" />
            <p className="text-xs text-white/45 -mt-4 mb-4">50/30/20 is the most common split — a good starting point if you&apos;re not sure.</p>
            <BudgetStrategySliders value={strategy} onChange={setStrategy} dark />
            <AuthPillButton onClick={saveStrategy} disabled={pending || total !== 100} className="mt-6">
              {pending ? "Saving…" : strategySaved ? "Saved · Continue" : "Continue"}
            </AuthPillButton>
          </div>
        );
      }
      case "bill":
        return (
          <div>
            <StepHeader icon={<Repeat />} title="Add a recurring bill" subtitle="Rent, a subscription, insurance… you can skip this." />
            <GlassLabel>Name</GlassLabel>
            <GlassInput value={billName} onChange={(e) => setBillName(e.target.value)} placeholder="Netflix" />
            <GlassLabel>Type</GlassLabel>
            <div className="mt-1 mb-3 grid grid-cols-3 gap-2">
              {BILL_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setBillType(t.value)}
                  className={`h-10 rounded-lg text-sm font-medium transition-colors ${
                    billType === t.value ? "bg-white text-[#0a1a5c]" : "bg-white/8 text-white/65 hover:bg-white/15"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <GlassLabel>Amount (EUR)</GlassLabel>
                <AmountInput value={billAmount} onChange={(e) => setBillAmount(e.target.value)} placeholder="12.99" className={glassInputClass} />
              </div>
              <div>
                <GlassLabel>Due day (1–31)</GlassLabel>
                <GlassInput type="number" inputMode="numeric" min="1" max="31" value={billDueDay} onChange={(e) => setBillDueDay(e.target.value)} placeholder="28" />
              </div>
            </div>
            <AuthPillButton onClick={saveBill} disabled={pending || !billName.trim() || !billAmount} className="mt-6">
              {pending ? "Saving…" : billSaved ? "Saved · Continue" : "Save & continue"}
            </AuthPillButton>
            <button type="button" onClick={() => go(index + 1, 1)} className="w-full mt-3 text-sm text-white/50 hover:text-white transition-colors">
              Skip for now
            </button>
          </div>
        );
      case "import":
        return (
          <div>
            <StepHeader icon={<Upload />} title="Import your transactions" subtitle="Upload an map your CSV export — or skip and do it later." />
            <div
              onClick={() => importStatus !== "loading" && inputRef.current?.click()}
              className="rounded-2xl border-2 border-dashed border-white/20 hover:border-white/35 hover:bg-white/5 transition-colors p-8 flex flex-col items-center justify-center gap-3 cursor-pointer text-center"
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadCsv(f);
                }}
              />
              {importStatus === "idle" && (
                <>
                  <Upload className="size-9 text-white/50" />
                  <div>
                    <p className="font-medium text-white">Choose a CSV file</p>
                    <p className="text-sm text-white/50">Tab-separated ING export</p>
                  </div>
                </>
              )}
              {importStatus === "loading" && (
                <>
                  <FileText className="size-9 text-white animate-pulse" />
                  <p className="font-medium text-white">Importing…</p>
                </>
              )}
              {importStatus === "success" && importResult && (
                <>
                  <CheckCircle2 className="size-9 text-emerald-300" />
                  <div>
                    <p className="font-semibold text-emerald-300">{importResult.imported} transactions imported</p>
                    {importResult.autoCategorised > 0 && (
                      <p className="text-sm text-white/50">{importResult.autoCategorised} automatically categorised</p>
                    )}
                    {importResult.skipped > 0 && <p className="text-sm text-white/50">{importResult.skipped} skipped (already present)</p>}
                  </div>
                </>
              )}
              {importStatus === "error" && (
                <>
                  <AlertCircle className="size-9 text-red-300" />
                  <div>
                    <p className="font-semibold text-red-300">Import failed</p>
                    <p className="text-sm text-white/50">{importError}</p>
                  </div>
                </>
              )}
            </div>
            {importResult ? (
              <PrimaryButton onClick={next}>Continue</PrimaryButton>
            ) : (
              <button type="button" onClick={() => go(index + 1, 1)} className="w-full mt-3 text-sm text-white/50 hover:text-white transition-colors">
                Skip for now
              </button>
            )}
            <NewAccountsPrompt accounts={newAccounts} onDone={() => setNewAccounts([])} />
          </div>
        );
      case "appearance":
        return (
          <div>
            <StepHeader icon={<IconMoonFilled />} title="Make it yours" subtitle="Pick a theme and a background — applied right away, changeable anytime in Settings." />
            <GlassLabel>Theme</GlassLabel>
            <div className="mt-1 mb-4 grid grid-cols-3 gap-2">
              {THEME_MODES.map(({ mode: m2, label, icon: Icon }) => (
                <button
                  key={m2}
                  type="button"
                  onClick={() => setThemeMode(m2)}
                  className={`h-14 rounded-xl flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors border-2 ${
                    themeMode === m2
                      ? "border-white bg-white/12 text-white"
                      : "border-white/10 text-white/55 hover:bg-white/5"
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>
            <GlassLabel>Background</GlassLabel>
            <div className="mt-1 grid grid-cols-3 gap-3">
              {AUTH_BACKGROUND_PRESETS.map((preset) => {
                const isSelected = bgPreview ? bgPreview === preset.id : preset.id === DEFAULT_AUTH_BACKGROUND_ID;
                return (
                  <button key={preset.id} type="button" onClick={() => chooseBackground(preset.id)} className="flex flex-col items-center gap-1.5">
                    <span
                      className={`h-12 w-full rounded-lg ring-2 ring-offset-2 ring-offset-transparent transition-all ${isSelected ? "ring-white" : "ring-transparent"}`}
                      style={authBackgroundPreviewStyle(preset, { theme: "dark" })}
                    />
                    <span className="text-[11px] text-white/60">{preset.label}</span>
                  </button>
                );
              })}
            </div>
            <PrimaryButton onClick={next}>Continue</PrimaryButton>
          </div>
        );
      case "appLock":
        return (
          <div>
            <StepHeader icon={<ShieldLock />} title="Lock the app" subtitle="Set a passcode so only you can open Arca — optional, skip if you don't need it." />
            {appLockError && <p className="text-xs text-red-300 mb-2">{appLockError}</p>}
            <GlassLabel>{pinStage === "enter" ? "Choose a 4–6 digit passcode" : "Confirm your passcode"}</GlassLabel>
            <GlassInput
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="••••"
              autoFocus
              value={pinStage === "enter" ? pin : pinConfirm}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                if (pinStage === "enter") setPin(v);
                else setPinConfirm(v);
              }}
            />
            <AuthPillButton
              onClick={savePinStep}
              disabled={appLockSaving || (pinStage === "enter" ? pin.length < 4 : pinConfirm.length < 4)}
              className="mt-6"
            >
              {appLockSaving ? "Saving…" : pinStage === "enter" ? "Continue" : "Set passcode"}
            </AuthPillButton>
            <button type="button" onClick={() => go(index + 1, 1)} className="w-full mt-3 text-sm text-white/50 hover:text-white transition-colors">
              Skip for now
            </button>
          </div>
        );
      case "finish":
        return (
          <div className="text-center">
            <m.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={spring.gentle}
              className="mx-auto mb-5 inline-flex size-16 items-center justify-center rounded-3xl bg-white/12 text-white shadow-lg [&_svg]:size-8"
            >
              <CheckCircle2 />
            </m.div>
            <h1 className="text-2xl font-black tracking-tight mb-1 text-white">You&apos;re all set{firstName ? `, ${firstName}` : ""}!</h1>
            <p className="text-sm text-white/55 mb-2">
              {importResult
                ? `${importResult.imported} transactions are ready and waiting.`
                : "Your account is ready. Let's get started."}
            </p>
            <AuthPillButton onClick={finish} disabled={finishing} className="mt-6">
              {finishing ? "Loading your dashboard…" : "Finish"}
            </AuthPillButton>
          </div>
        );
    }
  }
}

