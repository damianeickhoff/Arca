import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearFixtures, migrateTestDb, removeTestDb } from "../helpers/test-db";
import {
  getAiSettings,
  getReceiptScanConfig,
  isAiReady,
  isReceiptScanReady,
  saveAiSettings,
  toAiSettingsView,
} from "@/lib/ai-provider";
import type { SaveAiSettingsInput } from "@/lib/ai-shared";

beforeAll(migrateTestDb);
afterAll(removeTestDb);
beforeEach(clearFixtures);
afterEach(() => vi.unstubAllEnvs());

const blank: SaveAiSettingsInput = {
  provider: "gemini",
  enabled: false,
  gemini: { model: null },
  local: { baseUrl: null, model: null, visionModel: null },
};

describe("AI settings", () => {
  it("defaults to Gemini, switched off", async () => {
    vi.stubEnv("OLLAMA_HOST", "");
    const settings = await getAiSettings();
    expect(settings.provider).toBe("gemini");
    expect(settings.enabled).toBe(false);
    expect(await isAiReady()).toBe(false);
  });

  it("round-trips the local provider and never shows its key", async () => {
    const saved = await saveAiSettings({
      provider: "local",
      enabled: true,
      gemini: { apiKey: "AIza-gemini-1234", model: null },
      local: { baseUrl: " http://192.168.2.10:11434/ ", model: "llama3.1:8b", visionModel: "llava", apiKey: "sk-local-9876" },
    });
    expect(saved).toEqual({ ok: true });

    const settings = await getAiSettings();
    expect(settings.provider).toBe("local");
    expect(settings.enabled).toBe(true);
    expect(settings.local).toEqual({ baseUrl: "http://192.168.2.10:11434", model: "llama3.1:8b", visionModel: "llava", apiKey: "sk-local-9876" });
    expect(await isAiReady()).toBe(true);

    const view = toAiSettingsView(settings);
    expect(view.local).toEqual({ baseUrl: "http://192.168.2.10:11434", model: "llama3.1:8b", visionModel: "llava", hasKey: true, keyHint: "9876" });
    expect(view.gemini).toEqual({ hasKey: true, keyHint: "1234", model: null });
    expect(JSON.stringify(view)).not.toContain("sk-local");
    expect(JSON.stringify(view)).not.toContain("AIza");
  });

  it("keeps a saved key when none is typed and removes it on null", async () => {
    await saveAiSettings({ ...blank, local: { ...blank.local, apiKey: "sk-keep" } });
    await saveAiSettings(blank);
    expect((await getAiSettings()).local.apiKey).toBe("sk-keep");
    await saveAiSettings({ ...blank, local: { ...blank.local, apiKey: null } });
    expect((await getAiSettings()).local.apiKey).toBeNull();
  });

  it("refuses an address that isn't http(s)", async () => {
    expect(await saveAiSettings({ ...blank, provider: "local", local: { ...blank.local, baseUrl: "ftp://nas" } })).toEqual({ ok: false, error: "badAddress" });
  });

  it("only stays switched on when the chosen provider is set up", async () => {
    await saveAiSettings({ ...blank, provider: "local", enabled: true, local: { ...blank.local, baseUrl: "http://host:11434" } });
    expect((await getAiSettings()).enabled).toBe(false);

    await saveAiSettings({ ...blank, provider: "gemini", enabled: true, gemini: { apiKey: "AIza-x", model: null } });
    expect(await isAiReady()).toBe(true);
    // Switching to an unconfigured local server turns AI off rather than breaking it.
    await saveAiSettings({ ...blank, provider: "local", enabled: true });
    expect(await isAiReady()).toBe(false);
  });

  it("offers receipt scanning only with a local vision model, whatever the provider", async () => {
    vi.stubEnv("OLLAMA_HOST", "");
    await saveAiSettings({ ...blank, provider: "gemini", local: { ...blank.local, baseUrl: "http://host:11434" } });
    expect(await isReceiptScanReady()).toBe(false);

    await saveAiSettings({ ...blank, provider: "gemini", local: { baseUrl: "http://host:11434", model: null, visionModel: "llava", apiKey: "k" } });
    expect(await getReceiptScanConfig()).toEqual({ baseUrl: "http://host:11434", model: "llava", apiKey: "k" });
  });

  it("falls back to OLLAMA_HOST / OLLAMA_VISION_MODEL until the fields are saved", async () => {
    vi.stubEnv("OLLAMA_HOST", "http://ollama:11434/");
    vi.stubEnv("OLLAMA_VISION_MODEL", "llava:13b");
    expect((await getAiSettings()).local).toMatchObject({ baseUrl: "http://ollama:11434", visionModel: "llava:13b" });
    expect(await isReceiptScanReady()).toBe(true);

    // Cleared on purpose in Settings › AI: the env no longer fills them.
    await saveAiSettings(blank);
    expect((await getAiSettings()).local).toMatchObject({ baseUrl: null, visionModel: null });
    expect(await isReceiptScanReady()).toBe(false);
  });
});
