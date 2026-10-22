"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { generateJson, getAiSettings, saveAiSettings, toAiSettingsView, type AiError, type AiSchema } from "@/lib/ai-provider";
import { listModels } from "@/lib/gemini";
import { listLocalModels, normalizeBaseUrl } from "@/lib/openai-compatible";
import type { AiSettingsView, SaveAiSettingsInput } from "@/lib/ai-shared";
import { suggestCategories, summarizePeriod, type PeriodSummary, type SummaryFacts } from "@/lib/ai-features";

// Server actions behind Settings › AI, Needs review's "Ask AI" and the Insights summary.
// API keys only ever travel from the browser to here (when typed), never back.
// Settings › AI is app-wide and makes the server call out (Google, or the address typed),
// so changing, listing and testing it is admin-only; everyone may read it and use the
// features it switches on.

type Failure = { error: AiError | "signedOut" | "badAddress" | "denied" };

async function adminOnly(): Promise<Failure | null> {
  const user = await getCurrentUser();
  if (!user) return { error: "signedOut" };
  return user.isAdmin ? null : { error: "denied" };
}

const text = (value: unknown) => (typeof value === "string" ? value : null);

export async function getAiSettingsAction(): Promise<AiSettingsView | Failure> {
  if (!(await getCurrentUser())) return { error: "signedOut" };
  return toAiSettingsView(await getAiSettings());
}

export async function saveAiSettingsAction(input: SaveAiSettingsInput): Promise<AiSettingsView | Failure> {
  const denied = await adminOnly();
  if (denied) return denied;
  // Only the known fields, as strings: a server action takes whatever the browser sends.
  const key = (value: unknown) => (value === undefined ? undefined : text(value));
  const result = await saveAiSettings({
    provider: input?.provider === "local" ? "local" : "gemini",
    enabled: input?.enabled === true,
    gemini: { apiKey: key(input?.gemini?.apiKey), model: text(input?.gemini?.model) },
    local: {
      baseUrl: text(input?.local?.baseUrl),
      model: text(input?.local?.model),
      visionModel: text(input?.local?.visionModel),
      apiKey: key(input?.local?.apiKey),
    },
  });
  if (!result.ok) return { error: result.error };
  // Needs review, Insights and the receipt-scan buttons follow these settings.
  revalidatePath("/", "layout");
  return toAiSettingsView(await getAiSettings());
}

/**
 * The local server's address and key to try: the typed ones, else the saved ones. A saved
 * key is only sent to the saved address, never to a new one typed in the form.
 */
async function localConnection(input: { baseUrl?: unknown; apiKey?: unknown }): Promise<{ baseUrl: string; apiKey: string | null } | Failure> {
  const saved = (await getAiSettings()).local;
  const typed = text(input.baseUrl)?.trim();
  const baseUrl = typed ? normalizeBaseUrl(typed) : saved.baseUrl;
  if (typed && !baseUrl) return { error: "badAddress" };
  if (!baseUrl) return { error: "notConfigured" };
  const typedKey = text(input.apiKey)?.trim();
  return { baseUrl, apiKey: typedKey || (baseUrl === saved.baseUrl ? saved.apiKey : null) };
}

export type ListModelsInput = { provider: "gemini"; apiKey?: string } | { provider: "local"; baseUrl?: string; apiKey?: string };

/** The models a provider offers, with the typed settings, else the saved ones. */
export async function listAiModelsAction(input: ListModelsInput): Promise<{ models: string[] } | Failure> {
  const denied = await adminOnly();
  if (denied) return denied;
  if (input?.provider === "local") {
    const connection = await localConnection(input);
    if ("error" in connection) return connection;
    const result = await listLocalModels(connection);
    return result.ok ? { models: result.value } : { error: result.error };
  }
  const key = text(input?.apiKey)?.trim() || (await getAiSettings()).gemini.apiKey;
  if (!key) return { error: "notConfigured" };
  const result = await listModels(key);
  return result.ok ? { models: result.value } : { error: result.error };
}

export type TestConnectionInput =
  | { provider: "gemini"; apiKey?: string; model: string | null }
  | { provider: "local"; baseUrl?: string; apiKey?: string; model: string | null };

const TEST_PROMPT = { system: "Answer with the JSON asked for.", user: 'Reply with {"ok": true}.' };
const TEST_SCHEMA: AiSchema = { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } }, required: ["ok"] };

/**
 * Proves the typed (or saved) settings work. Gemini: one tiny request. Local server: the
 * model list, then — when a model is chosen — one tiny request to it as well.
 */
export async function testAiConnectionAction(input: TestConnectionInput): Promise<{ ok: true; model: string | null; modelCount?: number } | Failure> {
  const denied = await adminOnly();
  if (denied) return denied;
  if (input?.provider === "local") {
    const connection = await localConnection(input);
    if ("error" in connection) return connection;
    const models = await listLocalModels(connection);
    if (!models.ok) return { error: models.error };
    const model = text(input.model)?.trim();
    if (!model) return { ok: true, model: null, modelCount: models.value.length };
    const result = await generateJson<{ ok: boolean }>(TEST_PROMPT, TEST_SCHEMA, { provider: "local", ...connection, model });
    return result.ok ? { ok: true, model } : { error: result.error };
  }

  const apiKey = text(input?.apiKey)?.trim() || (await getAiSettings()).gemini.apiKey;
  if (!apiKey) return { error: "notConfigured" };
  const result = await generateJson<{ ok: boolean }>(TEST_PROMPT, TEST_SCHEMA, { provider: "gemini", apiKey, model: text(input?.model) });
  return result.ok ? { ok: true, model: result.model ?? null } : { error: result.error };
}

export async function suggestCategoriesAction(ids: number[]): Promise<{ suggestions: Record<number, number> } | Failure> {
  if (!(await getCurrentUser())) return { error: "signedOut" };
  const result = await suggestCategories(ids.filter((id) => Number.isInteger(id)));
  return result.ok ? { suggestions: result.value } : { error: result.error };
}

export async function summarizePeriodAction(key: string, facts: SummaryFacts): Promise<{ summary: PeriodSummary } | Failure> {
  if (!(await getCurrentUser())) return { error: "signedOut" };
  const result = await summarizePeriod(key, facts, await getLocale());
  return result.ok ? { summary: result.value } : { error: result.error };
}
