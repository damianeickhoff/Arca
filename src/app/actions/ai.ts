"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import {
  generateJson,
  getAiConfig,
  listModels,
  saveAiConfig,
  toSettingsView,
  type AiError,
  type AiSettingsView,
} from "@/lib/gemini";
import { suggestCategories, summarizePeriod, type PeriodSummary, type SummaryFacts } from "@/lib/ai-features";

// Server actions behind Settings › AI, Needs review's "Ask AI" and the Insights summary.
// The API key only ever travels from the browser to here (when typed), never back.

type Failure = { error: AiError | "signedOut" };

export async function getAiSettingsAction(): Promise<AiSettingsView | Failure> {
  if (!(await getCurrentUser())) return { error: "signedOut" };
  return toSettingsView(await getAiConfig());
}

/** `apiKey`: a new key, null to remove it, undefined to keep the saved one. */
export async function saveAiSettingsAction(input: { enabled: boolean; apiKey?: string | null; model: string | null }): Promise<AiSettingsView | Failure> {
  if (!(await getCurrentUser())) return { error: "signedOut" };
  await saveAiConfig(input);
  // Needs review and Insights show their AI buttons only while AI is on.
  revalidatePath("/", "layout");
  return toSettingsView(await getAiConfig());
}

/** The models a key can use — the typed one, else the saved one. */
export async function listAiModelsAction(apiKey?: string): Promise<{ models: string[] } | Failure> {
  if (!(await getCurrentUser())) return { error: "signedOut" };
  const key = apiKey?.trim() || (await getAiConfig()).apiKey;
  if (!key) return { error: "notConfigured" };
  const result = await listModels(key);
  return result.ok ? { models: result.value } : { error: result.error };
}

/** One tiny request with the typed (or saved) key and model, to prove they work. */
export async function testAiConnectionAction(input: { apiKey?: string; model: string | null }): Promise<{ ok: true } | Failure> {
  if (!(await getCurrentUser())) return { error: "signedOut" };
  const apiKey = input.apiKey?.trim() || (await getAiConfig()).apiKey;
  if (!apiKey) return { error: "notConfigured" };
  const result = await generateJson<{ ok: boolean }>(
    { system: "Answer with the JSON asked for.", user: 'Reply with {"ok": true}.' },
    { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } }, required: ["ok"] },
    { apiKey, model: input.model },
  );
  return result.ok ? { ok: true } : { error: result.error };
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
