"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { IconMail, IconLock, IconEye, IconEyeOff } from "@tabler/icons-react";
import { Input } from "@/components/ui/input";
import { AuthPillButton } from "@/components/auth-pill-button";
import { loginAction, verifyMfaAction } from "@/app/actions/auth";

// The auth pages are always a dark gradient scene regardless of the user's light/dark
// theme preference, so these can't use the theme-aware foreground/muted-foreground
// tokens the rest of the app relies on — white-on-dark is hardcoded here on purpose.
const glassInputClass =
  "mt-0 mb-0 h-13 pl-11 rounded-full border-white/15 bg-white/10 text-white placeholder:text-white/40 backdrop-blur-md focus-visible:border-white/40 focus-visible:ring-white/20";

function IconInput({ icon: Icon, className, ...props }: React.ComponentProps<typeof Input> & { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="relative">
      <Icon className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-white/45 pointer-events-none" />
      <Input {...props} className={`${glassInputClass} ${className ?? ""}`} />
    </div>
  );
}

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <IconLock className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-white/45 pointer-events-none" />
      <Input {...props} type={show ? "text" : "password"} className={`${glassInputClass} pr-11`} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-white/45 hover:text-white/85 transition-colors"
      >
        {show ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
      </button>
    </div>
  );
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const justRegistered = searchParams.get("registered") === "1";

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Controlled so the email survives the form reset React performs after an action runs —
  // only the password should be cleared when login fails.
  const [email, setEmail] = useState("");

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

  if (mfaRequired) {
    return (
      <div>
        <h2 className="text-xl font-bold tracking-tight mb-1 text-white">Verification code</h2>
        <p className="text-sm text-white/55 mb-6">
          {useBackupCode
            ? "Enter one of your backup codes."
            : "Enter the 6-digit code from your authenticator app."}
        </p>

        {error && (
          <div className="mb-4 rounded-xl bg-red-400/15 text-red-200 text-sm px-3.5 py-2.5">
            {error}
          </div>
        )}

        <form action={handleVerify} className="space-y-3">
          <IconInput
            icon={IconLock}
            type="text"
            name="code"
            required
            autoFocus
            inputMode={useBackupCode ? "text" : "numeric"}
            pattern={useBackupCode ? undefined : "[0-9]*"}
            maxLength={useBackupCode ? 9 : 6}
            placeholder={useBackupCode ? "Backup code (XXXX-XXXX)" : "6-digit code"}
            value={code}
            onChange={(e) => setCode(useBackupCode ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, ""))}
          />

          <AuthPillButton type="submit" disabled={pending || !code} className="mt-3">
            {pending ? "Verifying…" : "Verify"}
          </AuthPillButton>
        </form>

        <button
          type="button"
          onClick={() => { setUseBackupCode((v) => !v); setCode(""); setError(null); }}
          className="w-full mt-4 text-sm text-white/50 hover:text-white transition-colors"
        >
          {useBackupCode ? "Use your authenticator app instead" : "Use a backup code instead"}
        </button>
        <button
          type="button"
          onClick={() => { setMfaRequired(false); setCode(""); setError(null); }}
          className="w-full mt-1 text-sm text-white/50 hover:text-white transition-colors"
        >
          Back to login
        </button>
      </div>
    );
  }

  return (
    <div>
      {justRegistered && (
        <div className="mb-4 rounded-xl bg-emerald-400/15 text-emerald-200 text-sm px-3.5 py-2.5">
          Account created. You can now log in.
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl bg-red-400/15 text-red-200 text-sm px-3.5 py-2.5">
          {error}
        </div>
      )}

      <form action={handleSubmit} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <IconInput
          icon={IconMail}
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <PasswordInput name="password" required autoComplete="current-password" placeholder="Password" />

        <label className="flex items-center gap-2 pt-1 pb-1 text-sm text-white/60 select-none">
          <input type="checkbox" name="remember" defaultChecked className="size-4 rounded border-white/25 bg-white/10" />
          Keep me signed in
        </label>

        <AuthPillButton type="submit" disabled={pending} className="mt-3">
          {pending ? "Logging in…" : "Log in"}
        </AuthPillButton>
      </form>

      <p className="text-sm text-white/50 text-center mt-6">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-semibold text-white hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
