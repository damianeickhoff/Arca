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

export type AiError =
  | "notConfigured"
  | "invalidKey"
  | "rateLimited"
  | "dailyLimit"
  | "noFreeTier"
  | "modelUnavailable"
  | "unavailable"
  | "badResponse";
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

/**
 * What a 429 really means. Google sends the same status for three different things, and
 * says which in the body (QuotaFailure + RetryInfo details, and the message):
 *   - "noFreeTier": this model's free-tier quota is 0 — it is paid only. Another model may work.
 *   - "dailyLimit": a per-day quota is used up — waiting a minute won't help.
 *   - "rateLimited": a per-minute quota — fine again after `retryAfter` seconds.
 */
export function readQuotaError(body: unknown): { error: "noFreeTier" | "dailyLimit" | "rateLimited"; retryAfter: number | null } {
  const err = (body as { error?: { message?: string; details?: unknown[] } } | null)?.error;
  const message = err?.message ?? "";
  const details = Array.isArray(err?.details) ? (err.details as Record<string, unknown>[]) : [];

  const violations = details.flatMap((d) => (Array.isArray(d.violations) ? (d.violations as Record<string, unknown>[]) : []));
  const quotaIds = violations.map((v) => String(v.quotaId ?? v.quotaMetric ?? ""));
  const zeroQuota = violations.some((v) => String(v.quotaValue ?? "") === "0") || /limit:\s*0\b/.test(message);

  const delay = details.map((d) => d.retryDelay).find((v) => typeof v === "string") as string | undefined;
  const seconds = delay ? parseFloat(delay) : parseFloat(/retry in ([\d.]+)s/i.exec(message)?.[1] ?? "");
  const retryAfter = Number.isFinite(seconds) ? Math.ceil(seconds) : null;

  if (zeroQuota) return { error: "noFreeTier", retryAfter: null };
  if (quotaIds.some((id) => /PerDay/i.test(id))) return { error: "dailyLimit", retryAfter: null };
  return { error: "rateLimited", retryAfter };
}

/**
 * Text models this key may call (generateContent), in the order automatic mode tries
 * them: the "-latest" aliases Google keeps pointed at a current free model first, then
 * stable Flash-Lite and Flash (the most generous free tiers), then previews and the rest.
 */
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
    .filter((id) => id.startsWith("gemini-") && !/(image|tts|live|audio|transcribe|embedding|banana|robotics|computer-use)/.test(id));
  return { ok: true, value: [...new Set(ids)].sort((a, z) => modelRank(a) - modelRank(z) || z.localeCompare(a, undefined, { numeric: true })) };
}

function modelRank(id: string): number {
  const unstable = /(preview|exp|experimental)/.test(id);
  if (id.endsWith("-latest")) return id.includes("flash-lite") ? 0 : id.includes("flash") ? 1 : 6;
  if (unstable) return id.includes("flash") ? 4 : 7;
  return id.includes("flash-lite") ? 2 : id.includes("flash") ? 3 : 5;
}

/** At most this many models are tried in automatic mode before giving up. */
const AUTO_MODEL_TRIES = 6;

// The model automatic mode settled on, per key, for this server process — so only the
// first request after a start pays for finding it.
const autoModel = new Map<string, string>();

async function candidateModels(apiKey: string, chosen: string | null): Promise<AiResult<string[]>> {
  if (chosen) return { ok: true, value: [chosen] };
  const models = await listModels(apiKey);
  if (!models.ok) return models;
  if (models.value.length === 0) return { ok: false, error: "unavailable" };
  const known = autoModel.get(apiKey);
  const ordered = known ? [known, ...models.value.filter((m) => m !== known)] : models.value;
  return { ok: true, value: ordered.slice(0, AUTO_MODEL_TRIES) };
}

type CallResult = { ok: true; text: string } | { ok: false; error: AiError; retryAfter?: number | null };

async function callModel(apiKey: string, model: string, body: string): Promise<CallResult> {
  let res: Response;
  try {
    res = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      cache: "no-store",
      body,
    });
  } catch {
    return { ok: false, error: "unavailable" };
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // The reason, for the server log — Google's own words, never the key.
    console.warn(`[gemini] ${model}: HTTP ${res.status} ${(data as { error?: { message?: string } } | null)?.error?.message ?? ""}`.trim());
    if (res.status === 429) return { ok: false, ...readQuotaError(data) };
    // 404: the model is gone or not offered to this key — automatic mode moves on.
    return { ok: false, error: res.status === 404 ? "modelUnavailable" : errorFor(res.status) };
  }
  const parts = (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null)?.candidates?.[0]?.content?.parts;
  return { ok: true, text: parts?.map((p) => p.text ?? "").join("") ?? "" };
}

/**
 * One generateContent call that must answer with JSON matching `schema` (OpenAPI subset,
 * as the API expects). Uses the saved settings unless `override` is given (the settings
 * panel's "Test connection" checks a key before it is saved). In automatic mode a model
 * without free quota (or not offered to this key) is skipped for the next one; a short
 * per-minute wait is retried once.
 */
export async function generateJson<T>(
  prompt: { system: string; user: string },
  schema: Record<string, unknown>,
  override?: { apiKey: string; model: string | null },
): Promise<AiResult<T> & { model?: string }> {
  const saved = override ? null : await getAiConfig();
  const apiKey = override?.apiKey ?? saved?.apiKey;
  if (!apiKey || (saved && !saved.enabled)) return { ok: false, error: "notConfigured" };
  const chosen = override ? override.model : saved!.model;
  const candidates = await candidateModels(apiKey, chosen);
  if (!candidates.ok) return candidates;

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: prompt.system }] },
    contents: [{ role: "user", parts: [{ text: prompt.user }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: schema },
  });

  let last: AiError = "unavailable";
  for (const model of candidates.value) {
    let result = await callModel(apiKey, model, body);
    const wait = !result.ok && result.error === "rateLimited" ? result.retryAfter : null;
    if (wait != null && wait <= 10) {
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
      result = await callModel(apiKey, model, body);
    }
    if (result.ok) {
      if (!chosen) autoModel.set(apiKey, model);
      try {
        return { ok: true, value: JSON.parse(result.text) as T, model };
      } catch {
        return { ok: false, error: "badResponse" };
      }
    }
    last = result.error;
    // Only "this model can't be used" is worth another model; anything else (a bad key,
    // a used-up limit, no connection) would fail the same way on the next one.
    if (chosen || (result.error !== "noFreeTier" && result.error !== "modelUnavailable")) break;
    if (autoModel.get(apiKey) === model) autoModel.delete(apiKey);
  }
  return { ok: false, error: last };
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
