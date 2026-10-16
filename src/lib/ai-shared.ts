// Constants shared by the AI features' server code (lib/ai-features.ts) and their client
// components — kept apart because the server modules reach the database.

/** At most this many transactions per category request: one call, well inside free-tier limits. */
export const AI_CATEGORY_BATCH = 30;
