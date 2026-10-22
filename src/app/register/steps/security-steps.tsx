"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconDownload, IconShieldCheck } from "@tabler/icons-react";
import { ClearButton } from "@/components/clear/button";
import { IconTile } from "@/components/clear/icon-tile";
import { startTotpEnrollmentAction, confirmTotpEnrollmentAction } from "@/app/actions/mfa";
import { CodeBoxes, StepFooter, StepHeading, StepNotice } from "../onboarding-ui";

/** Groups a base32 secret in fours ("JBSW Y3DP …") so it can be typed over. */
function groupKey(secret: string) {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ── 4 · Two-factor sign-in (Onboard-04) ───────────────────────────────────────

/**
 * Starts the authenticator enrollment as soon as the step opens (the secret is stored
 * but stays inactive until a code is confirmed), so the QR code is there right away.
 * Once 2FA is on, the step only says so — re-enrolling would invalidate the app.
 */
export function TwoFactorStep({
  enabled,
  onEnabled,
  onBack,
  onSkip,
  onNext,
}: {
  enabled: boolean;
  onEnabled: (backupCodes: string[]) => void;
  onBack?: () => void;
  onSkip: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("onboarding.mfa");
  const tApp = useTranslations("onboarding");
  const [enrollment, setEnrollment] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [startFailed, setStartFailed] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  async function start() {
    setStartFailed(false);
    const result = await startTotpEnrollmentAction();
    if ("error" in result) {
      setStartFailed(true);
      return;
    }
    setEnrollment({ secret: result.secret, qrDataUrl: result.qrDataUrl });
  }

  useEffect(() => {
    if (enabled || started.current) return;
    started.current = true;
    void start();
  }, [enabled]);

  async function verify() {
    if (code.length !== 6 || pending) return;
    setPending(true);
    setError(null);
    const result = await confirmTotpEnrollmentAction(code);
    setPending(false);
    if (result.error) {
      setError(t("wrongCode"));
      setCode("");
      return;
    }
    onEnabled(result.backupCodes ?? []);
  }

  if (enabled) {
    return (
      <>
        <StepHeading title={t("enabledTitle")} subtitle={t("enabledBody")} />
        <div className="flex items-center gap-3.5 rounded-clear-tile bg-clear-mint px-4 py-3.5 text-clear-mint-ink">
          <IconTile tone="mint" className="bg-clear-card">
            <IconShieldCheck stroke={1.9} />
          </IconTile>
          <span className="text-[15px] font-bold">{t("enabledChip")}</span>
        </div>
        <StepFooter onBack={onBack} primaryLabel={tApp("continue")} onPrimary={onNext} />
      </>
    );
  }

  return (
    <>
      <StepHeading title={t("title")} subtitle={t("subtitle")} />

      {startFailed ? (
        <div className="flex flex-col items-start gap-3">
          <StepNotice>{t("startFailed")}</StepNotice>
          <ClearButton variant="secondary" onClick={() => void start()}>
            {t("retry")}
          </ClearButton>
        </div>
      ) : (
        <div className="flex flex-col gap-[22px] sm:flex-row sm:items-start">
          <div className="mx-auto size-44 shrink-0 rounded-clear-tile border border-clear-line bg-clear-card p-2 sm:mx-0">
            {enrollment ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data: URL from the server action
              <img src={enrollment.qrDataUrl} alt={t("qrAlt")} className="block size-full rounded-[8px]" />
            ) : (
              <span role="status" aria-label={t("loading")} className="block size-full animate-pulse rounded-[8px] bg-clear-tile" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3.5">
            <h2 className="m-0 text-base font-extrabold tracking-[-0.01em]">{t("scanTitle")}</h2>
            <ol className="m-0 flex list-none flex-col gap-[9px] p-0">
              {(["step1", "step2", "step3"] as const).map((k, i) => (
                <li key={k} className="flex items-center gap-2.5 text-sm font-medium text-clear-ink-2">
                  <span aria-hidden className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-clear-ground text-xs font-extrabold text-clear-ink">
                    {i + 1}
                  </span>
                  {t(k)}
                </li>
              ))}
            </ol>
            <div className="flex items-center gap-2.5 rounded-clear-tile bg-clear-tile py-3 pr-3 pl-3.5">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span id="ob-totp-key" className="text-xs font-bold text-clear-muted">{t("keyLabel")}</span>
                <span aria-labelledby="ob-totp-key" className="truncate text-[15px] font-extrabold tracking-[0.04em] tabular-nums">
                  {enrollment ? groupKey(enrollment.secret) : "…"}
                </span>
              </span>
              <ClearButton
                variant="surface"
                size="sm"
                aria-label={t("copyKey")}
                disabled={!enrollment}
                onClick={async () => {
                  if (enrollment && (await copyText(enrollment.secret))) {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  }
                }}
              >
                <span aria-live="polite">{copied ? t("copied") : t("copy")}</span>
              </ClearButton>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span id="ob-code-label" className="text-[13px] font-bold text-clear-ink-2">{t("codeLabel")}</span>
        <CodeBoxes value={code} onChange={setCode} length={6} label={t("codeLabel")} onEnter={verify} />
        {error && <span role="alert" className="text-[13px] font-semibold text-clear-negative">{error}</span>}
      </div>

      <StepFooter
        onBack={onBack}
        onSkip={onSkip}
        primaryLabel={pending ? t("verifying") : t("verify")}
        onPrimary={verify}
        primaryDisabled={!enrollment || code.length !== 6 || pending}
      />
    </>
  );
}

// ── 5 · Backup codes (Onboard-05) ─────────────────────────────────────────────

export function BackupCodesStep({
  codes,
  email,
  onBack,
  onNext,
}: {
  codes: string[];
  email: string;
  onBack?: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("onboarding.backupCodes");
  const tApp = useTranslations("onboarding");
  const locale = useLocale();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const today = new Date().toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

  function asText() {
    return [t("fileHeading", { app: tApp("appName"), email }), t("fileNote"), "", ...codes.map((c, i) => `${i + 1}. ${c}`)].join("\n");
  }

  function download() {
    const url = URL.createObjectURL(new Blob([asText()], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = t("fileName");
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <StepHeading title={t("title")} subtitle={t("subtitle")} />

      <section aria-labelledby="ob-codes-title" className="flex flex-col gap-[18px] rounded-clear-tile bg-clear-tile p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 id="ob-codes-title" className="m-0 text-[15px] font-extrabold">{t("count", { count: codes.length })}</h2>
          <span className="text-xs font-semibold text-clear-muted">{t("meta", { email, date: today })}</span>
        </div>
        <ol className="m-0 grid list-none grid-cols-1 gap-x-3 gap-y-2 p-0 min-[420px]:grid-cols-2">
          {codes.map((c, i) => (
            <li key={c} className="flex h-11 items-center gap-3 rounded-clear-icon bg-clear-card px-3.5">
              <span className="w-[18px] text-right text-xs font-bold text-clear-muted tabular-nums">{i + 1}</span>
              <span className="text-base font-bold tracking-[0.06em] tabular-nums">{c}</span>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2.5">
          <ClearButton variant="surface" onClick={download}>
            <IconDownload stroke={1.9} aria-hidden />
            {t("download")}
          </ClearButton>
          <ClearButton
            variant="surface"
            onClick={async () => {
              if (await copyText(codes.join("\n"))) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }
            }}
          >
            <span aria-live="polite">{copied ? t("copied") : t("copyAll")}</span>
          </ClearButton>
        </div>
      </section>

      <label className="inline-flex cursor-pointer items-center gap-3 text-[15px] font-bold">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="size-5 cursor-pointer accent-clear-ink" />
        {t("confirm")}
      </label>

      <StepFooter onBack={onBack} primaryLabel={tApp("continue")} onPrimary={onNext} primaryDisabled={!saved} />
    </>
  );
}
