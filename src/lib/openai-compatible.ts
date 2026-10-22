import { parseJsonAnswer, toJsonSchema, validateAgainstSchema, type AiError, type AiResult, type AiSchema } from "@/lib/ai-schema";

// The "Local server" AI provider: any server that speaks the OpenAI chat-completions API
// (Ollama, LM Studio, llama.cpp, vLLM, LocalAI, Open WebUI). Server only, but free of the
// database so it can be tested against a fake fetch: the caller passes the settings in.
//
// A local model follows a JSON format less reliably than Gemini, so every answer is
// checked here: fences and stray prose come off, the JSON is parsed and validated against
// the feature's schema, and one failure earns one retry with the problem spelled out.

export interface LocalAiConnection {
  /** As saved: no trailing slash, with or without "/v1". */
  baseUrl: string;
  apiKey: string | null;
}

export interface LocalAiConfig extends LocalAiConnection {
  model: string;
}

/** Local CPUs are slow: a whole answer can take tens of seconds. */
export const LOCAL_TIMEOUT_MS = 60_000;
const LIST_TIMEOUT_MS = 10_000;

/**
 * A typed address in the form it is saved: trimmed, http:// added when no scheme was
 * given, no trailing slash. Null when it isn't an http(s) address at all.
 */
export function normalizeBaseUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}

/** The OpenAI-style API root: the address with "/v1" appended when it isn't there yet. */
export function apiBase(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return /\/v1$/.test(base) ? base : `${base}/v1`;
}

/** The server root without "/v1", where Ollama's own API lives. */
function serverRoot(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
}

function headers(apiKey: string | null): Record<string, string> {
  return { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) };
}

function errorFor(status: number, message: string): AiError {
  if (status === 401 || status === 403) return "invalidKey";
  if (status === 404) return "modelUnavailable";
  if (status === 429) return "rateLimited";
  if (status === 400 && /model/i.test(message)) return "modelUnavailable";
  if (status === 400 || status === 422) return "badResponse";
  return "unavailable";
}

/** A user message: text, or text plus an image (the receipt photo) as OpenAI content parts. */
export type ChatContent = string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];

type ChatResult = { ok: true; text: string } | { ok: false; error: AiError };

/**
 * One chat-completions request. When the server refuses the request (400) and a
 * `response_format` was sent, it is sent once more without one: older servers don't know
 * structured output, and the prompt asks for JSON anyway.
 */
export async function chatCompletion(
  config: LocalAiConfig,
  messages: { role: "system" | "user"; content: ChatContent }[],
  responseFormat: Record<string, unknown> | null,
  timeoutMs = LOCAL_TIMEOUT_MS,
): Promise<ChatResult> {
  const send = async (format: Record<string, unknown> | null): Promise<ChatResult & { status?: number; message?: string }> => {
    let res: Response;
    try {
      res = await fetch(`${apiBase(config.baseUrl)}/chat/completions`, {
        method: "POST",
        headers: headers(config.apiKey),
        cache: "no-store",
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: 0,
          stream: false,
          ...(format ? { response_format: format } : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      // Refused, unreachable, or the timeout fired.
      return { ok: false, error: "unavailable" };
    }
    const data = (await res.json().catch(() => null)) as {
      choices?: { message?: { content?: string | null } }[];
      error?: { message?: string } | string;
    } | null;
    if (!res.ok) {
      const message = typeof data?.error === "string" ? data.error : (data?.error?.message ?? "");
      // The server's own words, for the server log — never the key.
      console.warn(`[local-ai] ${config.model}: HTTP ${res.status} ${message}`.trim());
      return { ok: false, error: errorFor(res.status, message), status: res.status, message };
    }
    return { ok: true, text: data?.choices?.[0]?.message?.content ?? "" };
  };

  const first = await send(responseFormat);
  if (!first.ok && responseFormat && first.status === 400) {
    const plain = await send(null);
    return plain.ok ? plain : { ok: false, error: plain.error };
  }
  return first.ok ? first : { ok: false, error: first.error };
}

/**
 * Asks the model for JSON matching `schema` and returns it parsed and checked. A root
 * that isn't an object is wrapped in `{ "items": … }` on the wire, because several
 * servers only accept an object at the top of a JSON schema.
 */
export async function generateLocalJson<T>(
  config: LocalAiConfig,
  prompt: { system: string; user: string },
  schema: AiSchema,
): Promise<AiResult<T> & { model?: string }> {
  const wrapped = schema.type.toLowerCase() !== "object";
  const wireSchema: AiSchema = wrapped ? { type: "OBJECT", properties: { items: schema }, required: ["items"] } : schema;
  const jsonSchema = toJsonSchema(wireSchema);
  const system = `${prompt.system}\n\nAnswer with JSON only, matching this JSON schema:\n${JSON.stringify(jsonSchema)}`;
  const format = { type: "json_schema", json_schema: { name: "answer", schema: jsonSchema, strict: true } };

  let user = prompt.user;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await chatCompletion(config, [{ role: "system", content: system }, { role: "user", content: user }], format);
    if (!result.ok) return result;

    const parsed = parseJsonAnswer(result.text);
    let problem = parsed.ok ? null : parsed.error;
    if (parsed.ok) {
      // A model that skipped the wrapper but answered the bare array is fine too.
      const value = wrapped && !Array.isArray(parsed.value) ? (parsed.value as { items?: unknown } | null)?.items : parsed.value;
      problem = validateAgainstSchema(schema, value);
      if (!problem) return { ok: true, value: value as T, model: config.model };
    }
    user = `${prompt.user}\n\nYour previous answer could not be used (${problem}). Answer again with JSON only, matching the schema.`;
  }
  return { ok: false, error: "badResponse" };
}

/**
 * The models the server offers, as plain names: the OpenAI list first, then Ollama's own
 * list for servers whose /v1/models is missing. A refused key stops right there.
 */
export async function listLocalModels(connection: LocalAiConnection): Promise<AiResult<string[]>> {
  const tryList = async (url: string, pick: (data: unknown) => string[] | null): Promise<AiResult<string[]>> => {
    let res: Response;
    try {
      res = await fetch(url, { headers: headers(connection.apiKey), cache: "no-store", signal: AbortSignal.timeout(LIST_TIMEOUT_MS) });
    } catch {
      return { ok: false, error: "unavailable" };
    }
    if (!res.ok) return { ok: false, error: res.status === 401 || res.status === 403 ? "invalidKey" : "unavailable" };
    const names = pick(await res.json().catch(() => null));
    return names ? { ok: true, value: [...new Set(names)].sort((a, z) => a.localeCompare(z)) } : { ok: false, error: "badResponse" };
  };

  const openAi = await tryList(`${apiBase(connection.baseUrl)}/models`, (data) => {
    const list = (data as { data?: { id?: unknown }[] } | null)?.data;
    return Array.isArray(list) ? list.map((m) => m.id).filter((id): id is string => typeof id === "string") : null;
  });
  if (openAi.ok || openAi.error === "invalidKey") return openAi;

  const ollama = await tryList(`${serverRoot(connection.baseUrl)}/api/tags`, (data) => {
    const list = (data as { models?: { name?: unknown; model?: unknown }[] } | null)?.models;
    return Array.isArray(list) ? list.map((m) => m.name ?? m.model).filter((id): id is string => typeof id === "string") : null;
  });
  return ollama.ok ? ollama : openAi;
}
