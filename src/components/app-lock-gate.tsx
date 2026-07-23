"use client";

import { useEffect, useState, useCallback } from "react";
import {
  IconLock as Lock,
  IconFingerprint as Fingerprint,
  IconBackspace as Delete,
} from "@tabler/icons-react";
import { verifyPinAction, getWebAuthnChallengeAction, verifyWebAuthnAssertionAction } from "@/app/actions/app-lock";
import { cn } from "@/lib/utils";

const UNLOCK_KEY = "app_lock_unlocked_v1";

function b64urlToBuffer(b64url: string): ArrayBuffer {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const str = atob(b64);
  const buf = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i);
  return buf.buffer;
}

function bufToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str);
}

interface AppLockGateProps {
  enabled: boolean;
  hasWebAuthn: boolean;
  webAuthnCredentialId: string | null;
  children: React.ReactNode;
}

export function AppLockGate({ enabled, hasWebAuthn, webAuthnCredentialId, children }: AppLockGateProps) {
  const [locked, setLocked] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!enabled) {
      setLocked(false);
      return;
    }
    // Unlocked flag lives in sessionStorage — clears when the tab/browser closes.
    const unlocked = sessionStorage.getItem(UNLOCK_KEY) === "1";
    if (unlocked) setLocked(false);
  }, [enabled]);

  const handleUnlock = useCallback(() => {
    sessionStorage.setItem(UNLOCK_KEY, "1");
    setLocked(false);
  }, []);

  // Don't render anything until we've checked sessionStorage (avoids flash).
  if (!mounted) return null;
  if (!enabled || !locked) return <>{children}</>;

  return (
    <LockScreen
      hasWebAuthn={hasWebAuthn}
      webAuthnCredentialId={webAuthnCredentialId}
      onUnlock={handleUnlock}
    />
  );
}

function LockScreen({
  hasWebAuthn,
  webAuthnCredentialId,
  onUnlock,
}: {
  hasWebAuthn: boolean;
  webAuthnCredentialId: string | null;
  onUnlock: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  const MAX_DIGITS = 6;

  async function submitPin(fullPin: string) {
    if (fullPin.length < 4) return;
    setVerifying(true);
    setError(null);
    const result = await verifyPinAction(fullPin);
    setVerifying(false);
    if (result.valid) {
      onUnlock();
    } else {
      setError(result.error ?? "Onjuiste pincode.");
      setPin("");
    }
  }

  function pressDigit(d: string) {
    if (verifying) return;
    const next = (pin + d).slice(0, MAX_DIGITS);
    setPin(next);
    setError(null);
    if (next.length >= 4) {
      // Auto-submit at 4+ digits after a short delay so the user sees the fill
      setTimeout(() => submitPin(next), 80);
    }
  }

  function pressDelete() {
    setPin((p) => p.slice(0, -1));
    setError(null);
  }

  async function tryBiometric() {
    if (!hasWebAuthn || !webAuthnCredentialId) return;
    setBiometricLoading(true);
    setError(null);
    try {
      const { challenge } = await getWebAuthnChallengeAction();
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: b64urlToBuffer(challenge),
          allowCredentials: [{ id: b64urlToBuffer(webAuthnCredentialId), type: "public-key" }],
          userVerification: "required",
          timeout: 60000,
          rpId: window.location.hostname,
        },
      }) as PublicKeyCredential | null;

      if (!credential) throw new Error("No credential.");
      const response = credential.response as AuthenticatorAssertionResponse;

      const result = await verifyWebAuthnAssertionAction(
        credential.id,
        bufToB64(response.clientDataJSON),
        bufToB64(response.authenticatorData),
        bufToB64(response.signature),
      );

      if (result.valid) {
        onUnlock();
      } else {
        setError(result.error ?? "Biometric verification failed.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error.";
      if (!msg.includes("cancel") && !msg.includes("NotAllowed")) {
        setError("Biometric verification failed.");
      }
    } finally {
      setBiometricLoading(false);
    }
  }

  // Auto-trigger biometric on mount if available
  useEffect(() => {
    if (hasWebAuthn && webAuthnCredentialId) {
      tryBiometric();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-8 px-6 w-full max-w-xs">
        {/* Icon */}
        <div className="flex flex-col items-center gap-3">
          <div className="size-14 rounded-2xl bg-foreground/8 flex items-center justify-center">
            <Lock className="size-7 text-foreground/60" />
          </div>
          <div className="text-center">
            <h1 className="font-semibold text-lg">App vergrendeld</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Voer uw pincode in</p>
          </div>
        </div>

        {/* PIN dots — 4 dots, auto-submit fires when all 4 are filled */}
        <div className="flex items-center gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "size-3.5 rounded-full transition-all duration-150",
                i < pin.length
                  ? "bg-foreground scale-110"
                  : "bg-foreground/20",
              )}
            />
          ))}
        </div>

        {/* Error */}
        <div className="h-5 flex items-center justify-center">
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <NumKey key={d} label={d} onPress={() => pressDigit(d)} disabled={verifying} />
          ))}

          {/* Biometric or empty */}
          {hasWebAuthn ? (
            <button
              onClick={tryBiometric}
              disabled={biometricLoading || verifying}
              className="h-14 rounded-2xl bg-foreground/5 flex items-center justify-center text-foreground/50 hover:bg-foreground/10 active:scale-[0.97] transition-all disabled:opacity-40"
              aria-label="Biometric verification"
            >
              <Fingerprint className={cn("size-6", biometricLoading && "animate-pulse")} />
            </button>
          ) : (
            <div />
          )}

          <NumKey label="0" onPress={() => pressDigit("0")} disabled={verifying} />

          {/* Delete */}
          <button
            onClick={pressDelete}
            disabled={pin.length === 0 || verifying}
            className="h-14 rounded-2xl bg-foreground/5 flex items-center justify-center text-foreground/50 hover:bg-foreground/10 active:scale-[0.97] transition-all disabled:opacity-40"
            aria-label="Delete"
          >
            <Delete className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function NumKey({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onPress}
      disabled={disabled}
      className="h-14 rounded-2xl bg-foreground/5 text-xl font-medium hover:bg-foreground/10 active:scale-[0.97] transition-all disabled:opacity-40"
    >
      {label}
    </button>
  );
}
