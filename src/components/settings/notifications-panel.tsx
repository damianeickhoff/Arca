"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconBellRinging, IconDeviceMobile, IconSend, IconTrash } from "@tabler/icons-react";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import { SettingsEmpty, SettingsNotice, SettingsSection, SettingsSwitchRow } from "@/components/settings/settings-ui";
import { ClearButton } from "@/components/clear/button";
import { ClearChip } from "@/components/clear/chip";
import { IconTile } from "@/components/clear/icon-tile";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { AnchoredTip } from "@/components/anchored-tip";
import { NotificationIcon } from "@/components/notification-icon";
import { setNotificationKindAction } from "@/app/actions/notifications";
import { NOTIFICATION_KINDS, type NotificationKind } from "@/lib/notification-kinds";

/** One device that gets pushes, as the panel lists it (lib/push.ts PushDeviceView). */
export interface PushDevice {
  id: number;
  label: string | null;
  endpoint: string;
  createdAt: string;
  failedAt: string | null;
}

type Notice = { tone: "success" | "info" | "error" | "warning"; key: string };

/** The VAPID public key (base64url) as the bytes PushManager.subscribe wants. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** The service worker that receives pushes. In production sw-register.tsx has registered it;
 *  the dev server runs without one (it fights hot reloading), so there is none to use. */
async function pushRegistration(): Promise<ServiceWorkerRegistration | null> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  if (process.env.NODE_ENV !== "production") return null;
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

/**
 * Settings › Notifications: a switch per kind (per user, on by default), and push to
 * this device: asks the browser's permission, subscribes through the service worker
 * with the server's VAPID public key and stores the subscription. Every device of this
 * user is listed with Remove. Push is opt-in per device; nothing goes out before.
 */
export function NotificationsPanel({ disabled, devices }: { disabled: NotificationKind[]; devices: PushDevice[] }) {
  const t = useTranslations("notifications");
  const tPanels = useTranslations("settings.panels");
  const locale = useLocale();
  const router = useRouter();
  const confirm = useConfirm();
  const [, startTransition] = useTransition();
  // A switch flipped here shows its new state before the revalidated props come back.
  const [flipped, setFlipped] = useState<Partial<Record<NotificationKind, boolean>>>({});
  const [busy, setBusy] = useState<"on" | "off" | "test" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  // This device's subscription endpoint, once the browser has told us (undefined = still asking).
  const [endpoint, setEndpoint] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!pushSupported()) return;
    let alive = true;
    navigator.serviceWorker
      .getRegistration("/")
      .then((reg) => reg?.pushManager.getSubscription() ?? null)
      .then((sub) => {
        if (alive) setEndpoint(sub?.endpoint ?? null);
      })
      .catch(() => {
        if (alive) setEndpoint(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const isOn = (kind: NotificationKind) => flipped[kind] ?? !disabled.includes(kind);
  const thisDeviceOn = !!endpoint && devices.some((d) => d.endpoint === endpoint);
  const added = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

  function toggle(kind: NotificationKind, enabled: boolean) {
    setFlipped((prev) => ({ ...prev, [kind]: enabled }));
    startTransition(async () => {
      const result = await setNotificationKindAction(kind, enabled);
      if (result.error) setFlipped((prev) => ({ ...prev, [kind]: !enabled }));
    });
  }

  async function turnOn() {
    setNotice(null);
    if (!pushSupported()) return setNotice({ tone: "warning", key: "unsupported" });
    if (!window.isSecureContext) return setNotice({ tone: "warning", key: "insecure" });
    setBusy("on");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setNotice({ tone: "warning", key: "denied" });
      const reg = await pushRegistration();
      if (!reg) return setNotice({ tone: "info", key: "devBuild" });
      const res = await fetch("/api/push/vapid-public-key");
      if (!res.ok) throw new Error(String(res.status));
      const { publicKey } = (await res.json()) as { publicKey: string };
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const saved = await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!saved.ok) throw new Error(String(saved.status));
      setEndpoint(sub.endpoint);
      setNotice({ tone: "success", key: "thisDeviceOn" });
      router.refresh();
    } catch {
      setNotice({ tone: "error", key: "failed" });
    } finally {
      setBusy(null);
    }
  }

  async function removeDevice(device: PushDevice) {
    const name = device.label ?? t("panel.unknownDevice");
    const ok = await confirm({ title: t("panel.removeTitle", { device: name }), body: t("panel.removeBody"), confirmLabel: t("panel.remove"), destructive: true });
    if (!ok) return;
    setNotice(null);
    setBusy("off");
    try {
      // This device: also drop the browser's subscription, so it asks afresh next time.
      if (device.endpoint === endpoint) {
        const reg = await navigator.serviceWorker.getRegistration("/");
        await (await reg?.pushManager.getSubscription())?.unsubscribe();
        setEndpoint(null);
      }
      await fetch("/api/push/subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: device.id }),
      });
      router.refresh();
    } catch {
      setNotice({ tone: "error", key: "failed" });
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setNotice(null);
    setBusy("test");
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      const { sent, failed } = (await res.json()) as { sent: number; failed: number };
      setNotice(sent > 0 ? { tone: "success", key: "testSent" } : failed > 0 ? { tone: "error", key: "testFailed" } : { tone: "info", key: "testNone" });
      router.refresh();
    } catch {
      setNotice({ tone: "error", key: "testFailed" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PanelHeader title={tPanels("notifications.title")} />
      <div className="flex flex-col gap-7 px-4 pt-1 pb-4 font-clear text-clear-ink">
        <SettingsSection title={t("panel.pushTitle")} subtitle={t("panel.pushSubtitle")}>
          <div className="flex flex-wrap items-center gap-2.5">
            {thisDeviceOn ? (
              <ClearChip tone="mint" icon={<IconBellRinging aria-hidden />}>{t("panel.thisDeviceOn")}</ClearChip>
            ) : (
              <span data-tip-anchor="pushDevice" className="inline-flex">
                <ClearButton onClick={turnOn} disabled={busy != null}>
                  <IconBellRinging aria-hidden />
                  {busy === "on" ? t("panel.turningOn") : t("panel.turnOn")}
                </ClearButton>
              </span>
            )}
            {devices.length > 0 && (
              <ClearButton variant="surface" onClick={sendTest} disabled={busy != null}>
                <IconSend aria-hidden />
                {busy === "test" ? t("panel.sending") : t("panel.sendTest")}
              </ClearButton>
            )}
          </div>
          {notice && <SettingsNotice tone={notice.tone}>{t(`panel.${notice.key}`)}</SettingsNotice>}
          <p className="m-0 text-[13px] leading-normal text-clear-muted">{t("panel.iosHomeScreen")}</p>
          <p className="m-0 text-[13px] leading-normal text-clear-muted">{t("panel.privacy")}</p>
          <AnchoredTip id="pushDevice" anchor="pushDevice" active={!thisDeviceOn} />
        </SettingsSection>

        <SettingsSection title={t("panel.devicesTitle")}>
          {devices.length === 0 ? (
            <SettingsEmpty icon={<IconDeviceMobile stroke={1.9} />}>{t("panel.devicesEmpty")}</SettingsEmpty>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {devices.map((d) => {
                const name = d.label ?? t("panel.unknownDevice");
                return (
                  <li key={d.id} className="flex items-center gap-3.5 rounded-clear-tile bg-clear-tile px-4 py-3">
                    <IconTile tone="stone" size="sm"><IconDeviceMobile stroke={1.9} /></IconTile>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[15px] font-bold">{name}</span>
                        {d.endpoint === endpoint && <ClearChip tone="sky">{t("panel.thisDevice")}</ClearChip>}
                      </span>
                      <span className="text-[13px] text-clear-muted">
                        {t("panel.added", { date: added(d.createdAt.includes("T") ? d.createdAt : `${d.createdAt.replace(" ", "T")}Z`) })}
                        {d.failedAt && <span className="text-clear-negative"> · {t("panel.lastFailed")}</span>}
                      </span>
                    </span>
                    <ClearButton variant="ghost" size="icon" onClick={() => removeDevice(d)} disabled={busy != null} aria-label={t("panel.removeLabel", { device: name })}>
                      <IconTrash aria-hidden />
                    </ClearButton>
                  </li>
                );
              })}
            </ul>
          )}
        </SettingsSection>

        <SettingsSection title={t("panel.kindsTitle")} subtitle={t("panel.kindsSubtitle")}>
          <div className="flex flex-col gap-2">
            {NOTIFICATION_KINDS.map((kind) => (
              <SettingsSwitchRow
                key={kind}
                icon={<NotificationIcon kind={kind} size="sm" />}
                label={t(`kinds.${kind}.label`)}
                hint={t(`kinds.${kind}.hint`)}
                checked={isOn(kind)}
                onCheckedChange={(on) => toggle(kind, on)}
              />
            ))}
          </div>
        </SettingsSection>
      </div>
    </>
  );
}
