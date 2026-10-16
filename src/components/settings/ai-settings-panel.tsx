"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { IconExternalLink, IconPlugConnected, IconSparkles } from "@tabler/icons-react";
import { ClearField, ClearInput } from "@/components/clear/field";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { ClearSelect } from "@/components/settings/accounts/clear-select";
import { SettingsNotice, SettingsSwitchRow } from "@/components/settings/settings-ui";
import {
  getAiSettingsAction,
  listAiModelsAction,
  saveAiSettingsAction,
  testAiConnectionAction,
} from "@/app/actions/ai";
import type { AiSettingsView } from "@/lib/gemini";

type Status = { tone: "success" | "error"; text: string } | null;

/**
 * Settings › AI: switch the Gemini features on, paste an API key from Google AI Studio
 * (free tier), pick a model or leave it on automatic, and test the connection. The saved
 * key never comes back to the browser — only its last four characters.
 */
export function AiSettingsPanel() {
  const t = useTranslations("aiSettings");
  const ids = useId();
  const [saved, setSaved] = useState<AiSettingsView | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [model, setModel] = useState<string>("");
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<"save" | "test" | "models" | null>(null);
  const [status, setStatus] = useState<Status>(null);

  const errorText = (error: string) => (t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.unavailable"));

  async function loadModels(apiKey?: string) {
    setBusy("models");
    const result = await listAiModelsAction(apiKey).catch(() => ({ error: "unavailable" as const }));
    setBusy(null);
    if ("models" in result) setModels(result.models);
    else setStatus({ tone: "error", text: errorText(result.error) });
  }

  useEffect(() => {
    let cancelled = false;
    getAiSettingsAction().then((view) => {
      if (cancelled || "error" in view) return;
      setSaved(view);
      setEnabled(view.enabled);
      setModel(view.model ?? "");
      if (view.hasKey) void loadModels();
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on open
  }, []);

  const typedKey = keyInput.trim();
  const hasKey = !!typedKey || !!saved?.hasKey;

  async function save(next?: { apiKey: null }) {
    setBusy("save");
    setStatus(null);
    const result = await saveAiSettingsAction({
      enabled: enabled && (next?.apiKey === null ? false : hasKey),
      apiKey: next ? next.apiKey : typedKey || undefined,
      model: model || null,
    }).catch(() => ({ error: "unavailable" as const }));
    setBusy(null);
    if ("error" in result) {
      setStatus({ tone: "error", text: errorText(result.error) });
      return;
    }
    setSaved(result);
    setEnabled(result.enabled);
    setKeyInput("");
    if (next?.apiKey === null) setModels([]);
    setStatus({ tone: "success", text: next?.apiKey === null ? t("keyRemoved") : t("saved") });
  }

  async function test() {
    setBusy("test");
    setStatus(null);
    const result = await testAiConnectionAction({ apiKey: typedKey || undefined, model: model || null }).catch(() => ({ error: "unavailable" as const }));
    setBusy(null);
    setStatus("ok" in result ? { tone: "success", text: t("testOk") } : { tone: "error", text: errorText(result.error) });
  }

  if (!saved) return <p role="status" className="px-4 pt-4 font-clear text-sm text-clear-muted">{t("loading")}</p>;

  return (
    <div className="flex flex-col gap-5 px-4 pt-2 pb-2 font-clear text-clear-ink">
      <SettingsSwitchRow
        icon={<IconSparkles stroke={2} />}
        label={t("enable")}
        hint={hasKey ? t("enableHint") : t("enableNeedsKey")}
        checked={enabled && hasKey}
        onCheckedChange={setEnabled}
        disabled={!hasKey}
      />

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
            placeholder={saved.hasKey ? t("keySaved", { last: saved.keyHint ?? "" }) : t("keyPlaceholder")}
            className="min-w-0 flex-1 font-semibold"
          />
          {saved.hasKey && !typedKey && (
            <button type="button" onClick={() => void save({ apiKey: null })} disabled={busy != null} className={clearButtonVariants({ variant: "secondary", size: "lg" })}>
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

      {status && <SettingsNotice tone={status.tone}>{status.text}</SettingsNotice>}

      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" onClick={test} disabled={!hasKey || busy != null} className={clearButtonVariants({ variant: "secondary" })}>
          <IconPlugConnected aria-hidden />
          {busy === "test" ? t("testing") : t("test")}
        </button>
        <button type="button" onClick={() => void save()} disabled={busy != null} className={clearButtonVariants()}>
          {busy === "save" ? t("saving") : t("save")}
        </button>
      </div>
    </div>
  );
}
