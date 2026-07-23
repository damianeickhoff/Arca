// Hand-rolled RFC 4226 (HOTP) / RFC 6238 (TOTP) + backup codes, in the same style as the
// hand-rolled WebAuthn verifier in src/app/actions/app-lock.ts — no auth framework, no
// otplib/speakeasy dependency, just Node's crypto. The only external dependency this
// feature needs is `qrcode`, used elsewhere to render buildOtpAuthUri() as a scannable image.
import crypto from "crypto";
import bcrypt from "bcryptjs";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PERIOD_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = "";
  for (const byte of buf) bits += byte.toString(2).padStart(8, "0");

  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    out += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return out;
}

export function base32Decode(str: string): Buffer {
  const cleaned = str.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of cleaned) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secretBase32: string, counter: number): string {
  const key = base32Decode(secretBase32);
  const counterBuf = Buffer.alloc(8);
  // Counter is a 64-bit big-endian integer; writeBigUInt64BE requires a BigInt.
  counterBuf.writeBigUInt64BE(BigInt(counter));

  const digest = crypto.createHmac("sha1", key).update(counterBuf).digest();
  const offset = digest[19] & 0xf;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}

export function generateTotpCode(secretBase32: string, timestamp: number = Date.now()): string {
  const counter = Math.floor(timestamp / 1000 / PERIOD_SECONDS);
  return hotp(secretBase32, counter);
}

// Accepts a code from the current time step or `windowSteps` steps before/after it, to
// tolerate clock drift between the server and the authenticator app (±30s by default).
export function verifyTotpCode(secretBase32: string, code: string, windowSteps = 1): boolean {
  const normalized = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;

  const counter = Math.floor(Date.now() / 1000 / PERIOD_SECONDS);
  for (let i = -windowSteps; i <= windowSteps; i++) {
    if (hotp(secretBase32, counter + i) === normalized) return true;
  }
  return false;
}

export function buildOtpAuthUri(secretBase32: string, email: string, issuer = "Arca"): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function randomBackupCode(): string {
  // 8 base32-ish alphanumeric chars (uppercase, no ambiguous 0/O/1/I), formatted XXXX-XXXX.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let raw = "";
  for (let i = 0; i < 8; i++) raw += alphabet[crypto.randomInt(alphabet.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export async function generateBackupCodes(count = 10): Promise<{ plain: string[]; hashed: string[] }> {
  const plain = Array.from({ length: count }, randomBackupCode);
  const hashed = await Promise.all(plain.map((code) => bcrypt.hash(code, 10)));
  return { plain, hashed };
}

// Compares `code` against each stored hash; on a match, returns the remaining hashes with
// that one removed (single-use) so the caller can persist the updated list.
export async function verifyBackupCode(
  code: string,
  hashedCodesJson: string | null,
): Promise<{ valid: boolean; remaining: string[] }> {
  if (!hashedCodesJson) return { valid: false, remaining: [] };

  let hashes: string[];
  try {
    hashes = JSON.parse(hashedCodesJson);
  } catch {
    return { valid: false, remaining: [] };
  }

  const normalized = code.trim().toUpperCase();
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(normalized, hashes[i])) {
      return { valid: true, remaining: [...hashes.slice(0, i), ...hashes.slice(i + 1)] };
    }
  }
  return { valid: false, remaining: hashes };
}
