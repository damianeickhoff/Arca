/**
 * Checks the Gemini connection outside the app and says per model what Google answers.
 *
 *   npm run ai:check                 # uses the key saved in Settings › AI
 *   GEMINI_API_KEY=… npm run ai:check  # or a key from the environment
 *
 * 1. Lists the models the key may call (the same filter as Settings › AI).
 * 2. Sends each one a tiny JSON request, in the order Automatic mode tries them, and
 *    prints the HTTP status and Google's own message — which says whether a model is
 *    paid only (limit 0), a daily limit is used up, or the key itself is refused.
 *
 * The key is never printed. Talks to SQLite directly like seed-demo-data.ts, read only.
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const API = "https://generativelanguage.googleapis.com/v1beta";
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "finance.db");
const MAX_MODELS = Number(process.env.AI_CHECK_MODELS) || 8;

function savedSetting(key: string): string | null {
  if (!fs.existsSync(DB_PATH)) return null;
  const sqlite = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  try {
    const row = sqlite.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value?: string } | undefined;
    return row?.value || null;
  } finally {
    sqlite.close();
  }
}

// process.exitCode, never process.exit(): exiting while a fetch connection is still
// closing trips a libuv assertion on Windows.

// Same order as listModels in src/lib/gemini.ts.
function modelRank(id: string): number {
  const unstable = /(preview|exp|experimental)/.test(id);
  if (id.endsWith("-latest")) return id.includes("flash-lite") ? 0 : id.includes("flash") ? 1 : 6;
  if (unstable) return id.includes("flash") ? 4 : 7;
  return id.includes("flash-lite") ? 2 : id.includes("flash") ? 3 : 5;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || savedSetting("ai_gemini_key");
  if (!apiKey) {
    console.log("No key found. Save one in Settings › AI, or run with GEMINI_API_KEY set.");
    process.exitCode = 1;
    return;
  }
  const chosen = savedSetting("ai_model");
  console.log(`Key: …${apiKey.slice(-4)} (${process.env.GEMINI_API_KEY ? "from GEMINI_API_KEY" : `saved in ${path.basename(DB_PATH)}`})`);
  console.log(`Model in Settings › AI: ${chosen ?? "Automatic"}`);
  console.log(`AI switched on: ${savedSetting("ai_enabled") === "1" ? "yes" : "no"}\n`);

  const list = await fetch(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": apiKey } });
  const listBody = (await list.json().catch(() => null)) as { models?: { name: string; supportedGenerationMethods?: string[] }[]; error?: { message?: string } } | null;
  if (!list.ok) {
    console.log(`Listing models failed: HTTP ${list.status} ${listBody?.error?.message ?? ""}`);
    console.log("A 400/403 here means Google refuses the key itself: check it in Google AI Studio.");
    process.exitCode = 1;
    return;
  }
  const ids = [
    ...new Set(
      (listBody?.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""))
        .filter((id) => id.startsWith("gemini-") && !/(image|tts|live|audio|transcribe|embedding|banana|robotics|computer-use)/.test(id)),
    ),
  ].sort((a, z) => modelRank(a) - modelRank(z) || z.localeCompare(a, undefined, { numeric: true }));
  console.log(`The key may call ${ids.length} text models. Automatic mode tries them in this order:`);
  console.log(ids.map((id, i) => `  ${i + 1}. ${id}`).join("\n") + "\n");

  const toTry = chosen ? [chosen, ...ids.filter((m) => m !== chosen)] : ids;
  let working: string | null = null;
  for (const model of toTry.slice(0, MAX_MODELS)) {
    const res = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: 'Reply with {"ok": true}.' }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } } } },
      }),
    });
    const body = (await res.json().catch(() => null)) as { error?: { message?: string; details?: { violations?: { quotaId?: string; quotaValue?: string }[] }[] } } | null;
    if (res.ok) {
      console.log(`OK    ${model}`);
      working ??= model;
      continue;
    }
    const quotas = (body?.error?.details ?? []).flatMap((d) => d.violations ?? []).map((v) => `${v.quotaId} = ${v.quotaValue}`);
    console.log(`${res.status}   ${model}`);
    console.log(`      ${(body?.error?.message ?? "").split("\n")[0]}`);
    for (const q of quotas) console.log(`      quota: ${q}`);
  }

  console.log("");
  if (working) console.log(`Works: ${working}. Pick it in Settings › AI (or keep Automatic).`);
  else console.log("No model answered. The messages above say why: 'limit: 0' = not on the free tier for this key, PerDay = used up today, 400/403 = the key or project is refused.");
}

main().catch((error) => {
  console.log(`Couldn't reach Google: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
