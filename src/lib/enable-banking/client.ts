import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { buildEnableBankingJwt, isUsablePrivateKey } from "@/lib/enable-banking/jwt";

// The Enable Banking account-information API (https://enablebanking.com/docs/api/reference/).
// Server only: the application id and the private key live in app_settings and the key
// never reaches the browser — the settings panel only learns that one is saved. Every
// call goes through ebRequest, which returns a typed error instead of throwing.

const API = "https://api.enablebanking.com";

const KEYS = { applicationId: "eb_application_id", privateKey: "eb_private_key" } as const;

export type BankApiError =
  | "notConfigured"
  | "invalidKey"
  | "unauthorized"
  | "sessionExpired"
  | "rateLimited"
  | "badRequest"
  | "unavailable";

export type BankApiResult<T> = { ok: true; value: T } | { ok: false; error: BankApiError; message?: string };

export interface BankConfig {
  applicationId: string | null;
  privateKey: string | null;
}

/** What the settings panel may see: the application id (not a secret on its own), never the key. */
export interface BankSettingsView {
  applicationId: string | null;
  hasKey: boolean;
}

export async function getBankConfig(): Promise<BankConfig> {
  const rows = await db.select().from(appSettings).where(inArray(appSettings.key, Object.values(KEYS)));
  const value = (key: string) => rows.find((r) => r.key === key)?.value || null;
  return { applicationId: value(KEYS.applicationId), privateKey: value(KEYS.privateKey) };
}

export function toBankSettingsView(config: BankConfig): BankSettingsView {
  return { applicationId: config.applicationId, hasKey: !!config.privateKey };
}

export function isBankConfigured(config: BankConfig): config is { applicationId: string; privateKey: string } {
  return !!config.applicationId && !!config.privateKey;
}

async function setSetting(key: string, value: string | null) {
  if (value == null) {
    await db.delete(appSettings).where(eq(appSettings.key, key));
    return;
  }
  await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

/**
 * Saves the settings. An undefined `privateKey` keeps the stored one, null removes it.
 * A key Node can't sign with is refused rather than stored.
 */
export async function saveBankConfig(next: { applicationId: string | null; privateKey?: string | null }): Promise<{ ok: true } | { ok: false; error: "invalidKey" }> {
  const pem = next.privateKey?.trim();
  if (pem && !isUsablePrivateKey(pem)) return { ok: false, error: "invalidKey" };
  await setSetting(KEYS.applicationId, next.applicationId?.trim() || null);
  if (next.privateKey !== undefined) await setSetting(KEYS.privateKey, pem || null);
  return { ok: true };
}

/** Error codes the API sends (ErrorResponse.error) that mean the bank consent is gone. */
const SESSION_GONE = new Set(["EXPIRED_SESSION", "CLOSED_SESSION", "REVOKED_SESSION", "SESSION_DOES_NOT_EXIST", "WRONG_SESSION_STATUS"]);

/** Reads an ErrorResponse ({ message, code, error, detail }) into a BankApiError. */
export function bankErrorFor(status: number, body: unknown): BankApiError {
  const code = (body as { error?: unknown } | null)?.error;
  if (typeof code === "string" && SESSION_GONE.has(code)) return "sessionExpired";
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "rateLimited";
  if (status === 400 || status === 404 || status === 422) return "badRequest";
  return "unavailable";
}

/**
 * One API call. `override` uses a typed-in id and key instead of the saved ones (the
 * panel's Test checks them before they are saved).
 */
export async function ebRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  options: { query?: Record<string, string | undefined | null>; body?: unknown; override?: BankConfig } = {},
): Promise<BankApiResult<T>> {
  const config = options.override ?? (await getBankConfig());
  if (!isBankConfigured(config)) return { ok: false, error: "notConfigured" };
  let token: string;
  try {
    token = buildEnableBankingJwt(config.applicationId, config.privateKey);
  } catch {
    return { ok: false, error: "invalidKey" };
  }

  const url = new URL(`${API}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value != null && value !== "") url.searchParams.set(key, value);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return { ok: false, error: "unavailable" };
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (data as { message?: unknown } | null)?.message;
    // For the server log: the API's own words, never the token.
    console.warn(`[enable-banking] ${method} ${path}: HTTP ${res.status} ${typeof message === "string" ? message : ""}`.trim());
    return { ok: false, error: bankErrorFor(res.status, data), message: typeof message === "string" ? message : undefined };
  }
  return { ok: true, value: data as T };
}

// ─── Response shapes (only the fields Centje reads) ─────────────────────────────

export interface EbApplication {
  name?: string;
  environment?: string;
  active?: boolean;
  redirect_urls?: string[];
}

export interface EbAspsp {
  name: string;
  country: string;
  logo?: string | null;
  bic?: string | null;
  beta?: boolean;
  /** Seconds. */
  maximum_consent_validity?: number | null;
  psu_types?: string[];
}

export interface EbSessionAccount {
  uid: string;
  account_id?: { iban?: string | null; other?: { identification?: string | null } | null } | null;
  name?: string | null;
  details?: string | null;
  product?: string | null;
  currency?: string | null;
  cash_account_type?: string | null;
}

export interface EbSession {
  session_id: string;
  accounts: EbSessionAccount[];
  aspsp: { name: string; country: string };
  access: { valid_until: string };
}
