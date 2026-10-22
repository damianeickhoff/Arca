"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { IconExternalLink, IconList, IconPlugConnected, IconSparkles } from "@tabler/icons-react";
import { ClearField, ClearInput } from "@/components/clear/field";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { Segmented } from "@/components/clear/segmented";
import { ClearSelect } from "@/components/settings/accounts/clear-select";
import { SettingsNotice, SettingsSwitchRow } from "@/components/settings/settings-ui";
import { AnchoredTip } from "@/components/anchored-tip";
import {
  getAiSettingsAction,
  listAiModelsAction,
  saveAiSettingsAction,
  testAiConnectionAction,
} from "@/app/actions/ai";
import type { AiProvider, AiSettingsView } from "@/lib/ai-shared";

type Status = { tone: "success" | "error"; text: string } | null;

/**
 * Settings › AI: pick ONE provider for the whole app — Google Gemini (a free API key from
 * Google AI Studio) or a local server that speaks the OpenAI API (Ollama, LM Studio, …) —
 * switch the AI features on, and test the connection. Saved keys never come back to the
 * browser, only their last four characters. Receipt scanning always uses the local
 * server's vision model, so that field is saved whichever provider is chosen.
 * Admin-only to change (app-wide, and it makes the server call out): everyone else sees
 * the current provider and state with the controls disabled.
 */
export function AiSettingsPanel({ canManage }: { canManage: boolean }) {
  const t = useTranslations("aiSettings");
  const ids = useId();
  const [saved, setSaved] = useState<AiSettingsView | null>(null);
  const [provider, setProvider] = useState<AiProvider>("gemini");
  const [enabled, setEnabled] = useState(false);
  // Gemini
  const [keyInput, setKeyInput] = useState("");
  const [model, setModel] = useState<string>("");
  const [models, setModels] = useState<string[]>([]);
  // Local server
  const [baseUrl, setBaseUrl] = useState("");
  const [localModel, setLocalModel] = useState("");
  const [visionModel, setVisionModel] = useState("");
  const [localKeyInput, setLocalKeyInput] = useState("");
  const [localModels, setLocalModels] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | "models" | null>(null);
  const [status, setStatus] = useState<Status>(null);

  // The local server has its own wording for the errors it shares with Gemini.
  const errorText = (error: string, on: AiProvider = provider) =>
    on === "local" && t.has(`local.errors.${error}`)
      ? t(`local.errors.${error}`)
      : t.has(`errors.${error}`)
        ? t(`errors.${error}`)
        : t("errors.unavailable");

  async function loadModels(apiKey?: string) {
    setBusy("models");
    const result = await listAiModelsAction({ provider: "gemini", apiKey }).catch(() => ({ error: "unavailable" as const }));
    setBusy(null);
    if ("models" in result) setModels(result.models);
    else setStatus({ tone: "error", text: errorText(result.error, "gemini") });
  }

  async function loadLocalModels(input?: { baseUrl: string; apiKey: string }) {
    setBusy("models");
    setStatus(null);
    const result = await listAiModelsAction({ provider: "local", ...input }).catch(() => ({ error: "unavailable" as const }));
    setBusy(null);
    if ("models" in result) {
      setLocalModels(result.models);
      if (result.models.length === 0) setStatus({ tone: "error", text: t("local.noModels") });
    } else {
      // The typed fallback takes over: the fields stay plain text inputs.
      setLocalModels(null);
      setStatus({ tone: "error", text: errorText(result.error, "local") });
    }
  }

  useEffect(() => {
    let cancelled = false;
    getAiSettingsAction().then((view) => {
      if (cancelled || "error" in view) return;
      setSaved(view);
      setProvider(view.provider);
      setEnabled(view.enabled);
      setModel(view.gemini.model ?? "");
      setBaseUrl(view.local.baseUrl ?? "");
      setLocalModel(view.local.model ?? "");
      setVisionModel(view.local.visionModel ?? "");
      // Listing models calls out, which only an admin may make the server do.
      if (!canManage) return;
      if (view.provider === "gemini" && view.gemini.hasKey) void loadModels();
      if (view.provider === "local" && view.local.baseUrl) void loadLocalModels();
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on open
  }, []);

  const typedKey = keyInput.trim();
  const typedLocalKey = localKeyInput.trim();
  const hasKey = !!typedKey || !!saved?.gemini.hasKey;
  const localReady = !!baseUrl.trim() && !!localModel.trim();
  const ready = provider === "local" ? localReady : hasKey;
  // The current form, for "Load models" and "Test connection" before it is saved.
  const localInput = { baseUrl: baseUrl.trim(), apiKey: typedLocalKey };

  function switchProvider(next: AiProvider) {
    setProvider(next);
    setStatus(null);
    if (next === "local" && localModels === null && baseUrl.trim()) void loadLocalModels(localInput);
    if (next === "gemini" && models.length === 0 && hasKey) void loadModels(typedKey || undefined);
  }

  async function save(next?: { removeKey: AiProvider }) {
    setBusy("save");
    setStatus(null);
    const removeGemini = next?.removeKey === "gemini";
    const removeLocal = next?.removeKey === "local";
    const result = await saveAiSettingsAction({
      provider,
      enabled: enabled && !(removeGemini && provider === "gemini") && ready,
      gemini: { apiKey: removeGemini ? null : typedKey || undefined, model: model || null },
      local: {
        baseUrl: baseUrl.trim() || null,
        model: localModel.trim() || null,
        visionModel: visionModel.trim() || null,
        apiKey: removeLocal ? null : typedLocalKey || undefined,
      },
    }).catch(() => ({ error: "unavailable" as const }));
    setBusy(null);
    if ("error" in result) {
      setStatus({ tone: "error", text: errorText(result.error) });
      return;
    }
    setSaved(result);
    setEnabled(result.enabled);
    setBaseUrl(result.local.baseUrl ?? "");
    setKeyInput("");
    setLocalKeyInput("");
    if (removeGemini) setModels([]);
    setStatus({
      tone: "success",
      text: removeGemini ? t("keyRemoved") : removeLocal ? t("local.keyRemoved") : t("saved"),
    });
  }

  async function test() {
    setBusy("test");
    setStatus(null);
    const result = await testAiConnectionAction(
      provider === "local"
        ? { provider: "local", ...localInput, model: localModel.trim() || null }
        : { provider: "gemini", apiKey: typedKey || undefined, model: model || null },
    ).catch(() => ({ error: "unavailable" as const }));
    setBusy(null);
    if (!("ok" in result)) {
      setStatus({ tone: "error", text: errorText(result.error) });
      return;
    }
    // Gemini's automatic mode may have skipped models without free quota: say which one
    // answered. A local server without a chosen model was only asked for its list.
    const text = result.model
      ? t("testOkModel", { model: result.model })
      : result.modelCount != null
        ? t("local.testOkList", { count: result.modelCount })
        : t("testOk");
    setStatus({ tone: "success", text });
    if (provider === "local" && localModels === null) void loadLocalModels(localInput);
  }

  if (!saved) return <p role="status" className="px-4 pt-4 font-clear text-sm text-clear-muted">{t("loading")}</p>;

  /** A model field: a list once the server sent one, a typed name otherwise. */
  const modelField = (field: { id: string; label: string; hint: string; value: string; onChange: (v: string) => void; empty: string }) => (
    <div className="flex flex-col gap-1.5">
      {localModels && localModels.length > 0 ? (
        <>
          <span id={field.id} className="text-[13px] font-bold text-clear-ink-2">{field.label}</span>
          <ClearSelect
            value={field.value}
            onChange={field.onChange}
            ariaLabelledBy={field.id}
            options={[
              { value: "", label: field.empty },
              // A saved model the server no longer lists stays selectable.
              ...(field.value && !localModels.includes(field.value) ? [{ value: field.value, label: field.value }] : []),
              ...localModels.map((m) => ({ value: m, label: m })),
            ]}
          />
        </>
      ) : (
        <>
          <label htmlFor={field.id} className="text-[13px] font-bold text-clear-ink-2">{field.label}</label>
          <ClearInput
            id={field.id}
            autoComplete="off"
            spellCheck={false}
            value={field.value}
            onChange={(e) => field.onChange(e.target.value)}
            placeholder={t("local.modelPlaceholder")}
            className="font-semibold"
          />
        </>
      )}
      <span className="text-[13px] text-clear-muted">{field.hint}</span>
    </div>
  );

  return (
    // A disabled fieldset turns off every input and button inside for non-admins.
    <fieldset disabled={!canManage} className="m-0 flex min-w-0 flex-col gap-5 border-0 px-4 pt-2 pb-2 font-clear text-clear-ink">
      {!canManage && <SettingsNotice tone="info">{t("adminOnly")}</SettingsNotice>}
      <div data-tip-anchor="aiProvider" className="self-start">
        <Segmented<AiProvider>
          label={t("provider")}
          surface="tile"
          value={provider}
          onChange={switchProvider}
          items={[
            { value: "gemini", label: t("providers.gemini") },
            { value: "local", label: t("providers.local") },
          ]}
        />
      </div>
      <AnchoredTip id="aiProvider" anchor="aiProvider" active={canManage} />

      <SettingsSwitchRow
        icon={<IconSparkles stroke={2} />}
        label={t("enable")}
        hint={ready ? t("enableHint") : provider === "local" ? t("local.enableNeedsServer") : t("enableNeedsKey")}
        checked={enabled && ready}
        onCheckedChange={setEnabled}
        disabled={!ready}
      />

      {provider === "gemini" ? (
        <>
          <ClearField
            label={t("key")}
            htmlFor={`${ids}-key`}
            hint={
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-clear-ink-2 underline">
                {t("keyHelp")}
                <IconExternalLink aria-hidden size={14} stroke={2} />
              </a>
            }
          >
            <div className="flex gap-2">
              <ClearInput
                id={`${ids}-key`}
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onBlur={() => typedKey && void loadModels(typedKey)}
                placeholder={saved.gemini.hasKey ? t("keySaved", { last: saved.gemini.keyHint ?? "" }) : t("keyPlaceholder")}
                className="min-w-0 flex-1 font-semibold"
              />
              {saved.gemini.hasKey && !typedKey && (
                <button type="button" onClick={() => void save({ removeKey: "gemini" })} disabled={busy != null} className={clearButtonVariants({ variant: "secondary", size: "lg" })}>
                  {t("removeKey")}
                </button>
              )}
            </div>
          </ClearField>

          <div className="flex flex-col gap-1.5">
            <span id={`${ids}-model`} className="text-[13px] font-bold text-clear-ink-2">{t("model")}</span>
            <ClearSelect
              value={model}
              onChange={setModel}
              ariaLabelledBy={`${ids}-model`}
              options={[
                { value: "", label: t("modelAuto") },
                // A saved model the list no longer offers stays selectable.
                ...(model && !models.includes(model) ? [{ value: model, label: model }] : []),
                ...models.map((m) => ({ value: m, label: m })),
              ]}
            />
            <span className="text-[13px] text-clear-muted">{busy === "models" ? t("modelsLoading") : t("modelHint")}</span>
          </div>

          <SettingsNotice tone="info">{t("privacy")}</SettingsNotice>
          <p className="m-0 text-[13px] text-clear-muted">{t("receiptsOnLocal")}</p>
        </>
      ) : (
        <>
          <ClearField label={t("local.address")} htmlFor={`${ids}-address`} hint={t("local.addressHint")}>
            <div className="flex gap-2">
              <ClearInput
                id={`${ids}-address`}
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={t("local.addressPlaceholder")}
                className="min-w-0 flex-1 font-semibold"
              />
              <button
                type="button"
                onClick={() => void loadLocalModels(localInput)}
                disabled={!baseUrl.trim() || busy != null}
                className={clearButtonVariants({ variant: "secondary", size: "lg" })}
              >
                <IconList aria-hidden />
                {busy === "models" ? t("local.loadingModels") : t("local.loadModels")}
              </button>
            </div>
          </ClearField>

          {modelField({
            id: `${ids}-local-model`,
            label: t("model"),
            hint: localModels && localModels.length > 0 ? t("local.modelHint") : t("local.modelTypedHint"),
            value: localModel,
            onChange: setLocalModel,
            empty: t("local.modelChoose"),
          })}

          {modelField({
            id: `${ids}-vision-model`,
            label: t("local.visionModel"),
            hint: t("local.visionModelHint"),
            value: visionModel,
            onChange: setVisionModel,
            empty: t("local.visionModelNone"),
          })}

          <ClearField label={t("local.key")} htmlFor={`${ids}-local-key`} hint={t("local.keyHint")}>
            <div className="flex gap-2">
              <ClearInput
                id={`${ids}-local-key`}
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={localKeyInput}
                onChange={(e) => setLocalKeyInput(e.target.value)}
                placeholder={saved.local.hasKey ? t("keySaved", { last: saved.local.keyHint ?? "" }) : t("local.keyPlaceholder")}
                className="min-w-0 flex-1 font-semibold"
              />
              {saved.local.hasKey && !typedLocalKey && (
                <button type="button" onClick={() => void save({ removeKey: "local" })} disabled={busy != null} className={clearButtonVariants({ variant: "secondary", size: "lg" })}>
                  {t("removeKey")}
                </button>
              )}
            </div>
          </ClearField>

          <SettingsNotice tone="info">{t("local.privacy")}</SettingsNotice>
        </>
      )}

      {status && <SettingsNotice tone={status.tone}>{status.text}</SettingsNotice>}

      <div className="flex flex-wrap justify-end gap-2.5">
        <button
          type="button"
          onClick={test}
          disabled={(provider === "local" ? !baseUrl.trim() : !hasKey) || busy != null}
          className={clearButtonVariants({ variant: "secondary" })}
        >
          <IconPlugConnected aria-hidden />
          {busy === "test" ? t("testing") : t("test")}
        </button>
        <button type="button" onClick={() => void save()} disabled={busy != null} className={clearButtonVariants()}>
          {busy === "save" ? t("saving") : t("save")}
        </button>
      </div>
    </fieldset>
  );
}
