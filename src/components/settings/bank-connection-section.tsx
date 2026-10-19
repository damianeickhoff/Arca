"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  IconBuildingBank,
  IconExternalLink,
  IconLink,
  IconPlugConnected,
  IconPlus,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { ClearChip } from "@/components/clear/chip";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearField, ClearInput } from "@/components/clear/field";
import { IconTile } from "@/components/clear/icon-tile";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { ClearSelect } from "@/components/settings/accounts/clear-select";
import { RowIconButton, SettingsEmpty, SettingsNotice, SettingsSearch, SettingsSection } from "@/components/settings/settings-ui";
import { AnchoredTip } from "@/components/anchored-tip";
import {
  disconnectBankAction,
  getBankPanelAction,
  listBankChoicesAction,
  saveAccountLinksAction,
  saveBankSettingsAction,
  startBankConnectAction,
  syncBankAction,
  testBankConnectionAction,
  type BankPanelData,
} from "@/app/actions/bank";
import type { AspspOption, BankConnectionView, BankSyncSummary, SyncOutcome } from "@/lib/bank-sync";
import { maskAccountNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type Status = { tone: "success" | "error" | "warning"; text: string } | null;

/** Error codes the actions and the callback answer with; anything else reads as "unavailable". */
const ERRORS = ["notConfigured", "invalidKey", "unauthorized", "sessionExpired", "rateLimited", "badRequest", "unavailable", "busy", "expired", "unknownState", "denied", "signedOut"] as const;

function useErrorText() {
  const t = useTranslations("bankConnection.errors");
  return (code: string) => ((ERRORS as readonly string[]).includes(code) ? t(code as (typeof ERRORS)[number]) : t("unavailable"));
}

function useDates() {
  const locale = useLocale();
  return useMemo(() => {
    const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
    const moment = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    return { day: (iso: string) => day.format(new Date(iso)), moment: (iso: string) => moment.format(new Date(iso)) };
  }, [locale]);
}

/**
 * Settings › Import › Bank connection: the Enable Banking application id and private
 * key (the saved key never comes back to the browser), a Test of both, the connected
 * banks with their consent expiry, Connect a bank, Sync now and the account mapping.
 * The callback lands here with ?bank=<id> (open the mapping) or ?bankError=<code>.
 */
export function BankConnectionSection() {
  const t = useTranslations("bankConnection");
  const errorText = useErrorText();
  const [data, setData] = useState<BankPanelData | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [mappingId, setMappingId] = useState<number | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [syncing, setSyncing] = useState<number | "all" | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const fromCallback = Number(params.get("bank"));
    const callbackError = params.get("bankError");
    if (params.has("bank") || callbackError) {
      // Read once: a reload must not reopen the dialog or repeat the message.
      params.delete("bank");
      params.delete("bankError");
      const query = params.toString();
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }
    getBankPanelAction().then((result) => {
      if (cancelled || "error" in result) return;
      setData(result);
      if (callbackError) setStatus({ tone: "error", text: errorText(callbackError) });
      else if (Number.isInteger(fromCallback) && result.connections.some((c) => c.id === fromCallback)) setMappingId(fromCallback);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on open
  }, []);

  function syncText(summary: BankSyncSummary) {
    if (summary.error) return errorText(summary.error);
    return t("syncResult", { imported: summary.imported, already: summary.alreadyThere });
  }

  function reportSync(outcome: SyncOutcome) {
    if (!outcome.ok) {
      setStatus({ tone: "warning", text: errorText(outcome.error) });
      return;
    }
    const expired = outcome.results.filter((r) => r.summary.error === "expired").length;
    const failed = outcome.results.find((r) => r.summary.error && r.summary.error !== "expired");
    const imported = outcome.results.reduce((n, r) => n + r.summary.imported, 0);
    const already = outcome.results.reduce((n, r) => n + r.summary.alreadyThere, 0);
    if (failed) setStatus({ tone: "error", text: errorText(failed.summary.error!) });
    else if (expired > 0) setStatus({ tone: "warning", text: t("expiredPrompt") });
    else setStatus({ tone: "success", text: t("syncResult", { imported, already }) });
  }

  async function sync(connectionId?: number) {
    setSyncing(connectionId ?? "all");
    setStatus(null);
    const result = await syncBankAction(connectionId).catch(() => ({ error: "unavailable" as const }));
    setSyncing(null);
    if ("error" in result) {
      setStatus({ tone: "error", text: errorText(result.error) });
      return;
    }
    setData(result.data);
    reportSync(result.outcome);
  }

  if (!data) return <p role="status" className="font-clear text-sm text-clear-muted">{t("loading")}</p>;

  const configured = !!data.settings.applicationId && data.settings.hasKey;
  const mapping = data.connections.find((c) => c.id === mappingId) ?? null;

  return (
    <SettingsSection title={t("title")} subtitle={t("subtitle")} className="pb-6">
      <CredentialsForm data={data} onSaved={setData} />

      {data.connections.length === 0 ? (
        <SettingsEmpty
          icon={<IconBuildingBank stroke={2} />}
          action={
            <button
              type="button"
              data-tip-anchor="bankConnect"
              disabled={!configured}
              onClick={() => setConnectOpen(true)}
              className={clearButtonVariants()}
            >
              <IconPlus aria-hidden />
              {t("connect")}
            </button>
          }
        >
          {configured ? t("empty") : t("emptyNeedsKey")}
        </SettingsEmpty>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <h4 className="m-0 text-[15px] font-bold">{t("connectedTitle")}</h4>
            <div className="flex flex-wrap gap-2">
              {data.connections.length > 1 && (
                <button type="button" onClick={() => void sync()} disabled={syncing != null} className={clearButtonVariants({ variant: "secondary", size: "sm" })}>
                  <IconRefresh aria-hidden className={cn(syncing === "all" && "animate-spin")} />
                  {syncing === "all" ? t("syncing") : t("syncAll")}
                </button>
              )}
              <button
                type="button"
                data-tip-anchor="bankConnect"
                disabled={!configured}
                onClick={() => setConnectOpen(true)}
                className={clearButtonVariants({ size: "sm" })}
              >
                <IconPlus aria-hidden />
                {t("connect")}
              </button>
            </div>
          </div>
          {data.connections.map((connection) => (
            <ConnectionTile
              key={connection.id}
              connection={connection}
              syncing={syncing}
              lastResultText={connection.lastResult ? syncText(connection.lastResult) : null}
              onSync={() => void sync(connection.id)}
              onMap={() => setMappingId(connection.id)}
              onChanged={setData}
              onError={(code) => setStatus({ tone: "error", text: errorText(code) })}
            />
          ))}
          <p className="m-0 text-[13px] text-clear-muted">{t("dailyNote")}</p>
        </div>
      )}

      {status && <SettingsNotice tone={status.tone}>{status.text}</SettingsNotice>}

      <ConnectBankDialog open={connectOpen} onClose={() => setConnectOpen(false)} />
      {mapping && (
        <AccountMappingDialog
          connection={mapping}
          banks={data.banks}
          onClose={() => setMappingId(null)}
          onSaved={(next, outcome) => {
            setData(next);
            setMappingId(null);
            if (outcome) reportSync(outcome);
          }}
        />
      )}
      <AnchoredTip id="bankConnection" anchor="bankConnect" active={configured} />
    </SettingsSection>
  );
}

// ─── Application id + private key ─────────────────────────────────────────────

function CredentialsForm({ data, onSaved }: { data: BankPanelData; onSaved: (data: BankPanelData) => void }) {
  const t = useTranslations("bankConnection");
  const errorText = useErrorText();
  const ids = useId();
  const saved = data.settings;
  const [appId, setAppId] = useState(saved.applicationId ?? "");
  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [status, setStatus] = useState<Status>(null);
  // Folded away once both are saved; "Change" opens it again.
  const [editing, setEditing] = useState(!saved.applicationId || !saved.hasKey);

  const typedKey = keyInput.trim();
  const canTest = (!!appId.trim() || !!saved.applicationId) && (!!typedKey || saved.hasKey);

  async function save(next?: { privateKey: null }) {
    setBusy("save");
    setStatus(null);
    const result = await saveBankSettingsAction({
      applicationId: appId.trim() || null,
      privateKey: next ? next.privateKey : typedKey || undefined,
    }).catch(() => ({ error: "unavailable" as const }));
    setBusy(null);
    if ("error" in result) {
      setStatus({ tone: "error", text: errorText(result.error) });
      return;
    }
    onSaved(result);
    setKeyInput("");
    setStatus({ tone: "success", text: next ? t("keyRemoved") : t("saved") });
    if (!next && result.settings.applicationId && result.settings.hasKey) setEditing(false);
  }

  async function test() {
    setBusy("test");
    setStatus(null);
    const result = await testBankConnectionAction({ applicationId: appId.trim() || undefined, privateKey: typedKey || undefined }).catch(() => ({ error: "unavailable" as const }));
    setBusy(null);
    if ("error" in result) {
      setStatus({ tone: "error", text: errorText(result.error) });
      return;
    }
    setStatus({ tone: "success", text: t("testOk", { name: result.name ?? "", environment: result.environment ?? "" }) });
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3.5 rounded-clear-tile bg-clear-tile px-4 py-3.5">
          <IconTile tone="mint" size="sm"><IconPlugConnected stroke={2} /></IconTile>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-bold">{t("credentialsSaved")}</span>
            <span className="truncate text-[13px] text-clear-muted">{t("applicationIdShort", { id: saved.applicationId ?? "" })}</span>
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={test} disabled={busy != null} className={clearButtonVariants({ variant: "surface", size: "sm" })}>
              {busy === "test" ? t("testing") : t("test")}
            </button>
            <button type="button" onClick={() => setEditing(true)} className={clearButtonVariants({ variant: "surface", size: "sm" })}>
              {t("change")}
            </button>
          </div>
        </div>
        {status && <SettingsNotice tone={status.tone}>{status.text}</SettingsNotice>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ClearField
        label={t("applicationId")}
        htmlFor={`${ids}-app`}
        hint={
          <a href="https://enablebanking.com/cp/applications" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-clear-ink-2 underline">
            {t("applicationIdHelp")}
            <IconExternalLink aria-hidden size={14} stroke={2} />
          </a>
        }
      >
        <ClearInput
          id={`${ids}-app`}
          autoComplete="off"
          spellCheck={false}
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          placeholder={t("applicationIdPlaceholder")}
          className="font-semibold"
        />
      </ClearField>

      <ClearField label={t("privateKey")} htmlFor={`${ids}-key`} hint={t("privateKeyHint")}>
        <textarea
          id={`${ids}-key`}
          autoComplete="off"
          spellCheck={false}
          rows={5}
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder={saved.hasKey ? t("privateKeySaved") : t("privateKeyPlaceholder")}
          className="w-full resize-y rounded-clear-row border-[1.5px] border-transparent bg-clear-tile px-4 py-3 font-mono text-[13px] text-clear-ink outline-none transition-colors placeholder:font-clear placeholder:text-[15px] placeholder:text-clear-placeholder focus:border-clear-ink"
        />
      </ClearField>

      {status && <SettingsNotice tone={status.tone}>{status.text}</SettingsNotice>}

      <div className="flex flex-wrap items-center gap-2.5">
        {saved.hasKey && !typedKey && (
          <button type="button" onClick={() => void save({ privateKey: null })} disabled={busy != null} className={clearButtonVariants({ variant: "danger" })}>
            {t("removeKey")}
          </button>
        )}
        <span className="flex-1" />
        {saved.applicationId && saved.hasKey && (
          <button type="button" onClick={() => setEditing(false)} disabled={busy != null} className={clearButtonVariants({ variant: "ghost" })}>
            {t("cancel")}
          </button>
        )}
        <button type="button" onClick={test} disabled={!canTest || busy != null} className={clearButtonVariants({ variant: "secondary" })}>
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

// ─── One connected bank ───────────────────────────────────────────────────────

function ConnectionTile({
  connection,
  syncing,
  lastResultText,
  onSync,
  onMap,
  onChanged,
  onError,
}: {
  connection: BankConnectionView;
  syncing: number | "all" | null;
  lastResultText: string | null;
  onSync: () => void;
  onMap: () => void;
  onChanged: (data: BankPanelData) => void;
  onError: (code: string) => void;
}) {
  const t = useTranslations("bankConnection");
  const dates = useDates();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const unmapped = connection.accounts.some((a) => !a.mapped);
  const linked = connection.accounts.filter((a) => a.bankId != null).length;

  async function reconnect() {
    setBusy(true);
    const result = await startBankConnectAction({ name: connection.aspspName, country: connection.aspspCountry, maxConsentSeconds: null }).catch(() => ({ error: "unavailable" as const }));
    if ("error" in result) {
      setBusy(false);
      onError(result.error);
      return;
    }
    window.location.assign(result.url);
  }

  async function disconnect() {
    const ok = await confirm({
      title: t("disconnectTitle", { bank: connection.aspspName }),
      body: t("disconnectBody"),
      confirmLabel: t("disconnectConfirm"),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    const result = await disconnectBankAction(connection.id).catch(() => ({ error: "unavailable" as const }));
    setBusy(false);
    if ("error" in result) onError(result.error);
    else onChanged(result);
  }

  return (
    <div className="flex flex-col gap-3 rounded-clear-tile bg-clear-tile p-4">
      <div className="flex items-start gap-3.5">
        <IconTile tone="sky" size="md"><IconBuildingBank stroke={2} /></IconTile>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[15px] font-bold">{connection.aspspName}</span>
          <div className="flex flex-wrap items-center gap-2">
            {connection.expired ? (
              <ClearChip tone="ember">{t("consentExpired")}</ClearChip>
            ) : (
              <ClearChip tone="mint">{t("validUntil", { date: dates.day(connection.validUntil) })}</ClearChip>
            )}
            {unmapped && !connection.expired && <ClearChip tone="butter">{t("needsLinking")}</ClearChip>}
          </div>
        </div>
        <RowIconButton label={t("disconnect")} onClick={() => void disconnect()} disabled={busy} danger>
          <IconTrash aria-hidden stroke={2} />
        </RowIconButton>
      </div>

      {connection.expired && <SettingsNotice tone="warning">{t("expiredPrompt")}</SettingsNotice>}

      {connection.accounts.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {connection.accounts.map((account) => (
            <li key={account.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
              <span className="min-w-0 truncate font-semibold">
                {account.name ?? t("accountFallback")}
                {account.iban && <span className="font-normal text-clear-muted"> {maskAccountNumber(account.iban)}</span>}
              </span>
              <span className="text-clear-muted">
                {account.bankId != null ? t("linkedTo", { bank: account.bankName ?? "" }) : account.mapped ? t("skipped") : t("notLinked")}
              </span>
            </li>
          ))}
        </ul>
      )}

      {connection.lastSyncedAt && (
        <p className="m-0 text-[13px] text-clear-muted">
          {t("lastSynced", { when: dates.moment(connection.lastSyncedAt) })}
          {lastResultText && !connection.lastResult?.error ? ` · ${lastResultText}` : ""}
        </p>
      )}
      {connection.lastResult?.error && connection.lastResult.error !== "expired" && lastResultText && (
        <p className="m-0 text-[13px] font-semibold text-clear-negative">{lastResultText}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {connection.expired ? (
          <button type="button" onClick={() => void reconnect()} disabled={busy} className={clearButtonVariants({ variant: "ember", size: "sm" })}>
            <IconRefresh aria-hidden />
            {t("reconnect")}
          </button>
        ) : (
          <button type="button" onClick={onSync} disabled={syncing != null || busy || linked === 0} className={clearButtonVariants({ variant: "surface", size: "sm" })}>
            <IconRefresh aria-hidden className={cn(syncing === connection.id && "animate-spin")} />
            {syncing === connection.id ? t("syncing") : t("syncNow")}
          </button>
        )}
        <button type="button" onClick={onMap} disabled={busy} className={clearButtonVariants({ variant: unmapped ? "primary" : "surface", size: "sm" })}>
          <IconLink aria-hidden />
          {t("linkAccounts")}
        </button>
      </div>
    </div>
  );
}

// ─── Connect a bank ───────────────────────────────────────────────────────────

function ConnectBankDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("bankConnection");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent hideHeaderRow title={t("connectTitle")} className="gap-[18px] pt-6 font-clear text-clear-ink" sheetClassName="lg:max-w-[560px]">
        {open && <ConnectBankBody onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ConnectBankBody({ onClose }: { onClose: () => void }) {
  const t = useTranslations("bankConnection");
  const errorText = useErrorText();
  const [choices, setChoices] = useState<AspspOption[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listBankChoicesAction()
      .catch(() => ({ error: "unavailable" as const }))
      .then((result) => {
        if (cancelled) return;
        if ("error" in result) setError(errorText(result.error));
        else setChoices(result.banks);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on open
  }, []);

  const visible = (choices ?? []).filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()));

  async function pick(choice: AspspOption) {
    setStarting(choice.name);
    setError(null);
    const result = await startBankConnectAction({ name: choice.name, country: choice.country, maxConsentSeconds: choice.maxConsentSeconds }).catch(() => ({ error: "unavailable" as const }));
    if ("error" in result) {
      setStarting(null);
      setError(errorText(result.error));
      return;
    }
    // Off to the bank's consent page; it sends the browser back to /api/bank/callback.
    window.location.assign(result.url);
  }

  return (
    <>
      <ClearDialogHeader
        title={t("connectTitle")}
        subtitle={t("connectSubtitle")}
        icon={<IconTile tone="sky" size="lg"><IconBuildingBank stroke={2} /></IconTile>}
        onClose={onClose}
        closeLabel={t("close")}
      />
      <SettingsSearch value={query} onChange={setQuery} placeholder={t("searchPlaceholder")} label={t("searchLabel")} />
      {error && <SettingsNotice>{error}</SettingsNotice>}
      {!choices && !error && <p role="status" className="m-0 text-sm text-clear-muted">{t("loadingBanks")}</p>}
      {choices && visible.length === 0 && <p className="m-0 text-sm text-clear-muted">{t("noBanks")}</p>}
      {visible.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {visible.map((choice) => (
            <li key={`${choice.country}-${choice.name}`}>
              <button
                type="button"
                onClick={() => void pick(choice)}
                disabled={starting != null}
                className="flex w-full cursor-pointer items-center gap-3.5 rounded-clear-row px-3 py-2.5 text-left transition-colors hover:bg-clear-tile disabled:cursor-default disabled:opacity-60"
              >
                <IconTile tone="stone" size="sm">{choice.name.slice(0, 2)}</IconTile>
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{choice.name}</span>
                {choice.beta && <ClearChip tone="lilac">{t("beta")}</ClearChip>}
                {starting === choice.name && <span className="text-[13px] text-clear-muted">{t("redirecting")}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="m-0 text-[13px] text-clear-muted">{t("connectNote")}</p>
    </>
  );
}

// ─── Account mapping ──────────────────────────────────────────────────────────

type Choice = "new" | "skip" | `${number}`;

function AccountMappingDialog({
  connection,
  banks,
  onClose,
  onSaved,
}: {
  connection: BankConnectionView;
  banks: BankPanelData["banks"];
  onClose: () => void;
  onSaved: (data: BankPanelData, outcome: SyncOutcome | null) => void;
}) {
  const t = useTranslations("bankConnection");
  const errorText = useErrorText();
  const ids = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>(() =>
    Object.fromEntries(
      connection.accounts.map((a) => {
        if (a.bankId != null) return [a.id, `${a.bankId}` as Choice];
        if (a.mapped) return [a.id, "skip" as Choice];
        // An IBAN Centje already knows was linked on connect; anything else starts as a new account.
        return [a.id, "new" as Choice];
      }),
    ),
  );

  const options = [
    { value: "new" as Choice, label: t("mapNew") },
    ...banks.map((b) => ({ value: `${b.id}` as Choice, label: b.accountNumber ? `${b.name} ${maskAccountNumber(b.accountNumber)}` : b.name })),
    { value: "skip" as Choice, label: t("mapSkip") },
  ];

  async function save(andSync: boolean) {
    setBusy(true);
    setError(null);
    const links = connection.accounts.map((a) => {
      const choice = choices[a.id] ?? "skip";
      return { accountId: a.id, choice: choice === "new" ? ("new" as const) : choice === "skip" ? null : Number(choice) };
    });
    const saved = await saveAccountLinksAction(connection.id, links).catch(() => ({ error: "unavailable" as const }));
    if ("error" in saved) {
      setBusy(false);
      setError(errorText(saved.error));
      return;
    }
    if (!andSync || links.every((l) => l.choice === null)) {
      setBusy(false);
      onSaved(saved, null);
      return;
    }
    const synced = await syncBankAction(connection.id).catch(() => ({ error: "unavailable" as const }));
    setBusy(false);
    if ("error" in synced) onSaved(saved, null);
    else onSaved(synced.data, synced.outcome);
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent hideHeaderRow title={t("mapTitle")} className="gap-[18px] pt-6 font-clear text-clear-ink" sheetClassName="lg:max-w-[640px]">
        <ClearDialogHeader
          title={t("mapTitle")}
          subtitle={t("mapSubtitle", { bank: connection.aspspName })}
          icon={<IconTile tone="sky" size="lg"><IconLink stroke={2} /></IconTile>}
          onClose={busy ? undefined : onClose}
          closeLabel={t("close")}
        />
        {connection.accounts.length === 0 && <SettingsNotice tone="info">{t("mapNoAccounts")}</SettingsNotice>}
        {connection.accounts.map((account) => (
          <div key={account.id} className="flex flex-col gap-1.5">
            <span id={`${ids}-${account.id}`} className="text-[13px] font-bold text-clear-ink-2">
              {account.name ?? t("accountFallback")}
              {account.iban && <span className="font-normal text-clear-muted"> · {account.iban}</span>}
              {account.currency && account.currency !== "EUR" && <span className="font-normal text-clear-muted"> · {account.currency}</span>}
            </span>
            <ClearSelect
              value={choices[account.id] ?? "skip"}
              onChange={(value) => setChoices((prev) => ({ ...prev, [account.id]: value }))}
              ariaLabelledBy={`${ids}-${account.id}`}
              options={options}
            />
          </div>
        ))}
        <p className="m-0 text-[13px] text-clear-muted">{t("mapHint")}</p>
        {error && <SettingsNotice>{error}</SettingsNotice>}
        <ClearDialogFooter>
          <button type="button" onClick={() => void save(false)} disabled={busy} className={clearButtonVariants({ variant: "secondary" })}>
            {t("mapSaveOnly")}
          </button>
          <button type="button" onClick={() => void save(true)} disabled={busy} className={clearButtonVariants()}>
            {busy ? t("syncing") : t("mapSaveSync")}
          </button>
        </ClearDialogFooter>
      </DialogContent>
    </Dialog>
  );
}
