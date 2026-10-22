import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { generateGeminiJson } from "@/lib/gemini";
import { generateLocalJson, normalizeBaseUrl, type LocalAiConfig } from "@/lib/openai-compatible";
import type { AiProvider, AiSettingsView, SaveAiSettingsInput } from "@/lib/ai-shared";
import type { AiResult, AiSchema } from "@/lib/ai-schema";

export type { AiError, AiResult, AiSchema } from "@/lib/ai-schema";

// The one seam every AI feature goes through. Settings › AI picks ONE provider for the
// whole app: Google Gemini (lib/gemini.ts) or a local server that speaks the OpenAI API
// (lib/openai-compatible.ts). Server only: the keys live in app_settings and never reach
// the browser — Settings › AI only learns whether one is saved (toAiSettingsView).
//
// Receipt scanning always uses the local server's vision model, whichever provider writes
// the text: photos never go to Gemini.

const KEYS = {
  enabled: "ai_enabled",
  provider: "ai_provider",
  geminiKey: "ai_gemini_key",
  geminiModel: "ai_model",
  localBaseUrl: "ai_local_base_url",
  localModel: "ai_local_model",
  localVisionModel: "ai_local_vision_model",
  localKey: "ai_local_api_key",
} as const;

export interface LocalAiSettings {
  baseUrl: string | null;
  model: string | null;
  visionModel: string | null;
  apiKey: string | null;
}

export interface AiSettings {
  provider: AiProvider;
  enabled: boolean;
  gemini: { apiKey: string | null; model: string | null };
  local: LocalAiSettings;
}

/**
 * Receipt scanning used to be set with OLLAMA_HOST / OLLAMA_VISION_MODEL. Those still fill
 * the address and the vision model while nothing was saved for them, so an existing setup
 * keeps scanning. A saved empty value means "cleared on purpose" and wins over the env.
 */
function envDefaults(): { baseUrl: string | null; visionModel: string | null } {
  const host = process.env.OLLAMA_HOST?.trim();
  const baseUrl = host ? normalizeBaseUrl(host) : null;
  const visionModel = process.env.OLLAMA_VISION_MODEL?.trim() || (baseUrl ? "llava" : null);
  return { baseUrl, visionModel };
}

export async function getAiSettings(): Promise<AiSettings> {
  const rows = await db.select().from(appSettings).where(inArray(appSettings.key, Object.values(KEYS)));
  const stored = (key: string) => rows.find((r) => r.key === key)?.value;
  const value = (key: string) => stored(key) || null;
  // Saved (even empty) beats the env default; a missing row falls back to it.
  const orEnv = (key: string, fallback: string | null) => (stored(key) !== undefined ? value(key) : fallback);
  const env = envDefaults();
  return {
    provider: value(KEYS.provider) === "local" ? "local" : "gemini",
    enabled: value(KEYS.enabled) === "1",
    gemini: { apiKey: value(KEYS.geminiKey), model: value(KEYS.geminiModel) },
    local: {
      baseUrl: orEnv(KEYS.localBaseUrl, env.baseUrl),
      model: value(KEYS.localModel),
      visionModel: orEnv(KEYS.localVisionModel, env.visionModel),
      apiKey: value(KEYS.localKey),
    },
  };
}

/** The provider has what it needs to answer: Gemini a key, the local server an address and a model. */
export function isProviderConfigured(settings: Pick<AiSettings, "provider" | "gemini" | "local">): boolean {
  return settings.provider === "local" ? !!settings.local.baseUrl && !!settings.local.model : !!settings.gemini.apiKey;
}

export function toAiSettingsView(settings: AiSettings): AiSettingsView {
  const hint = (key: string | null) => (key ? key.slice(-4) : null);
  return {
    provider: settings.provider,
    enabled: settings.enabled,
    gemini: { hasKey: !!settings.gemini.apiKey, keyHint: hint(settings.gemini.apiKey), model: settings.gemini.model },
    local: {
      baseUrl: settings.local.baseUrl,
      model: settings.local.model,
      visionModel: settings.local.visionModel,
      hasKey: !!settings.local.apiKey,
      keyHint: hint(settings.local.apiKey),
    },
  };
}

/** AI features show only when switched on and the chosen provider is set up. */
export async function isAiReady(): Promise<boolean> {
  const settings = await getAiSettings();
  return settings.enabled && isProviderConfigured(settings);
}

/** Where receipt photos go: the local server with its vision model, or null when there is none. */
export async function getReceiptScanConfig(): Promise<LocalAiConfig | null> {
  const { local } = await getAiSettings();
  if (!local.baseUrl || !local.visionModel) return null;
  return { baseUrl: local.baseUrl, model: local.visionModel, apiKey: local.apiKey };
}

export async function isReceiptScanReady(): Promise<boolean> {
  return (await getReceiptScanConfig()) !== null;
}

async function setSetting(key: string, value: string | null) {
  if (value == null) {
    await db.delete(appSettings).where(eq(appSettings.key, key));
    return;
  }
  await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

/**
 * Saves Settings › AI. The address is stored normalised (no trailing slash); one that
 * isn't an http(s) address is refused. AI only stays switched on when the chosen
 * provider is set up.
 */
export async function saveAiSettings(input: SaveAiSettingsInput): Promise<{ ok: true } | { ok: false; error: "badAddress" }> {
  const typedUrl = input.local.baseUrl?.trim() ?? "";
  const baseUrl = typedUrl ? normalizeBaseUrl(typedUrl) : null;
  if (typedUrl && !baseUrl) return { ok: false, error: "badAddress" };

  const provider: AiProvider = input.provider === "local" ? "local" : "gemini";
  await setSetting(KEYS.provider, provider);
  if (input.gemini.apiKey !== undefined) await setSetting(KEYS.geminiKey, input.gemini.apiKey?.trim() || null);
  await setSetting(KEYS.geminiModel, input.gemini.model?.trim() || null);
  // Empty is saved as "" (not deleted) so the OLLAMA_* env defaults don't come back.
  await setSetting(KEYS.localBaseUrl, baseUrl ?? "");
  await setSetting(KEYS.localModel, input.local.model?.trim() || null);
  await setSetting(KEYS.localVisionModel, input.local.visionModel?.trim() ?? "");
  if (input.local.apiKey !== undefined) await setSetting(KEYS.localKey, input.local.apiKey?.trim() || null);

  const saved = await getAiSettings();
  await setSetting(KEYS.enabled, input.enabled && isProviderConfigured(saved) ? "1" : "0");
  return { ok: true };
}

/** Settings to try before they are saved (Settings › AI's "Test connection"). */
export type AiOverride =
  | { provider: "gemini"; apiKey: string; model: string | null }
  | { provider: "local"; baseUrl: string; model: string; apiKey: string | null };

/**
 * One request that must answer with JSON matching `schema` (written in Gemini's OpenAPI
 * subset; the local provider converts and validates it). Uses the saved provider and
 * settings unless `override` is given. Returns a typed error instead of throwing, so each
 * feature can say what went wrong in its own words.
 */
export async function generateJson<T>(
  prompt: { system: string; user: string },
  schema: AiSchema,
  override?: AiOverride,
): Promise<AiResult<T> & { model?: string }> {
  if (override?.provider === "gemini") return generateGeminiJson<T>(prompt, schema, { apiKey: override.apiKey, model: override.model });
  if (override?.provider === "local") return generateLocalJson<T>(override, prompt, schema);

  const settings = await getAiSettings();
  if (!settings.enabled || !isProviderConfigured(settings)) return { ok: false, error: "notConfigured" };
  if (settings.provider === "local") {
    const { baseUrl, model, apiKey } = settings.local;
    return generateLocalJson<T>({ baseUrl: baseUrl!, model: model!, apiKey }, prompt, schema);
  }
  return generateGeminiJson<T>(prompt, schema, { apiKey: settings.gemini.apiKey!, model: settings.gemini.model });
}
