"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconCrop, IconKey, IconLock, IconShieldCheck, IconShieldLock, IconUpload } from "@tabler/icons-react";
import { ClearButton } from "@/components/clear/button";
import { ClearChip } from "@/components/clear/chip";
import { ClearField, ClearInput } from "@/components/clear/field";
import { IconTile } from "@/components/clear/icon-tile";
import { SettingsNotice, SettingsSwitchRow } from "@/components/settings/settings-ui";
import { setAppLockEnabledAction, setPinAction, getAppLockStatus } from "@/app/actions/app-lock";
import {
  getMfaStatusAction,
  startTotpEnrollmentAction,
  confirmTotpEnrollmentAction,
  disableTotpAction,
  regenerateBackupCodesAction,
} from "@/app/actions/mfa";
import { AvatarCropDialog } from "./avatar-crop-dialog";
import type { User } from "@/db/schema";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function Loading() {
  const t = useTranslations("settings.security");
  return <p role="status" className="m-0 py-4 font-clear text-sm text-clear-muted">{t("loading")}</p>;
}

// ── Profile photo ────────────────────────────────────────────────────────────

/** The profile photo: the current one (or initials), a button to choose a new one and
 *  one to re-crop the current one. A chosen file is cropped before it is uploaded. */
export function AvatarFormContent({ user }: { user: User }) {
  const t = useTranslations("settings.avatar");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);

  // The image being cropped — either a fresh local file (blob: URL, revoked after use)
  // or the already-uploaded avatar (re-cropping an existing photo, no re-upload needed).
  const [cropSource, setCropSource] = useState<{ url: string; isBlob: boolean } | null>(null);

  async function upload(blob: Blob) {
    setUploading(true);
    setFailed(false);
    const formData = new FormData();
    formData.append("file", blob, "avatar.png");
    const res = await fetch("/api/profile/avatar", { method: "POST", body: formData }).catch(() => null);
    setUploading(false);
    if (!res?.ok) {
      setFailed(true);
      return;
    }
    const body = await res.json();
    setAvatarUrl(body.url);
    router.refresh();
  }

  function closeCropper() {
    if (cropSource?.isBlob) URL.revokeObjectURL(cropSource.url);
    setCropSource(null);
  }

  return (
    <div className="flex flex-col gap-3 font-clear text-clear-ink">
      <div className="flex flex-wrap items-center gap-4 rounded-clear-tile bg-clear-tile p-4">
        <span className="relative shrink-0">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="size-20 rounded-full object-cover" />
          ) : (
            <span aria-hidden className="inline-flex size-20 items-center justify-center rounded-full bg-clear-peach text-2xl font-extrabold text-clear-peach-ink">
              {initials(user.name)}
            </span>
          )}
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-clear-hero/60 text-xs font-bold text-clear-hero-ink">
              {t("uploading")}
            </span>
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[15px] font-bold">{user.name}</span>
            <span className="text-[13px] text-clear-muted">{t("hint")}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <ClearButton size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              <IconUpload aria-hidden stroke={2} />
              {avatarUrl ? t("change") : t("choose")}
            </ClearButton>
            {avatarUrl && (
              <ClearButton size="sm" variant="surface" disabled={uploading} onClick={() => setCropSource({ url: avatarUrl, isBlob: false })}>
                <IconCrop aria-hidden stroke={2} />
                {t("crop")}
              </ClearButton>
            )}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          aria-label={t("choose")}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setCropSource({ url: URL.createObjectURL(file), isBlob: true });
            e.target.value = "";
          }}
        />
      </div>

      {failed && <SettingsNotice>{t("uploadError")}</SettingsNotice>}

      <AvatarCropDialog
        imageUrl={cropSource?.url ?? null}
        open={cropSource !== null}
        onOpenChange={(open) => { if (!open) closeCropper(); }}
        onCropped={(blob) => {
          closeCropper();
          upload(blob);
        }}
      />
    </div>
  );
}

// ── App lock ─────────────────────────────────────────────────────────────────

/** App lock: the switch that asks for a PIN when the app opens, and setting or
 *  changing that PIN (typed twice). The switch stays off until a PIN exists. */
export function AppLockSectionContent() {
  const t = useTranslations("settings.appLock");
  const router = useRouter();
  const ids = useId();
  const [enabled, setEnabled] = useState(false);
  const [hasPinHash, setHasPinHash] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [toggleFailed, setToggleFailed] = useState(false);

  const [pinStep, setPinStep] = useState<"idle" | "enter" | "confirm">("idle");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSaving, setPinSaving] = useState(false);
  const [pinSaved, setPinSaved] = useState(false);

  useEffect(() => {
    getAppLockStatus().then((s) => {
      setEnabled(s.enabled);
      setHasPinHash(s.hasPinHash);
      setLoading(false);
    });
  }, []);

  async function toggleEnabled(next: boolean) {
    setToggling(true);
    setToggleFailed(false);
    const result = await setAppLockEnabledAction(next).catch(() => ({ error: "failed" }));
    setToggling(false);
    if (result && "error" in result && result.error) {
      setToggleFailed(true);
      return;
    }
    setEnabled(next);
    // AppLockGate reads `enabled` from the root layout's server render, which Next only
    // re-fetches on a hard navigation — without this, flipping the toggle looks like it
    // worked (the switch flips) but the lock never actually engages until the next reload.
    router.refresh();
  }

  function resetPin(step: "idle" | "enter") {
    setPinStep(step);
    setPinError(null);
    setPin("");
    setPinConfirm("");
  }

  async function savePin(finalPin: string) {
    setPinSaving(true);
    setPinError(null);
    const result = await setPinAction(finalPin).catch(() => ({ error: "failed" }));
    setPinSaving(false);
    if (result?.error) {
      setPinError(t("pinSaveError"));
      return;
    }
    setHasPinHash(true);
    setPinSaved(true);
    resetPin("idle");
  }

  function handlePinSubmit() {
    if (pinStep === "enter") {
      if (!/^\d{4,6}$/.test(pin)) { setPinError(t("pinInvalid")); return; }
      setPinError(null);
      setPinStep("confirm");
    } else if (pinStep === "confirm") {
      if (pin !== pinConfirm) { setPinError(t("pinMismatch")); setPinConfirm(""); return; }
      savePin(pin);
    }
  }

  if (loading) return <Loading />;

  const value = pinStep === "enter" ? pin : pinConfirm;

  return (
    <div className="flex flex-col gap-3 font-clear text-clear-ink">
      <SettingsSwitchRow
        icon={<IconLock stroke={1.9} />}
        label={t("toggleLabel")}
        hint={hasPinHash || enabled ? t("toggleHint") : t("needsPin")}
        checked={enabled}
        onCheckedChange={toggleEnabled}
        disabled={toggling || (!hasPinHash && !enabled)}
      />
      {toggleFailed && <SettingsNotice>{t("toggleError")}</SettingsNotice>}

      <div className="flex flex-col gap-4 rounded-clear-tile bg-clear-tile px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-3.5">
          <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-clear-icon bg-clear-card [&_svg]:size-5">
            <IconKey stroke={1.9} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-bold">{t("pinTitle")}</span>
            <span className="text-[13px] text-clear-muted">{hasPinHash ? t("pinSet") : t("pinHint")}</span>
          </span>
          {pinStep === "idle" && (
            <ClearButton size="sm" variant={hasPinHash ? "surface" : "primary"} onClick={() => { setPinSaved(false); resetPin("enter"); }}>
              {hasPinHash ? t("changePin") : t("setUpPin")}
            </ClearButton>
          )}
        </div>

        {pinStep !== "idle" && (
          <div className="flex flex-col gap-3">
            <ClearField
              label={pinStep === "enter" ? t("choosePin") : t("confirmPin")}
              htmlFor={`${ids}-pin`}
              error={pinError ?? undefined}
            >
              <ClearInput
                // A fresh field for the second entry, so the browser doesn't keep the first.
                key={pinStep}
                id={`${ids}-pin`}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoComplete="off"
                placeholder="••••"
                autoFocus
                className="bg-clear-card"
                value={value}
                aria-invalid={pinError ? true : undefined}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  if (pinStep === "enter") setPin(v);
                  else setPinConfirm(v);
                  setPinError(null);
                }}
                onKeyDown={(e) => { if (e.key === "Enter") handlePinSubmit(); }}
              />
            </ClearField>
            <div className="flex flex-wrap justify-end gap-2.5">
              <ClearButton variant="surface" onClick={() => resetPin("idle")}>{t("cancel")}</ClearButton>
              <ClearButton disabled={pinSaving || value.length < 4} onClick={handlePinSubmit}>
                {pinSaving ? t("saving") : pinStep === "enter" ? t("next") : t("savePin")}
              </ClearButton>
            </div>
          </div>
        )}
      </div>

      {pinSaved && <SettingsNotice tone="success">{t("pinSaved")}</SettingsNotice>}
    </div>
  );
}

// ── Two-factor sign-in ───────────────────────────────────────────────────────

/** Two-factor sign-in with an authenticator app: set up (scan, confirm a code, save
 *  the backup codes), make new backup codes, or turn it off — the last two ask for the
 *  current password. */
export function TwoFactorSectionContent() {
  const t = useTranslations("settings.twoFactor");
  const ids = useId();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<"idle" | "qr" | "backupCodes" | "disable" | "regenerate">("idle");
  const [enrollment, setEnrollment] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  useEffect(() => {
    getMfaStatusAction().then((s) => {
      setEnabled(s.enabled);
      setLoading(false);
    });
  }, []);

  async function startSetup() {
    setPending(true);
    setError(null);
    const result = await startTotpEnrollmentAction().catch(() => ({ error: "failed" }));
    setPending(false);
    if ("error" in result) { setError(t("setupError")); return; }
    setEnrollment(result);
    setCode("");
    setStep("qr");
  }

  async function confirmSetup() {
    if (code.length !== 6) return;
    setPending(true);
    setError(null);
    const result = await confirmTotpEnrollmentAction(code).catch(() => ({ error: "failed", backupCodes: undefined }));
    setPending(false);
    if (result.error) { setError(t("codeInvalid")); return; }
    setEnabled(true);
    setBackupCodes(result.backupCodes ?? []);
    setStep("backupCodes");
  }

  function finishBackupCodes() {
    setStep("idle");
    setBackupCodes(null);
    setEnrollment(null);
    setCode("");
  }

  async function submitPassword() {
    if (!password) return;
    setPending(true);
    setError(null);
    if (step === "disable") {
      const result = await disableTotpAction(password).catch(() => ({ error: "failed" }));
      setPending(false);
      if (result.error) { setError(t("passwordInvalid")); return; }
      setEnabled(false);
      setPassword("");
      setStep("idle");
    } else {
      const result = await regenerateBackupCodesAction(password).catch(() => ({ error: "failed", backupCodes: undefined }));
      setPending(false);
      if (result.error) { setError(t("passwordInvalid")); return; }
      setPassword("");
      setBackupCodes(result.backupCodes ?? []);
      setStep("backupCodes");
    }
  }

  function cancel() {
    setStep("idle");
    setEnrollment(null);
    setPassword("");
    setCode("");
    setError(null);
  }

  if (loading) return <Loading />;

  if (step === "qr") {
    return (
      <div className="flex flex-col gap-4 font-clear text-clear-ink">
        <p className="m-0 text-sm text-clear-ink-2">{t("scan")}</p>
        {enrollment && (
          // QR codes need a white quiet zone to scan, in either theme.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={enrollment.qrDataUrl} alt={t("qrAlt")} className="size-44 self-center rounded-clear-tile bg-white p-2.5" />
        )}
        <div className="flex flex-col gap-1 rounded-clear-tile bg-clear-tile px-4 py-3">
          <span className="text-[13px] font-bold text-clear-ink-2">{t("manualEntry")}</span>
          <span className="font-mono text-sm break-all">{enrollment?.secret}</span>
        </div>
        <ClearField label={t("codeLabel")} htmlFor={`${ids}-code`} error={error ?? undefined}>
          <ClearInput
            id={`${ids}-code`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="123456"
            autoFocus
            value={code}
            aria-invalid={error ? true : undefined}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") confirmSetup(); }}
          />
        </ClearField>
        <div className="flex flex-wrap justify-end gap-2.5">
          <ClearButton variant="secondary" onClick={cancel}>{t("cancel")}</ClearButton>
          <ClearButton disabled={pending || code.length !== 6} onClick={confirmSetup}>
            {pending ? t("confirming") : t("confirm")}
          </ClearButton>
        </div>
      </div>
    );
  }

  if (step === "backupCodes") {
    return (
      <div className="flex flex-col gap-4 font-clear text-clear-ink">
        <SettingsNotice tone="warning">{t("backupIntro")}</SettingsNotice>
        <ul aria-label={t("backupLabel")} className="m-0 grid list-none grid-cols-2 gap-2 rounded-clear-tile bg-clear-tile p-4 font-mono text-sm">
          {backupCodes?.map((c) => <li key={c}>{c}</li>)}
        </ul>
        <ClearButton className="self-start" onClick={finishBackupCodes}>{t("backupDone")}</ClearButton>
      </div>
    );
  }

  if (step === "disable" || step === "regenerate") {
    return (
      <div className="flex flex-col gap-4 font-clear text-clear-ink">
        <p className="m-0 text-sm text-clear-ink-2">{step === "disable" ? t("disableIntro") : t("regenerateIntro")}</p>
        <ClearField label={t("passwordLabel")} htmlFor={`${ids}-password`} error={error ?? undefined}>
          <ClearInput
            id={`${ids}-password`}
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            aria-invalid={error ? true : undefined}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") submitPassword(); }}
          />
        </ClearField>
        <div className="flex flex-wrap justify-end gap-2.5">
          <ClearButton variant="secondary" onClick={cancel}>{t("cancel")}</ClearButton>
          <ClearButton
            disabled={pending || !password}
            onClick={submitPassword}
            className={step === "disable" ? "bg-clear-negative text-clear-card" : undefined}
          >
            {pending ? t("working") : step === "disable" ? t("turnOff") : t("makeNewCodes")}
          </ClearButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 font-clear text-clear-ink">
      <div className="flex flex-wrap items-center gap-3.5 rounded-clear-tile bg-clear-tile px-4 py-3.5">
        <IconTile tone={enabled ? "mint" : "neutral"} size="md" className={enabled ? undefined : "bg-clear-card"}>
          {enabled ? <IconShieldCheck stroke={1.9} /> : <IconShieldLock stroke={1.9} />}
        </IconTile>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-bold">{t("title")}</span>
            <ClearChip tone={enabled ? "mint" : "stone"}>{enabled ? t("on") : t("off")}</ClearChip>
          </span>
          <span className="text-[13px] text-clear-muted">{enabled ? t("onHint") : t("offHint")}</span>
        </span>
      </div>
      {error && <SettingsNotice>{error}</SettingsNotice>}
      {enabled ? (
        <div className="flex flex-wrap gap-2.5">
          <ClearButton variant="secondary" onClick={() => { setStep("regenerate"); setError(null); }}>{t("newBackupCodes")}</ClearButton>
          <ClearButton variant="danger" onClick={() => { setStep("disable"); setError(null); }}>{t("turnOff")}</ClearButton>
        </div>
      ) : (
        <ClearButton className="self-start" disabled={pending} onClick={startSetup}>
          {pending ? t("working") : t("setUp")}
        </ClearButton>
      )}
    </div>
  );
}
