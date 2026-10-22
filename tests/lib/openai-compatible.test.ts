import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiSchema } from "@/lib/ai-schema";
import { apiBase, chatCompletion, generateLocalJson, listLocalModels, normalizeBaseUrl } from "@/lib/openai-compatible";

type Call = { url: string; init: RequestInit | undefined; body: Record<string, unknown> | null };

/** A fake fetch that answers each call with the next handler's response, and records the calls. */
function fakeFetch(...handlers: ((call: Call) => Response | Promise<Response>)[]) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null };
    calls.push(call);
    const handler = handlers[Math.min(calls.length - 1, handlers.length - 1)];
    return handler(call);
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const answer = (content: string) => json({ choices: [{ message: { role: "assistant", content } }] });

const config = { baseUrl: "http://192.168.2.10:11434", model: "llama3.1:8b", apiKey: null };
const prompt = { system: "Sort these.", user: "1 | Albert Heijn | out | 12.50" };
const okSchema: AiSchema = { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } }, required: ["ok"] };
const listSchema: AiSchema = {
  type: "ARRAY",
  items: { type: "OBJECT", properties: { id: { type: "INTEGER" }, categoryId: { type: "INTEGER" } }, required: ["id", "categoryId"] },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("addresses", () => {
  it("normalises what is typed", () => {
    expect(normalizeBaseUrl("http://192.168.2.10:11434/")).toBe("http://192.168.2.10:11434");
    expect(normalizeBaseUrl("  192.168.2.10:1234 ")).toBe("http://192.168.2.10:1234");
    expect(normalizeBaseUrl("https://ai.home.lan/v1/")).toBe("https://ai.home.lan/v1");
    expect(normalizeBaseUrl("")).toBeNull();
    expect(normalizeBaseUrl("ftp://nas/models")).toBeNull();
    expect(normalizeBaseUrl("http://")).toBeNull();
  });

  it("appends /v1 only when it is missing", () => {
    expect(apiBase("http://host:11434")).toBe("http://host:11434/v1");
    expect(apiBase("http://host:1234/v1")).toBe("http://host:1234/v1");
  });
});

describe("generateLocalJson", () => {
  it("sends a chat-completions request with the schema and returns the JSON", async () => {
    const calls = fakeFetch(answer('{"ok": true}'));
    const result = await generateLocalJson(config, prompt, okSchema);
    expect(result).toEqual({ ok: true, value: { ok: true }, model: "llama3.1:8b" });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://192.168.2.10:11434/v1/chat/completions");
    const body = calls[0].body!;
    expect(body.model).toBe("llama3.1:8b");
    expect(body.temperature).toBe(0);
    expect(body.response_format).toMatchObject({ type: "json_schema", json_schema: { name: "answer", strict: true, schema: { type: "object" } } });
    const messages = body.messages as { role: string; content: string }[];
    expect(messages.map((m) => m.role)).toEqual(["system", "user"]);
    expect(messages[0].content).toContain("Answer with JSON only, matching this JSON schema");
    expect(messages[1].content).toBe(prompt.user);
    // No key saved: no Authorization header.
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("sends the key as a Bearer token when one is set", async () => {
    const calls = fakeFetch(answer('{"ok": true}'));
    await generateLocalJson({ ...config, apiKey: "sk-local" }, prompt, okSchema);
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer sk-local");
  });

  it("reads an answer wrapped in code fences", async () => {
    fakeFetch(answer('```json\n{"ok": true}\n```'));
    expect(await generateLocalJson(config, prompt, okSchema)).toMatchObject({ ok: true, value: { ok: true } });
  });

  it("wraps an array schema in an object on the wire and unwraps the answer", async () => {
    const calls = fakeFetch(answer('{"items": [{"id": 1, "categoryId": 4}]}'));
    const result = await generateLocalJson(config, prompt, listSchema);
    expect(result).toMatchObject({ ok: true, value: [{ id: 1, categoryId: 4 }] });
    const format = calls[0].body!.response_format as { json_schema: { schema: { type: string; required: string[] } } };
    expect(format.json_schema.schema.type).toBe("object");
    expect(format.json_schema.schema.required).toEqual(["items"]);
  });

  it("accepts a bare array when the model skipped the wrapper", async () => {
    fakeFetch(answer('[{"id": 2, "categoryId": 5}]'));
    expect(await generateLocalJson(config, prompt, listSchema)).toMatchObject({ ok: true, value: [{ id: 2, categoryId: 5 }] });
  });

  it("retries once with the problem when the answer doesn't fit, then succeeds", async () => {
    const calls = fakeFetch(answer('{"okay": "yes"}'), answer('{"ok": true}'));
    const result = await generateLocalJson(config, prompt, okSchema);
    expect(result).toMatchObject({ ok: true, value: { ok: true } });
    expect(calls).toHaveLength(2);
    const retryUser = (calls[1].body!.messages as { content: string }[])[1].content;
    expect(retryUser).toContain(prompt.user);
    expect(retryUser).toContain('missing "ok"');
  });

  it("gives up with badResponse after two unusable answers", async () => {
    const calls = fakeFetch(answer("I think the answer is yes."));
    expect(await generateLocalJson(config, prompt, okSchema)).toEqual({ ok: false, error: "badResponse" });
    expect(calls).toHaveLength(2);
  });

  it("maps a refused key to invalidKey", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fakeFetch(json({ error: { message: "Unauthorized" } }, 401));
    expect(await generateLocalJson(config, prompt, okSchema)).toEqual({ ok: false, error: "invalidKey" });
  });

  it("maps a missing model to modelUnavailable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fakeFetch(json({ error: { message: 'model "llama3.1:8b" not found, try pulling it first' } }, 404));
    expect(await generateLocalJson(config, prompt, okSchema)).toEqual({ ok: false, error: "modelUnavailable" });
  });

  it("maps a timeout or refused connection to unavailable", async () => {
    fakeFetch(() => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    expect(await generateLocalJson(config, prompt, okSchema)).toEqual({ ok: false, error: "unavailable" });

    fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    expect(await generateLocalJson(config, prompt, okSchema)).toEqual({ ok: false, error: "unavailable" });
  });

  it("passes a timeout signal to every request", async () => {
    const calls = fakeFetch(answer('{"ok": true}'));
    await generateLocalJson(config, prompt, okSchema);
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("chatCompletion", () => {
  it("sends once more without response_format when the server refuses it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const calls = fakeFetch(json({ error: "response_format is not supported" }, 400), answer('{"ok": true}'));
    const result = await chatCompletion(config, [{ role: "user", content: "hi" }], { type: "json_object" });
    expect(result).toEqual({ ok: true, text: '{"ok": true}' });
    expect(calls).toHaveLength(2);
    expect(calls[0].body!.response_format).toEqual({ type: "json_object" });
    expect(calls[1].body!.response_format).toBeUndefined();
  });
});

describe("listLocalModels", () => {
  it("reads the OpenAI model list", async () => {
    const calls = fakeFetch(json({ object: "list", data: [{ id: "qwen2.5:7b" }, { id: "llama3.1:8b" }, { id: "llama3.1:8b" }] }));
    expect(await listLocalModels(config)).toEqual({ ok: true, value: ["llama3.1:8b", "qwen2.5:7b"] });
    expect(calls[0].url).toBe("http://192.168.2.10:11434/v1/models");
  });

  it("falls back to Ollama's own list when /v1/models fails", async () => {
    const calls = fakeFetch(json({}, 404), json({ models: [{ name: "llava:latest" }, { name: "llama3.1:8b" }] }));
    expect(await listLocalModels({ baseUrl: "http://host:11434/v1", apiKey: null })).toEqual({ ok: true, value: ["llama3.1:8b", "llava:latest"] });
    expect(calls.map((c) => c.url)).toEqual(["http://host:11434/v1/models", "http://host:11434/api/tags"]);
  });

  it("stops at a refused key instead of trying Ollama's list", async () => {
    const calls = fakeFetch(json({}, 401));
    expect(await listLocalModels({ baseUrl: "http://host:1234", apiKey: "wrong" })).toEqual({ ok: false, error: "invalidKey" });
    expect(calls).toHaveLength(1);
  });

  it("reports unavailable when neither list answers", async () => {
    fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    expect(await listLocalModels(config)).toEqual({ ok: false, error: "unavailable" });
  });
});
