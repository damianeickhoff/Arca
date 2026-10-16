"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconBackspace, IconChevronLeft, IconEye, IconEyeOff, IconLock } from "@tabler/icons-react";
import { ClearButton } from "@/components/clear/button";
import { ClearField, ClearInput } from "@/components/clear/field";
import { IconTile } from "@/components/clear/icon-tile";
import { BrandMark } from "@/components/clear/brand-mark";
import { LanguageSwitch } from "./language-switch";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { cn } from "@/lib/utils";
import { loginAction, verifyMfaAction } from "@/app/actions/auth";

const CODE_LENGTH = 6;

// Inputs sit on the grey page ground on phones (no card there, as in the phone
// mockup) and on the white card from lg up.
const fieldSurface = "bg-clear-card lg:bg-clear-tile";

export function LoginForm() {
  const t = useTranslations("auth");
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const justRegistered = searchParams.get("registered") === "1";

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Controlled so the email survives the form reset React performs after an action runs —
  // only the password should be cleared when login fails.
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Once loginAction reports mfaRequired, the form swaps to a code-entry step instead of
  // redirecting — the password step already completed server-side (an mfa_pending cookie
  // now identifies the pending login).
  const [mfaRequired, setMfaRequired] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [code, setCode] = useState("");

  async function handleSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    const result = await loginAction(formData);
    setPending(false);
    if (result?.error) setError(result.error);
    else if (result?.mfaRequired) setMfaRequired(true);
  }

  async function handleVerify(formData: FormData) {
    setError(null);
    setPending(true);
    const result = await verifyMfaAction(formData);
    setPending(false);
    if (result?.error) setError(result.error);
  }

  function backToSignIn() {
    setMfaRequired(false);
    setUseBackupCode(false);
    setCode("");
    setError(null);
  }

  if (mfaRequired) {
    return (
      <MfaStep
        email={email}
        code={code}
        setCode={setCode}
        useBackupCode={useBackupCode}
        toggleBackupCode={() => {
          setUseBackupCode((v) => !v);
          setCode("");
          setError(null);
        }}
        error={error}
        pending={pending}
        onBack={backToSignIn}
        onSubmit={handleVerify}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BrandMark size="lg" className="lg:hidden" />
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.03em] lg:text-[28px] lg:tracking-[-0.02em]">{t("signIn.title")}</h1>
          <p className="m-0 text-[15px] text-clear-ink-2">{t("signIn.subtitle")}</p>
        </div>
      </div>

      {justRegistered && <Notice tone="positive">{t("signIn.registered")}</Notice>}
      {error && <Notice tone="negative">{error}</Notice>}

      <form action={handleSubmit} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <ClearField label={t("signIn.email")} htmlFor="login-email">
          <ClearInput
            id="login-email"
            type="email"
            name="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldSurface}
          />
        </ClearField>

        <ClearField label={t("signIn.password")} htmlFor="login-password">
          <div className="relative">
            <ClearInput
              id="login-password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder={t("signIn.passwordPlaceholder")}
              className={cn(fieldSurface, "pr-[52px]")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t("signIn.hidePassword") : t("signIn.showPassword")}
              aria-pressed={showPassword}
              className="absolute right-1 top-1 inline-flex size-10 cursor-pointer items-center justify-center rounded-full text-clear-ink-2 transition-colors hover:bg-clear-line hover:text-clear-ink"
            >
              {showPassword ? <IconEyeOff size={18} stroke={1.9} /> : <IconEye size={18} stroke={1.9} />}
            </button>
          </div>
        </ClearField>

        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 self-start text-sm font-semibold select-none">
          <input type="checkbox" name="remember" defaultChecked className="m-0 size-[18px] accent-clear-ink" />
          {t("signIn.remember")}
        </label>

        <ClearButton type="submit" size="lg" disabled={pending} className="mt-1 w-full">
          {pending ? t("signIn.submitting") : t("signIn.submit")}
        </ClearButton>
      </form>

      <div aria-hidden className="flex items-center gap-3 text-[13px] text-clear-muted">
        <span className="h-px flex-1 bg-clear-line" />
        {t("signIn.or")}
        <span className="h-px flex-1 bg-clear-line" />
      </div>

      <p className="m-0 text-center text-[15px] text-clear-ink-2">
        {t("signIn.newHere")}{" "}
        <Link href="/register" className="font-bold text-clear-ember-text no-underline hover:underline">
          {t("signIn.createAccount")}
        </Link>
      </p>

      <div className="flex justify-center">
        <LanguageSwitch />
      </div>
    </div>
  );
}

function MfaStep({
  email,
  code,
  setCode,
  useBackupCode,
  toggleBackupCode,
  error,
  pending,
  onBack,
  onSubmit,
}: {
  email: string;
  code: string;
  setCode: (value: string | ((prev: string) => string)) => void;
  useBackupCode: boolean;
  toggleBackupCode: () => void;
  error: string | null;
  pending: boolean;
  onBack: () => void;
  onSubmit: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations("auth.mfa");
  const isDesktop = useIsDesktop();
  // Phones get the on-screen keypad for the authenticator code (backup codes have
  // letters, so they keep the system keyboard).
  const showKeypad = !useBackupCode && !isDesktop;
  const complete = useBackupCode ? code.length > 0 : code.length === CODE_LENGTH;

  return (
    <div className="flex flex-1 flex-col gap-6 lg:flex-none">
      {/* Phone: a round back button in the header row. */}
      <button
        type="button"
        onClick={onBack}
        aria-label={t("back")}
        className="inline-flex size-12 shrink-0 cursor-pointer items-center justify-center self-start rounded-full bg-clear-card text-clear-ink lg:hidden"
      >
        <IconChevronLeft size={21} stroke={1.9} />
      </button>

      {/* Desktop: who is signing in, as a chip that goes back to the password step. */}
      <button
        type="button"
        onClick={onBack}
        aria-label={t("backFor", { email })}
        className="hidden min-h-10 max-w-full cursor-pointer items-center gap-2 self-start rounded-full bg-clear-tile py-1 pr-3.5 pl-1.5 text-[13px] font-bold text-clear-ink transition-colors hover:bg-clear-line lg:inline-flex"
      >
        <IconChevronLeft size={16} stroke={2.2} aria-hidden />
        <span aria-hidden className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-clear-peach text-xs font-extrabold text-clear-ink">
          {email.charAt(0).toUpperCase()}
        </span>
        <span className="truncate">{email}</span>
      </button>

      <div className="flex flex-col gap-3.5">
        <BrandMark size="lg" className="lg:hidden" />
        <IconTile tone="peach" size="lg" className="hidden text-clear-ember-text lg:inline-flex">
          <IconLock stroke={1.9} />
        </IconTile>
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[26px] leading-tight font-extrabold tracking-[-0.03em] lg:text-[28px] lg:tracking-[-0.02em]">
            {useBackupCode ? t("backupTitle") : t("title")}
          </h1>
          <p className="m-0 text-[15px] leading-normal text-clear-ink-2">{useBackupCode ? t("backupBody") : t("body")}</p>
        </div>
      </div>

      {error && <Notice tone="negative">{error}</Notice>}

      <form action={onSubmit} className="flex flex-col gap-4">
        {useBackupCode ? (
          <ClearField label={t("backupLabel")} htmlFor="mfa-backup">
            <ClearInput
              id="mfa-backup"
              type="text"
              name="code"
              required
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={9}
              placeholder={t("backupPlaceholder")}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className={cn(fieldSurface, "text-center text-lg font-bold tracking-[0.12em]")}
            />
          </ClearField>
        ) : (
          <CodeBoxes code={code} onChange={setCode} label={t("codeLabel")} inputMode={showKeypad ? "none" : "numeric"} />
        )}

        <ClearButton type="submit" size="lg" disabled={pending || !complete} className="mt-1 w-full">
          {pending ? t("verifying") : t("verify")}
        </ClearButton>
      </form>

      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={toggleBackupCode}
          className="min-h-11 cursor-pointer px-3 text-[15px] font-bold text-clear-ember-text hover:underline"
        >
          {useBackupCode ? t("useApp") : t("useBackup")}
        </button>
        {!useBackupCode && <span className="text-[13px] text-clear-muted">{t("refresh")}</span>}
      </div>

      {showKeypad && (
        <Keypad
          label={t("keypad")}
          backspaceLabel={t("backspace")}
          onDigit={(d) => setCode((c) => (c.length < CODE_LENGTH ? c + d : c))}
          onBackspace={() => setCode((c) => c.slice(0, -1))}
        />
      )}
    </div>
  );
}

/**
 * Six boxes showing the digits typed so far. One real input lies on top of them
 * (transparent) so typing, pasting and password-manager autofill all keep working.
 */
function CodeBoxes({
  code,
  onChange,
  label,
  inputMode,
}: {
  code: string;
  onChange: (value: string) => void;
  label: string;
  inputMode: "numeric" | "none";
}) {
  const [focused, setFocused] = useState(false);
  const activeIndex = Math.min(code.length, CODE_LENGTH - 1);

  return (
    <div className="relative grid grid-cols-6 gap-2">
      {Array.from({ length: CODE_LENGTH }).map((_, i) => {
        const digit = code[i] ?? "";
        const active = focused && i === activeIndex && code.length < CODE_LENGTH;
        return (
          <span
            key={i}
            aria-hidden
            className={cn(
              "relative flex h-[60px] items-center justify-center rounded-clear-row border-2 text-[26px] font-extrabold tabular-nums text-clear-ink transition-colors lg:h-[58px] lg:text-2xl",
              active ? "border-clear-ember bg-clear-card ring-4 ring-clear-ember/16" : cn("border-transparent", fieldSurface),
            )}
          >
            {digit}
            {active && !digit && <span className="absolute top-1/2 left-1/2 h-6 w-0.5 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-clear-ink" />}
          </span>
        );
      })}
      <input
        type="text"
        name="code"
        required
        autoFocus
        aria-label={label}
        inputMode={inputMode}
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={CODE_LENGTH}
        value={code}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 size-full cursor-text bg-transparent text-base text-transparent caret-transparent outline-none selection:bg-transparent"
      />
    </div>
  );
}

function Keypad({
  label,
  backspaceLabel,
  onDigit,
  onBackspace,
}: {
  label: string;
  backspaceLabel: string;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
}) {
  const key = "inline-flex h-[60px] cursor-pointer items-center justify-center rounded-clear-tile text-[26px] font-bold tabular-nums text-clear-ink transition-transform active:scale-[0.97]";
  return (
    <div role="group" aria-label={label} className="mt-auto grid grid-cols-3 gap-2">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <button key={d} type="button" onClick={() => onDigit(d)} className={cn(key, "bg-clear-card")}>
          {d}
        </button>
      ))}
      <span aria-hidden />
      <button type="button" onClick={() => onDigit("0")} className={cn(key, "bg-clear-card")}>
        0
      </button>
      <button type="button" onClick={onBackspace} aria-label={backspaceLabel} className={key}>
        <IconBackspace size={26} stroke={1.9} />
      </button>
    </div>
  );
}

function Notice({ tone, children }: { tone: "positive" | "negative"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "negative" ? "alert" : "status"}
      className={cn(
        "rounded-clear-tile px-4 py-3 text-sm font-semibold",
        tone === "negative" ? "bg-clear-negative-fill/12 text-clear-negative" : "bg-clear-mint text-clear-mint-ink",
      )}
    >
      {children}
    </div>
  );
}
