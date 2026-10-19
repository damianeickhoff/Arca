"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { IconFingerprint, IconBackspace } from "@tabler/icons-react";
import { verifyPinAction, getWebAuthnChallengeAction, verifyWebAuthnAssertionAction } from "@/app/actions/app-lock";
import { BrandMark } from "@/components/clear/brand-mark";
import { cn } from "@/lib/utils";
import { useKeypadKeyboard } from "@/lib/use-keypad-keyboard";

const UNLOCK_KEY = "app_lock_unlocked_v1";

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

interface AppLockGateProps {
  enabled: boolean;
  hasWebAuthn: boolean;
  webAuthnCredentialId: string | null;
  pinLength: number | null;
  /** First name for the greeting; null shows a plain "Welcome back". */
  userName: string | null;
  children: React.ReactNode;
}

export function AppLockGate({ enabled, hasWebAuthn, webAuthnCredentialId, pinLength, userName, children }: AppLockGateProps) {
  const [locked, setLocked] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Synchronising with the browser after hydration: the server can't know whether this
    // tab was already unlocked (sessionStorage), so this has to run post-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
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
      pinLength={pinLength}
      userName={userName}
      onUnlock={handleUnlock}
    />
  );
}

function LockScreen({
  hasWebAuthn,
  webAuthnCredentialId,
  pinLength,
  userName,
  onUnlock,
}: {
  hasWebAuthn: boolean;
  webAuthnCredentialId: string | null;
  pinLength: number | null;
  userName: string | null;
  onUnlock: () => void;
}) {
  const t = useTranslations("appLock");
  const [pin, setPinState] = useState("");
  // Mirrors `pin` so fast hardware typing (several keydowns before a re-render)
  // never builds on a stale value.
  const pinRef = useRef("");
  const setPin = (next: string) => {
    pinRef.current = next;
    setPinState(next);
  };
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  const MIN_DIGITS = 4;
  const MAX_DIGITS = 6;
  // When the passcode length is known we size the dots to it and auto-submit once
  // it's filled. When it's unknown (passcodes set before the length was recorded)
  // we show the max slots and rely on the confirm button to submit.
  const knownLength = pinLength;
  const dotCount = knownLength ?? MAX_DIGITS;
  const canConfirm = pin.length >= MIN_DIGITS;

  async function submitPin(fullPin: string) {
    if (fullPin.length < MIN_DIGITS) return;
    setVerifying(true);
    setError(null);
    const result = await verifyPinAction(fullPin);
    setVerifying(false);
    if (result.valid) {
      onUnlock();
    } else {
      // The action only returns an error text when no passcode is stored at all.
      setError(result.error ? t("unlockFailed") : t("wrongPin"));
      setPin("");
    }
  }

  function pressDigit(d: string) {
    if (verifying) return;
    const next = (pinRef.current + d).slice(0, MAX_DIGITS);
    setPin(next);
    setError(null);
    // Only auto-submit when we know exactly how long the code is; otherwise the
    // user confirms manually so 5- and 6-digit codes aren't cut off at 4.
    if (knownLength !== null && next.length === knownLength) {
      // Short delay so the user sees the final dot fill before it submits.
      setTimeout(() => submitPin(next), 80);
    }
  }

  function pressDelete() {
    setPin(pinRef.current.slice(0, -1));
    setError(null);
  }

  // Top-row digits, the numpad, Backspace and Enter work as well as the buttons.
  const keypadRef = useKeypadKeyboard({
    onKey: (k) => {
      if (k === "back") pressDelete();
      else if (/^\d$/.test(k)) pressDigit(k);
    },
    onEnter: () => {
      if (!verifying && pinRef.current.length >= MIN_DIGITS) submitPin(pinRef.current);
    },
  });

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
        setError(t("biometricFailed"));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (!msg.includes("cancel") && !msg.includes("NotAllowed")) {
        setError(t("biometricFailed"));
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

  const firstName = userName?.trim().split(/\s+/)[0] ?? "";
  // Keys: a faint wash of the screen's own text colour, so they work on both themes.
  const key =
    "inline-flex size-[76px] cursor-pointer items-center justify-center rounded-full text-[28px] font-bold tabular-nums transition-transform active:scale-95 disabled:opacity-40 outline-none focus-visible:ring-3 focus-visible:ring-clear-ember/60";

  return (
    // Dark in both themes (Phone-AppLock mockup): the hero black in light mode, the
    // page ground in dark mode, where an inverted near-white screen would glare.
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-clear-hero font-clear text-clear-hero-ink dark:bg-clear-ground dark:text-clear-ink">
      <div className="flex min-h-full flex-col items-center justify-center gap-3.5 px-4 pt-[calc(var(--sat)+48px)] pb-[calc(var(--sab)+32px)]">
        <BrandMark size="xl" />

        <div className="mt-1.5 flex flex-col items-center gap-1.5 text-center">
          <h1 className="m-0 text-2xl font-extrabold tracking-[-0.02em]">
            {firstName ? t("title", { name: firstName }) : t("titleNoName")}
          </h1>
          <p className="m-0 text-[15px] font-medium text-clear-hero-ink-2 dark:text-clear-ink-2">{t("body")}</p>
        </div>

        {/* PIN dots — sized to the passcode length (4–6). When the length is
            known, auto-submit fires once every dot is filled. */}
        <div role="img" aria-label={t("dots", { filled: pin.length, total: dotCount })} className="mt-[18px] flex gap-[18px]">
          {Array.from({ length: dotCount }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "size-3.5 rounded-full transition-all duration-150",
                i < pin.length ? "scale-110 bg-current" : "border-2 border-current/55",
              )}
            />
          ))}
        </div>

        <div aria-live="polite" className="flex min-h-[30px] items-center justify-center text-center">
          {error && <p className="m-0 rounded-full bg-clear-ember px-3.5 py-1.5 text-sm font-bold text-clear-ember-ink">{error}</p>}
        </div>

        <div ref={keypadRef} role="group" aria-label={t("keypad")} className="grid grid-cols-[repeat(3,76px)] gap-x-7 gap-y-4">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} type="button" onClick={() => pressDigit(d)} disabled={verifying} className={cn(key, "bg-current/8")}>
              {d}
            </button>
          ))}

          {/* Biometric or empty */}
          {hasWebAuthn ? (
            <button
              type="button"
              onClick={tryBiometric}
              disabled={biometricLoading || verifying}
              aria-label={t("biometric")}
              className={key}
            >
              <IconFingerprint size={28} stroke={1.9} className={cn(biometricLoading && "animate-pulse")} />
            </button>
          ) : (
            <span aria-hidden />
          )}

          <button type="button" onClick={() => pressDigit("0")} disabled={verifying} className={cn(key, "bg-current/8")}>
            0
          </button>

          <button
            type="button"
            onClick={pressDelete}
            disabled={pin.length === 0 || verifying}
            aria-label={t("delete")}
            className={key}
          >
            <IconBackspace size={28} stroke={1.9} />
          </button>
        </div>

        {/* Confirm — only needed when the passcode length is unknown, since those
            codes don't auto-submit. Lets 5- and 6-digit codes be entered fully. */}
        {knownLength === null && (
          <button
            type="button"
            onClick={() => submitPin(pin)}
            disabled={!canConfirm || verifying}
            className="mt-6 inline-flex h-12 w-full max-w-[284px] cursor-pointer items-center justify-center rounded-full bg-clear-hero-ink text-[15px] font-bold text-clear-hero transition-[opacity,transform] active:scale-[0.97] disabled:opacity-40 dark:bg-clear-ink dark:text-clear-ground"
          >
            {t("unlock")}
          </button>
        )}
      </div>
    </div>
  );
}

