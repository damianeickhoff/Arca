"use server";

import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import {
  generateTotpSecret,
  buildOtpAuthUri,
  verifyTotpCode,
  generateBackupCodes,
} from "@/lib/totp";

export async function getMfaStatusAction(): Promise<{ enabled: boolean }> {
  const user = await getCurrentUser();
  return { enabled: user?.totpEnabled ?? false };
}

// Generates and stores a new secret (totpEnabled stays false until confirmed via
// confirmTotpEnrollmentAction), then returns everything the settings/onboarding UI needs
// to render a scannable QR code plus a manual-entry fallback.
export async function startTotpEnrollmentAction(): Promise<
  { error: string } | { secret: string; otpauthUri: string; qrDataUrl: string }
> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };

  const secret = generateTotpSecret();
  await db.update(users).set({ totpSecret: secret, totpEnabled: false }).where(eq(users.id, user.id));

  const otpauthUri = buildOtpAuthUri(secret, user.email);
  const qrDataUrl = await QRCode.toDataURL(otpauthUri);

  return { secret, otpauthUri, qrDataUrl };
}

export async function confirmTotpEnrollmentAction(
  code: string,
): Promise<{ error?: string; backupCodes?: string[] }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };
  if (!user.totpSecret) return { error: "Start setup again." };

  if (!verifyTotpCode(user.totpSecret, code)) {
    return { error: "Onjuiste code. Probeer het opnieuw." };
  }

  const { plain, hashed } = await generateBackupCodes();
  await db
    .update(users)
    .set({ totpEnabled: true, totpBackupCodes: JSON.stringify(hashed) })
    .where(eq(users.id, user.id));

  return { backupCodes: plain };
}

export async function disableTotpAction(password: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return { error: "Wachtwoord is onjuist." };

  await db
    .update(users)
    .set({ totpEnabled: false, totpSecret: null, totpBackupCodes: null })
    .where(eq(users.id, user.id));

  return {};
}

export async function regenerateBackupCodesAction(
  password: string,
): Promise<{ error?: string; backupCodes?: string[] }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };
  if (!user.totpEnabled) return { error: "MFA is not enabled." };

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return { error: "Wachtwoord is onjuist." };

  const { plain, hashed } = await generateBackupCodes();
  await db.update(users).set({ totpBackupCodes: JSON.stringify(hashed) }).where(eq(users.id, user.id));

  return { backupCodes: plain };
}
