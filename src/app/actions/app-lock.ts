"use server";

import bcrypt from "bcryptjs";
import { webcrypto } from "crypto";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

const KEY_ENABLED = "app_lock_enabled";
const KEY_PIN_HASH = "app_lock_pin_hash";
const KEY_PIN_LENGTH = "app_lock_pin_length";
const KEY_WEBAUTHN_CREDENTIAL = "app_lock_webauthn_credential";
const KEY_WEBAUTHN_CHALLENGE = "app_lock_webauthn_challenge";

async function getSetting(key: string): Promise<string | null> {
  const row = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return row[0]?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await db.insert(appSettings).values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

export async function getAppLockStatus(): Promise<{
  enabled: boolean;
  hasPinHash: boolean;
  hasWebAuthn: boolean;
  webAuthnCredentialId: string | null;
}> {
  const user = await getCurrentUser();
  if (!user) return { enabled: false, hasPinHash: false, hasWebAuthn: false, webAuthnCredentialId: null };

  const [enabledVal, pinHash, webAuthnVal] = await Promise.all([
    getSetting(KEY_ENABLED),
    getSetting(KEY_PIN_HASH),
    getSetting(KEY_WEBAUTHN_CREDENTIAL),
  ]);

  let webAuthnCredentialId: string | null = null;
  if (webAuthnVal) {
    try {
      const parsed = JSON.parse(webAuthnVal);
      webAuthnCredentialId = parsed.credentialId ?? null;
    } catch { /* ignore */ }
  }

  return {
    enabled: enabledVal === "1",
    hasPinHash: !!pinHash,
    hasWebAuthn: !!webAuthnVal,
    webAuthnCredentialId,
  };
}

export async function setAppLockEnabledAction(enabled: boolean): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };

  await setSetting(KEY_ENABLED, enabled ? "1" : "0");
  return {};
}

export async function setPinAction(pin: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };

  if (!/^\d{4,6}$/.test(pin)) return { error: "Passcode must be 4–6 digits." };

  const hash = await bcrypt.hash(pin, 10);
  await setSetting(KEY_PIN_HASH, hash);
  await setSetting(KEY_PIN_LENGTH, String(pin.length));
  return {};
}

export async function verifyPinAction(pin: string): Promise<{ valid: boolean; error?: string }> {
  const [enabledVal, pinHash] = await Promise.all([
    getSetting(KEY_ENABLED),
    getSetting(KEY_PIN_HASH),
  ]);

  if (enabledVal !== "1") return { valid: true };
  if (!pinHash) return { valid: false, error: "No passcode set." };

  const valid = await bcrypt.compare(pin, pinHash);
  return { valid };
}

export async function getWebAuthnChallengeAction(): Promise<{ challenge: string }> {
  const challenge = randomBytes(32).toString("base64url");
  const expiry = Date.now() + 5 * 60 * 1000;
  await setSetting(KEY_WEBAUTHN_CHALLENGE, `${challenge}:${expiry}`);
  return { challenge };
}

export async function registerWebAuthnCredentialAction(
  credentialId: string,
  publicKeySpkiB64: string,
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };

  await setSetting(KEY_WEBAUTHN_CREDENTIAL, JSON.stringify({ credentialId, publicKeySpkiB64 }));
  return {};
}

export async function removeWebAuthnCredentialAction(): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };
  await setSetting(KEY_WEBAUTHN_CREDENTIAL, "");
  return {};
}

export async function verifyWebAuthnAssertionAction(
  credentialId: string,
  clientDataJSONB64: string,
  authenticatorDataB64: string,
  signatureB64: string,
): Promise<{ valid: boolean; error?: string }> {
  const [challengeVal, credentialVal] = await Promise.all([
    getSetting(KEY_WEBAUTHN_CHALLENGE),
    getSetting(KEY_WEBAUTHN_CREDENTIAL),
  ]);

  if (!challengeVal) return { valid: false, error: "No challenge available." };
  const colonIdx = challengeVal.lastIndexOf(":");
  const storedChallenge = challengeVal.slice(0, colonIdx);
  const expiry = parseInt(challengeVal.slice(colonIdx + 1), 10);
  if (Date.now() > expiry) return { valid: false, error: "Challenge verlopen." };

  if (!credentialVal) return { valid: false, error: "No biometrics set up." };
  let credential: { credentialId: string; publicKeySpkiB64: string };
  try { credential = JSON.parse(credentialVal); }
  catch { return { valid: false, error: "Invalid credential." }; }

  if (credential.credentialId !== credentialId) return { valid: false, error: "Unknown credential." };

  try {
    const clientDataBuffer = Buffer.from(clientDataJSONB64, "base64");
    const clientData = JSON.parse(clientDataBuffer.toString("utf8"));

    // Verify type
    if (clientData.type !== "webauthn.get") return { valid: false, error: "Invalid type." };

    // Verify challenge (clientData.challenge is base64url)
    const clientChallenge = clientData.challenge as string;
    if (clientChallenge !== storedChallenge) return { valid: false, error: "Challenge does not match." };

    // Import stored public key (SPKI format)
    const publicKeyBuffer = Buffer.from(credential.publicKeySpkiB64, "base64");
    const publicKey = await webcrypto.subtle.importKey(
      "spki",
      publicKeyBuffer,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );

    // signed data = authenticatorData || SHA-256(clientDataJSON)
    const authDataBuffer = Buffer.from(authenticatorDataB64, "base64");
    const clientDataHash = await webcrypto.subtle.digest("SHA-256", clientDataBuffer);
    const signedData = Buffer.concat([authDataBuffer, Buffer.from(clientDataHash)]);
    const signatureBuffer = Buffer.from(signatureB64, "base64");

    const valid = await webcrypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      signatureBuffer,
      signedData,
    );

    // Invalidate used challenge
    await setSetting(KEY_WEBAUTHN_CHALLENGE, "");

    return { valid };
  } catch {
    return { valid: false, error: "Verification failed." };
  }
}
