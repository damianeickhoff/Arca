"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  IconUpload as Upload,
  IconCrop as Crop,
  IconCamera as Camera,
} from "@tabler/icons-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
      {error && <div className="mb-3 rounded-tile bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>}

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
            <div className="size-[140px] rounded-full bg-foreground/10 text-ink flex items-center justify-center text-3xl font-semibold">
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
        <DialogContent title="Profile photo">
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
    return <p className="text-xs text-ink-3 mt-1">Loading...</p>;
  }

  return (
    <div className="space-y-4">
      {/* Enable toggle */}
      <div className="h-16 rounded-row px-4 flex items-center bg-[var(--dialog-content-background)] justify-between gap-4 py-1">
        <div className="flex items-center gap-2">
          <span className="text-md font-medium">App lock</span>
        </div>
        <button
          onClick={toggleEnabled}
          disabled={toggling || (!hasPinHash && !enabled)}
          title={!hasPinHash && !enabled ? "Set up a passcode first" : undefined}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
            enabled ? "bg-black" : "bg-foreground/20"
          }`}
        >
          <span className={`inline-block size-4 transform rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>
      {!hasPinHash && !enabled && (
        <p className="text-xs text-ink-3 -mt-3">Set up a passcode below before enabling app lock.</p>
      )}

      {/* PIN setup */}
      <div className="space-y-2">

        {pinStep === "idle" ? (
          <Button
            type="button"
            variant="default"
            size="lg"
            className="w-full"
            onClick={() => { setPinStep("enter"); setPinError(null); setPin(""); setPinConfirm(""); }}
          >
            {hasPinHash ? "Change passcode" : "Set up passcode"}
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-ink-3">
              {pinStep === "enter" ? "Choose a passcode (4–6 digits):" : "Confirm your passcode:"}
            </p>
            <Input
              backgroundClassName="bg-[var(--dialog-content-background)]"
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
                variant="destructive"
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
    return <p className="text-xs text-ink-3 mt-1">Loading...</p>;
  }

  if (step === "qr") {
    return (
      <div className="space-y-3">
        {error && <p className="text-xs text-destructive">{error}</p>}
        <p className="text-xs text-ink-3">Scan deze QR-code met Google Authenticator (of een andere TOTP-app):</p>
        {enrollment && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={enrollment.qrDataUrl} alt="QR code" className="mx-auto size-40 rounded-tile bg-white p-2" />
        )}
        <p className="text-xs text-ink-3 break-all">
          Of voer handmatig in: <span className="font-mono">{enrollment?.secret}</span>
        </p>
        <label className="text-sm font-medium text-ink-2">Bevestig met een 6-cijferige code</label>
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
        <p className="text-xs text-ink-3">
          Bewaar deze back-upcodes op een veilige plek. Elke code werkt één keer als je geen toegang hebt tot je authenticator-app.
        </p>
        <div className="grid grid-cols-2 gap-1.5 rounded-tile bg-surface-2 p-3 font-mono text-sm">
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
        <p className="text-xs text-ink-3">Bevestig met je huidige wachtwoord.</p>
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
            variant="default"
            className="flex-1"
            onClick={() => { setStep("regenerate"); setError(null); }}
          >
            <p className="text-background">Nieuwe back-upcodes</p>
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="flex-1"
            onClick={() => { setStep("disable"); setError(null); }}
          >
            <p className="tracking-wide">Uitschakelen</p>
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
