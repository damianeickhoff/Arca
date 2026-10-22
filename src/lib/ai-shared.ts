// Constants shared by the AI features' server code (lib/ai-features.ts) and their client
// components — kept apart because the server modules reach the database.

/** At most this many transactions per category request: one call, well inside free-tier limits. */
export const AI_CATEGORY_BATCH = 30;

/** Which AI service answers, for the whole app. */
export type AiProvider = "gemini" | "local";

/** What Settings › AI may see: never a key itself, only whether one is saved and its
 *  last four characters. */
export interface AiSettingsView {
  provider: AiProvider;
  enabled: boolean;
  gemini: { hasKey: boolean; keyHint: string | null; model: string | null };
  local: { baseUrl: string | null; model: string | null; visionModel: string | null; hasKey: boolean; keyHint: string | null };
}

/** What Settings › AI saves. `apiKey`: a new key, null to remove it, undefined to keep the saved one. */
export interface SaveAiSettingsInput {
  provider: AiProvider;
  enabled: boolean;
  gemini: { apiKey?: string | null; model: string | null };
  local: { baseUrl: string | null; model: string | null; visionModel: string | null; apiKey?: string | null };
}
