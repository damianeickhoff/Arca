"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  IconUpload as Upload,
  IconCrop as Crop,
  IconCamera as Camera,
  IconLock as Lock,
  IconLockOpen as LockOpen,
  IconFingerprint as Fingerprint,
  IconCheck as Check,
  IconShieldCheck as ShieldCheck,
} from "@tabler/icons-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { updateOwnProfileAction, updateOwnEmailAction, updateOwnPasswordAction, updateSidebarSubtitleAction } from "@/app/actions/auth";
import {
  setAppLockEnabledAction,
  setPinAction,
  getAppLockStatus,
  getWebAuthnChallengeAction,
  registerWebAuthnCredentialAction,
  removeWebAuthnCredentialAction,
} from "@/app/actions/app-lock";
import {
  getMfaStatusAction,
  startTotpEnrollmentAction,
  confirmTotpEnrollmentAction,
  disableTotpAction,
  regenerateBackupCodesAction,
} from "@/app/actions/mfa";
import { AvatarCropDialog } from "./avatar-crop-dialog";
import { BudgetStrategyCard } from "./budget-strategy-card";
import type { BudgetStrategy } from "@/components/budget-strategy-sliders";
import type { User } from "@/db/schema";

function b64urlToBuffer(b64url: string): ArrayBuffer {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const str = atob(b64);
  const buf = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i);
  return buf.buffer;
}

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str);
}

export function ProfileSettingsClient({
  user,
  sidebarSubtitle,
  budgetStrategy,
}: {
  user: User;
  sidebarSubtitle: string;
  budgetStrategy: BudgetStrategy;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <AvatarForm user={user} />
      <NameForm user={user} />
      <EmailForm user={user} />
      <PasswordForm />
      <SidebarSubtitleForm initial={sidebarSubtitle} />
      <BudgetStrategyCard initial={budgetStrategy} />
      <AppLockSection />
      <TwoFactorSection />
    </div>
  );
}

export function AvatarFormContent({ user }: { user: User }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);

  // The image being cropped — either a fresh local file (blob: URL, revoked after use)
  // or the already-uploaded avatar (re-cropping an existing photo, no re-upload needed).
  const [cropSource, setCropSource] = useState<{ url: string; isBlob: boolean } | null>(null);

  async function upload(blob: Blob) {
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", blob, "avatar.png");
    const res = await fetch("/api/profile/avatar", { method: "POST", body: formData });
    setUploading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Upload failed.");
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
    <>
      {error && <div className="mb-3 rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setActionsOpen(true)}
          disabled={uploading}
          aria-label="Change profile photo"
          className="relative shrink-0 rounded-full active:scale-[0.97] transition-transform disabled:pointer-events-none"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={user.name} className="size-[140px] rounded-full object-cover" />
          ) : (
            <div className="size-[140px] rounded-full bg-foreground/10 text-foreground flex items-center justify-center text-3xl font-semibold">
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="absolute bottom-1 right-1 flex items-center justify-center size-9 rounded-full bg-foreground text-background border-2 border-background">
            <Camera className="size-4" />
          </span>
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white text-xs font-medium">
              Uploading…
            </span>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setCropSource({ url: URL.createObjectURL(file), isBlob: true });
            e.target.value = "";
          }}
        />
      </div>

      <Dialog open={actionsOpen} onOpenChange={setActionsOpen}>
        <DialogContent className="sm:max-w-xs" title="Profile photo">
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full justify-start"
              onClick={() => {
                setActionsOpen(false);
                fileInputRef.current?.click();
              }}
            >
              <Upload className="size-4" />
              Choose new photo
            </Button>
            {avatarUrl && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full justify-start"
                onClick={() => {
                  setActionsOpen(false);
                  setCropSource({ url: avatarUrl, isBlob: false });
                }}
              >
                <Crop className="size-4" />
                Crop current photo
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AvatarCropDialog
        imageUrl={cropSource?.url ?? null}
        open={cropSource !== null}
        onOpenChange={(open) => { if (!open) closeCropper(); }}
        onCropped={(blob) => {
          closeCropper();
          upload(blob);
        }}
      />
    </>
  );
}

function AvatarForm({ user }: { user: User }) {
  return (
    <div className="rounded-2xl bg-card p-5">
      <h2 className="font-semibold text-base">Profile photo</h2>
      <p className="text-xs text-muted-foreground mb-4">Shown in the sidebar.</p>
      <AvatarFormContent user={user} />
    </div>
  );
}

function NameForm({ user }: { user: User }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    setPending(true);
    const result = await updateOwnProfileAction(formData);
    setPending(false);
    if (result?.error) setError(result.error);
    else setSuccess(true);
  }

  return (
    <div className="rounded-2xl bg-card p-5">
      <h2 className="font-semibold text-base">Profile</h2>
      <p className="text-xs text-muted-foreground mb-4">Change your name.</p>

      {error && <div className="mb-3 rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>}
      {success && <div className="mb-3 rounded-lg bg-green-500/10 text-green-600 dark:text-green-400 text-sm px-3 py-2">Name updated.</div>}

      <form action={handleSubmit}>
        <label className="text-sm font-medium text-foreground/80">Name</label>
        <Input type="text" name="name" defaultValue={user.name} required />
        <Button type="submit" disabled={pending} size="lg" variant="default" className="mt-3">
          {pending ? "Saving..." : "Save"}
        </Button>
      </form>
    </div>
  );
}

function EmailForm({ user }: { user: User }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    setPending(true);
    const result = await updateOwnEmailAction(formData);
    setPending(false);
    if (result?.error) setError(result.error);
    else {
      setSuccess(true);
      (document.getElementById("email-form") as HTMLFormElement | null)?.reset();
    }
  }

  return (
    <div className="rounded-2xl bg-card p-5">
      <h2 className="font-semibold text-base">Login email</h2>
      <p className="text-xs text-muted-foreground mb-4">Change the email address you sign in with.</p>

      {error && <div className="mb-3 rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>}
      {success && <div className="mb-3 rounded-lg bg-green-500/10 text-green-600 dark:text-green-400 text-sm px-3 py-2">Email updated.</div>}

      <form id="email-form" action={handleSubmit}>
        <label className="text-sm font-medium text-foreground/80">Email</label>
        <Input type="email" name="email" defaultValue={user.email} required autoComplete="email" />

        <label className="text-sm font-medium text-foreground/80">Current password</label>
        <Input type="password" name="currentPassword" required autoComplete="current-password" />

        <Button type="submit" disabled={pending} size="lg" variant="default" className="mt-1">
          {pending ? "Saving..." : "Save"}
        </Button>
      </form>
    </div>
  );
}

function SidebarSubtitleForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    setPending(true);
    const result = await updateSidebarSubtitleAction(formData);
    setPending(false);
    if (result?.error) setError(result.error);
    else {
      setSuccess(true);
      router.refresh();
    }
  }

  return (
    <div className="rounded-2xl bg-card p-5">
      <h2 className="font-semibold text-base">Sidebar</h2>
      <p className="text-xs text-muted-foreground mb-4">Text shown below &quot;Arca&quot; in the sidebar.</p>

      {error && <div className="mb-3 rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>}
      {success && <div className="mb-3 rounded-lg bg-green-500/10 text-green-600 dark:text-green-400 text-sm px-3 py-2">Updated.</div>}

      <form action={handleSubmit}>
        <label className="text-sm font-medium text-foreground/80">Subtitle</label>
        <Input type="text" name="subtitle" defaultValue={initial} maxLength={40} required />
        <Button type="submit" disabled={pending} size="lg" variant="default" className="mt-3">
          {pending ? "Saving..." : "Save"}
        </Button>
      </form>
    </div>
  );
}

export function AppLockSectionContent() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [hasPinHash, setHasPinHash] = useState(false);
  const [hasWebAuthn, setHasWebAuthn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  // PIN setup state
  const [pinStep, setPinStep] = useState<"idle" | "enter" | "confirm">("idle");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSaving, setPinSaving] = useState(false);

  // WebAuthn state
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [biometricSupported, setBiometricSupported] = useState(false);
  // Why biometrics can't be offered, so we can explain instead of silently hiding the option.
  // "secure" = not an HTTPS/secure context (e.g. reached over http://<lan-ip> on the phone);
  // "device" = secure but no platform authenticator (Face ID / fingerprint) available.
  const [biometricReason, setBiometricReason] = useState<"secure" | "device" | null>(null);

  useEffect(() => {
    getAppLockStatus().then((s) => {
      setEnabled(s.enabled);
      setHasPinHash(s.hasPinHash);
      setHasWebAuthn(s.hasWebAuthn);
      setLoading(false);
    });
    // Check platform authenticator availability. WebAuthn only exists in a secure
    // context (HTTPS or localhost) — over http://<lan-ip> on a phone the whole API is
    // absent, which is the usual reason "Face ID" seems missing on mobile.
    if (!window.isSecureContext) {
      setBiometricReason("secure");
    } else if (window.PublicKeyCredential) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then((ok) => { setBiometricSupported(ok); if (!ok) setBiometricReason("device"); })
        .catch(() => setBiometricReason("device"));
    } else {
      setBiometricReason("device");
    }
  }, []);

  async function toggleEnabled() {
    setToggling(true);
    const next = !enabled;
    await setAppLockEnabledAction(next);
    setEnabled(next);
    setToggling(false);
    // AppLockGate reads `enabled` from the root layout's server render, which Next only
    // re-fetches on a hard navigation — without this, flipping the toggle looks like it
    // worked (the switch flips) but the lock never actually engages until the next reload.
    router.refresh();
  }

  async function savePin(finalPin: string) {
    setPinSaving(true);
    setPinError(null);
    const result = await setPinAction(finalPin);
    setPinSaving(false);
    if (result.error) {
      setPinError(result.error);
    } else {
      setHasPinHash(true);
      setPinStep("idle");
      setPin("");
      setPinConfirm("");
    }
  }

  function handlePinSubmit() {
    if (pinStep === "enter") {
      if (!/^\d{4,6}$/.test(pin)) { setPinError("Passcode must be 4–6 digits."); return; }
      setPinError(null);
      setPinStep("confirm");
    } else if (pinStep === "confirm") {
      if (pin !== pinConfirm) { setPinError("Passcodes do not match."); setPinConfirm(""); return; }
      savePin(pin);
    }
  }

  async function registerBiometric() {
    setBiometricLoading(true);
    setBiometricError(null);
    try {
      const { challenge } = await getWebAuthnChallengeAction();
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: b64urlToBuffer(challenge),
          rp: { name: "Arca", id: window.location.hostname },
          user: {
            id: new Uint8Array(16).fill(1),
            name: "arca-user",
            displayName: "Arca user",
          },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            residentKey: "preferred",
          },
          timeout: 60000,
          attestation: "none",
        },
      }) as PublicKeyCredential | null;

      if (!credential) throw new Error("Registration cancelled.");
      const response = credential.response as AuthenticatorAttestationResponse;

      const publicKeyBuffer = response.getPublicKey();
      if (!publicKeyBuffer) throw new Error("No public key received.");

      const result = await registerWebAuthnCredentialAction(
        credential.id,
        bufToB64(publicKeyBuffer),
      );

      if (result.error) throw new Error(result.error);
      setHasWebAuthn(true);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Registration failed.";
      if (!msg.toLowerCase().includes("cancel") && !msg.includes("NotAllowed")) {
        setBiometricError(msg);
      }
    } finally {
      setBiometricLoading(false);
    }
  }

  async function removeBiometric() {
    setBiometricLoading(true);
    await removeWebAuthnCredentialAction();
    setHasWebAuthn(false);
    setBiometricLoading(false);
    router.refresh();
  }

  if (loading) {
    return <p className="text-xs text-muted-foreground mt-1">Loading...</p>;
  }

  return (
    <div className="space-y-4">
      {/* Enable toggle */}
      <div className="flex items-center justify-between gap-4 py-1">
        <div className="flex items-center gap-2">
          {enabled ? <Lock className="size-4 text-foreground/60" /> : <LockOpen className="size-4 text-foreground/40" />}
          <span className="text-sm font-medium">App lock</span>
        </div>
        <button
          onClick={toggleEnabled}
          disabled={toggling || (!hasPinHash && !enabled)}
          title={!hasPinHash && !enabled ? "Set up a passcode first" : undefined}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
            enabled ? "bg-primary" : "bg-foreground/20"
          }`}
        >
          <span className={`inline-block size-4 transform rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>
      {!hasPinHash && !enabled && (
        <p className="text-xs text-muted-foreground -mt-3">Set up a passcode below before enabling app lock.</p>
      )}

      {/* PIN setup */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Passcode</span>
          {hasPinHash && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <Check className="size-3.5" />
              Ingesteld
            </span>
          )}
        </div>

        {pinStep === "idle" ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => { setPinStep("enter"); setPinError(null); setPin(""); setPinConfirm(""); }}
          >
            {hasPinHash ? "Change passcode" : "Set up passcode"}
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {pinStep === "enter" ? "Choose a passcode (4–6 digits):" : "Confirm your passcode:"}
            </p>
            <Input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="••••"
              autoFocus
              value={pinStep === "enter" ? pin : pinConfirm}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                if (pinStep === "enter") setPin(v);
                else setPinConfirm(v);
                setPinError(null);
              }}
              onKeyDown={(e) => { if (e.key === "Enter") handlePinSubmit(); }}
            />
            {pinError && <p className="text-xs text-destructive">{pinError}</p>}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => { setPinStep("idle"); setPinError(null); setPin(""); setPinConfirm(""); }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={pinSaving || (pinStep === "enter" ? pin.length < 4 : pinConfirm.length < 4)}
                onClick={handlePinSubmit}
              >
                {pinSaving ? "Saving..." : pinStep === "enter" ? "Volgende" : "Save"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Biometric */}
      <div className="space-y-2 border-t border-foreground/5 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Fingerprint className="size-4 text-foreground/60" />
            <span className="text-sm font-medium">Face ID / vingerafdruk</span>
          </div>
          {biometricSupported && hasWebAuthn && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <Check className="size-3.5" />
              Ingesteld
            </span>
          )}
        </div>

        {biometricSupported ? (
          <>
            {biometricError && <p className="text-xs text-destructive">{biometricError}</p>}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="flex-1"
                disabled={biometricLoading}
                onClick={registerBiometric}
              >
                <Fingerprint className="size-4" />
                {hasWebAuthn ? "Reset" : "Set up Face ID / fingerprint"}
              </Button>
              {hasWebAuthn && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={biometricLoading}
                  onClick={removeBiometric}
                  className="text-destructive hover:text-destructive"
                >
                  Delete
                </Button>
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {biometricReason === "secure"
              ? "Face ID / fingerprint only works over a secure (HTTPS) connection or in the installed app — not over a plain HTTP connection."
              : "This device or browser doesn't support Face ID / fingerprint."}
          </p>
        )}
      </div>
    </div>
  );
}

function AppLockSection() {
  return (
    <div className="rounded-2xl bg-card p-5">
      <h2 className="font-semibold text-base">App lock</h2>
      <p className="text-xs text-muted-foreground mb-4">Protect the app with a passcode.</p>
      <AppLockSectionContent />
    </div>
  );
}

function PasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    setPending(true);
    const result = await updateOwnPasswordAction(formData);
    setPending(false);
    if (result?.error) setError(result.error);
    else {
      setSuccess(true);
      (document.getElementById("password-form") as HTMLFormElement | null)?.reset();
    }
  }

  return (
    <div className="rounded-2xl bg-card p-5">
      <h2 className="font-semibold text-base">Password</h2>
      <p className="text-xs text-muted-foreground mb-4">Change your password.</p>

      {error && <div className="mb-3 rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>}
      {success && <div className="mb-3 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm px-3 py-2">Password updated.</div>}

      <form id="password-form" action={handleSubmit}>
        <label className="text-sm font-medium text-foreground/80">Current password</label>
        <Input type="password" name="currentPassword" required autoComplete="current-password" />

        <label className="text-sm font-medium text-foreground/80">New password</label>
        <Input type="password" name="newPassword" required autoComplete="new-password" placeholder="At least 8 characters" />

        <Button type="submit" disabled={pending} size="lg" className="mt-1">
          {pending ? "Saving..." : "Save"}
        </Button>
      </form>
    </div>
  );
}

export function TwoFactorSectionContent() {
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
    const result = await startTotpEnrollmentAction();
    setPending(false);
    if ("error" in result) { setError(result.error); return; }
    setEnrollment(result);
    setCode("");
    setStep("qr");
  }

  async function confirmSetup() {
    setPending(true);
    setError(null);
    const result = await confirmTotpEnrollmentAction(code);
    setPending(false);
    if (result.error) { setError(result.error); return; }
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

  async function submitDisable() {
    setPending(true);
    setError(null);
    const result = await disableTotpAction(password);
    setPending(false);
    if (result.error) { setError(result.error); return; }
    setEnabled(false);
    setPassword("");
    setStep("idle");
  }

  async function submitRegenerate() {
    setPending(true);
    setError(null);
    const result = await regenerateBackupCodesAction(password);
    setPending(false);
    if (result.error) { setError(result.error); return; }
    setPassword("");
    setBackupCodes(result.backupCodes ?? []);
    setStep("backupCodes");
  }

  if (loading) {
    return <p className="text-xs text-muted-foreground mt-1">Loading...</p>;
  }

  if (step === "qr") {
    return (
      <div className="space-y-3">
        {error && <p className="text-xs text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">Scan deze QR-code met Google Authenticator (of een andere TOTP-app):</p>
        {enrollment && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={enrollment.qrDataUrl} alt="QR code" className="mx-auto size-40 rounded-lg bg-white p-2" />
        )}
        <p className="text-xs text-muted-foreground break-all">
          Of voer handmatig in: <span className="font-mono">{enrollment?.secret}</span>
        </p>
        <label className="text-sm font-medium text-foreground/80">Bevestig met een 6-cijferige code</label>
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="123456"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => { if (e.key === "Enter") confirmSetup(); }}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => { setStep("idle"); setEnrollment(null); setError(null); }}
          >
            Cancel
          </Button>
          <Button type="button" className="flex-1" disabled={pending || code.length !== 6} onClick={confirmSetup}>
            {pending ? "Bevestigen..." : "Bevestigen"}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "backupCodes") {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Bewaar deze back-upcodes op een veilige plek. Elke code werkt één keer als je geen toegang hebt tot je authenticator-app.
        </p>
        <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-foreground/5 p-3 font-mono text-sm">
          {backupCodes?.map((c) => <span key={c}>{c}</span>)}
        </div>
        <Button type="button" className="w-full" onClick={finishBackupCodes}>
          Ik heb deze opgeslagen
        </Button>
      </div>
    );
  }

  if (step === "disable" || step === "regenerate") {
    const submit = step === "disable" ? submitDisable : submitRegenerate;
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Bevestig met je huidige wachtwoord.</p>
        <Input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => { setStep("idle"); setPassword(""); setError(null); }}
          >
            Cancel
          </Button>
          <Button type="button" className="flex-1" disabled={pending || !password} onClick={submit}>
            {pending ? "Bezig..." : "Bevestigen"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-destructive">{error}</p>}
      {enabled ? (
        <div className="flex gap-2 ">
          <Button
            type="button"
            variant="outline"
            className="flex-1 bg-white/7"
            onClick={() => { setStep("regenerate"); setError(null); }}
          >
            <p className="text-white/90">Nieuwe back-upcodes</p>
          </Button>
          <Button
            type="button"
            variant="default"
            className="flex-1 bg-red-600/7"
            onClick={() => { setStep("disable"); setError(null); }}
          >
            <p className="text-red-500 tracking-wide">Uitschakelen</p>
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="lg" className="w-full" disabled={pending} onClick={startSetup}>
          Setup
        </Button>
      )}
    </div>
  );
}

function TwoFactorSection() {
  return (
    <div className="rounded-2xl bg-card p-5">
      <h2 className="font-semibold text-base">Two-factor authentication</h2>
      <p className="text-xs text-muted-foreground mb-4">Extra beveiliging met een authenticator-app zoals Google Authenticator.</p>
      <TwoFactorSectionContent />
    </div>
  );
}
