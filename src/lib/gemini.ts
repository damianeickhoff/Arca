import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";

// The Gemini integration (Google AI Studio, free tier). Server only: the API key lives in
// app_settings and never reaches the browser — clients only learn whether one is set and
// its last four characters. Every call goes through generateJson, which returns a typed
// error instead of throwing so each feature can say what went wrong in its own words.
//
// Free-tier note: Google may use what is sent on the free tier to improve its products,
// so callers send only what a feature needs (merchant text, amounts, category names) and
// never account numbers — see redactForAi.

const API = "https://generativelanguage.googleapis.com/v1beta";

const KEYS = { enabled: "ai_enabled", apiKey: "ai_gemini_key", model: "ai_model" } as const;

export type AiError = "notConfigured" | "invalidKey" | "rateLimited" | "unavailable" | "badResponse";
export type AiResult<T> = { ok: true; value: T } | { ok: false; error: AiError };

export interface AiConfig {
  enabled: boolean;
  apiKey: string | null;
  /** The chosen model id ("gemini-…"), or null to pick a Flash model automatically. */
  model: string | null;
}

/** What the settings panel may see: never the key itself. */
export interface AiSettingsView {
  enabled: boolean;
  hasKey: boolean;
  keyHint: string | null;
  model: string | null;
}

export async function getAiConfig(): Promise<AiConfig> {
  const rows = await db.select().from(appSettings).where(inArray(appSettings.key, Object.values(KEYS)));
  const value = (key: string) => rows.find((r) => r.key === key)?.value || null;
  return { enabled: value(KEYS.enabled) === "1", apiKey: value(KEYS.apiKey), model: value(KEYS.model) };
}

export function toSettingsView(config: AiConfig): AiSettingsView {
  return {
    enabled: config.enabled,
    hasKey: !!config.apiKey,
    keyHint: config.apiKey ? config.apiKey.slice(-4) : null,
    model: config.model,
  };
}

/** AI features show only when switched on and a key is set. */
export async function isAiReady(): Promise<boolean> {
  const config = await getAiConfig();
  return config.enabled && !!config.apiKey;
}

async function setSetting(key: string, value: string | null) {
  if (value == null) {
    await db.delete(appSettings).where(eq(appSettings.key, key));
    return;
  }
  await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

/** Saves the settings; an undefined `apiKey` keeps the stored one, null removes it. */
export async function saveAiConfig(next: { enabled: boolean; apiKey?: string | null; model: string | null }) {
  await setSetting(KEYS.enabled, next.enabled ? "1" : "0");
  if (next.apiKey !== undefined) await setSetting(KEYS.apiKey, next.apiKey?.trim() || null);
  await setSetting(KEYS.model, next.model?.trim() || null);
}

function errorFor(status: number): AiError {
  if (status === 400 || status === 401 || status === 403) return "invalidKey";
  if (status === 429) return "rateLimited";
  return "unavailable";
}

/** Text models this key may call (generateContent), Flash ones first: their free tier is the most generous. */
export async function listModels(apiKey: string): Promise<AiResult<string[]>> {
  let res: Response;
  try {
    res = await fetch(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": apiKey }, cache: "no-store" });
  } catch {
    return { ok: false, error: "unavailable" };
  }
  if (!res.ok) return { ok: false, error: errorFor(res.status) };
  const data = (await res.json().catch(() => null)) as { models?: { name: string; supportedGenerationMethods?: string[] }[] } | null;
  const ids = (data?.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    // Text in, text out only: no image, speech, live or embedding variants.
    .filter((id) => id.startsWith("gemini-") && !/(image|tts|live|audio|transcribe|embedding|banana)/.test(id));
  const rank = (id: string) => (id.includes("flash-lite") ? 1 : id.includes("flash") ? 0 : 2);
  return { ok: true, value: [...new Set(ids)].sort((a, z) => rank(a) - rank(z) || z.localeCompare(a)) };
}

// The automatically picked model, per key, for this server process.
const autoModel = new Map<string, string>();

async function resolveModel(config: AiConfig & { apiKey: string }): Promise<AiResult<string>> {
  if (config.model) return { ok: true, value: config.model };
  const cached = autoModel.get(config.apiKey);
  if (cached) return { ok: true, value: cached };
  const models = await listModels(config.apiKey);
  if (!models.ok) return models;
  if (models.value.length === 0) return { ok: false, error: "unavailable" };
  autoModel.set(config.apiKey, models.value[0]);
  return { ok: true, value: models.value[0] };
}

/**
 * One generateContent call that must answer with JSON matching `schema` (OpenAPI subset,
 * as the API expects). Uses the saved settings unless `override` is given (the settings
 * panel's "Test connection" checks a key before it is saved).
 */
export async function generateJson<T>(
  prompt: { system: string; user: string },
  schema: Record<string, unknown>,
  override?: { apiKey: string; model: string | null },
): Promise<AiResult<T>> {
  const saved = override ? null : await getAiConfig();
  const apiKey = override?.apiKey ?? saved?.apiKey;
  if (!apiKey || (saved && !saved.enabled)) return { ok: false, error: "notConfigured" };
  const model = await resolveModel({ enabled: true, apiKey, model: override ? override.model : saved!.model });
  if (!model.ok) return model;

  let res: Response;
  try {
    res = await fetch(`${API}/models/${encodeURIComponent(model.value)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      cache: "no-store",
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt.system }] },
        contents: [{ role: "user", parts: [{ text: prompt.user }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schema },
      }),
    });
  } catch {
    return { ok: false, error: "unavailable" };
  }
  if (!res.ok) return { ok: false, error: res.status === 404 ? "unavailable" : errorFor(res.status) };

  const data = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false, error: "badResponse" };
  }
}

/**
 * Bank text with what identifies an account taken out: IBANs, card numbers and any long
 * run of digits (references, account numbers) become "…". What's left — the merchant and
 * the free text — is what a category can be guessed from.
 */
export function redactForAi(text: string): string {
  return text
    .replace(/\b[A-Z]{2}\d{2}\s?(?:[A-Z0-9]{4}\s?){2,7}[A-Z0-9]{1,4}\b/gi, "…")
    .replace(/\d[\d\s-]{6,}\d/g, "…")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 140);
}
