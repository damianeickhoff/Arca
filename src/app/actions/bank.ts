"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { banks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import {
  ebRequest,
  getBankConfig,
  saveBankConfig,
  toBankSettingsView,
  type BankApiError,
  type BankSettingsView,
  type EbApplication,
} from "@/lib/enable-banking/client";
import {
  disconnectBank,
  listAspsps,
  listBankConnections,
  saveAccountLinks,
  startBankAuth,
  syncBankConnections,
  type AccountLinkChoice,
  type AspspOption,
  type BankConnectionView,
  type SyncOutcome,
} from "@/lib/bank-sync";

// Server actions behind Settings › Import › Bank connection. The private key only ever
// travels from the browser to here (when pasted), never back.

type Failure = { error: BankApiError | "signedOut" };

export interface BankPanelData {
  settings: BankSettingsView;
  connections: BankConnectionView[];
  /** Centje's accounts, for the account mapping dialog. */
  banks: { id: number; name: string; accountNumber: string | null }[];
}

async function panelData(): Promise<BankPanelData> {
  const [config, connections, bankRows] = await Promise.all([
    getBankConfig(),
    listBankConnections(),
    db.select({ id: banks.id, displayName: banks.displayName, accountNumber: banks.accountNumber }).from(banks).orderBy(asc(banks.id)),
  ]);
  return {
    settings: toBankSettingsView(config),
    connections,
    banks: bankRows.map((b) => ({ id: b.id, name: b.displayName?.trim() || b.accountNumber || "", accountNumber: b.accountNumber })),
  };
}

export async function getBankPanelAction(): Promise<BankPanelData | Failure> {
  if (!(await getCurrentUser())) return { error: "signedOut" };
  return panelData();
}

/** `privateKey`: a new key, null to remove it, undefined to keep the saved one. */
export async function saveBankSettingsAction(input: { applicationId: string | null; privateKey?: string | null }): Promise<BankPanelData | Failure> {
  if (!(await getCurrentUser())) return { error: "signedOut" };
  const saved = await saveBankConfig(input);
  if (!saved.ok) return { error: saved.error };
  return panelData();
}

/** GET /application with the typed (or saved) id and key, to prove they work. */
export async function testBankConnectionAction(input: { applicationId?: string; privateKey?: string }): Promise<{ ok: true; name: string | null; environment: string | null } | Failure> {
  if (!(await getCurrentUser())) return { error: "signedOut" };
  const saved = await getBankConfig();
  const override = {
    applicationId: input.applicationId?.trim() || saved.applicationId,
    privateKey: input.privateKey?.trim() || saved.privateKey,
  };
  const result = await ebRequest<EbApplication>("GET", "/application", { override });
  if (!result.ok) return { error: result.error };
  return { ok: true, name: result.value.name ?? null, environment: result.value.environment ?? null };
}

export async function listBankChoicesAction(): Promise<{ banks: AspspOption[] } | Failure> {
  if (!(await getCurrentUser())) return { error: "signedOut" };
  const result = await listAspsps("NL");
  return result.ok ? { banks: result.banks } : { error: result.error };
}

/**
 * The address the user opened Centje at: the browser's Origin header on this POST, or
 * else what the (reverse) proxy says. The bank sends the browser back there.
 */
async function requestOrigin(): Promise<string | null> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin && /^https?:\/\/[^/\s]+$/i.test(origin)) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  return `${proto}://${host}`;
}

export async function startBankConnectAction(aspsp: { name: string; country: string; maxConsentSeconds: number | null }): Promise<{ url: string } | Failure> {
  if (!(await getCurrentUser())) return { error: "signedOut" };
  const origin = await requestOrigin();
  if (!origin || typeof aspsp?.name !== "string" || typeof aspsp?.country !== "string") return { error: "badRequest" };
  let maxConsentSeconds = typeof aspsp.maxConsentSeconds === "number" ? aspsp.maxConsentSeconds : null;
  // A reconnect only knows the bank's name: look up how long a consent it allows.
  if (maxConsentSeconds == null) {
    const list = await listAspsps(aspsp.country);
    if (list.ok) maxConsentSeconds = list.banks.find((b) => b.name === aspsp.name)?.maxConsentSeconds ?? null;
  }
  const result = await startBankAuth({ name: aspsp.name, country: aspsp.country, maxConsentSeconds }, origin);
  return result.ok ? { url: result.url } : { error: result.error };
}

export async function saveAccountLinksAction(connectionId: number, links: { accountId: number; choice: AccountLinkChoice }[]): Promise<BankPanelData | Failure> {
  if (!(await getCurrentUser())) return { error: "signedOut" };
  const clean = (Array.isArray(links) ? links : [])
    .filter((l) => Number.isInteger(l?.accountId))
    .map((l) => ({ accountId: l.accountId, choice: l.choice === "new" || l.choice === null || Number.isInteger(l.choice) ? l.choice : null }));
  await saveAccountLinks(connectionId, clean);
  // A bank created from an account shows in the sidebar's account list.
  revalidatePath("/", "layout");
  return panelData();
}

export async function disconnectBankAction(connectionId: number): Promise<BankPanelData | Failure> {
  if (!(await getCurrentUser())) return { error: "signedOut" };
  await disconnectBank(connectionId);
  return panelData();
}

/** Sync one connection, or all of them when `connectionId` is omitted. */
export async function syncBankAction(connectionId?: number): Promise<{ outcome: SyncOutcome; data: BankPanelData } | Failure> {
  if (!(await getCurrentUser())) return { error: "signedOut" };
  const outcome = await syncBankConnections(connectionId);
  // New rows move balances, Home and Activity.
  if (outcome.ok && outcome.results.some((r) => r.summary.imported > 0)) revalidatePath("/", "layout");
  return { outcome, data: await panelData() };
}
