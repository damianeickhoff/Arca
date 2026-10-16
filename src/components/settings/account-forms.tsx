"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ClearButton } from "@/components/clear/button";
import { ClearField, ClearInput } from "@/components/clear/field";
import { updateOwnProfileAction, updateOwnEmailAction, updateOwnPasswordAction } from "@/app/actions/auth";
import { AvatarFormContent, TwoFactorSectionContent } from "@/app/settings/profile-client";
import type { User } from "@/db/schema";

// The signed-in user's own account forms — name, sign-in email, password — shared by
// the phone SettingsDialog's "Edit profile" sheet and the /settings page's Profile and
// Password & 2FA panels.

/** A titled block inside an account panel. */
export function AccountFormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 font-clear text-clear-ink">
      <h3 className="m-0 text-[15px] font-bold">{title}</h3>
      {children}
    </section>
  );
}

function Status({ error, success }: { error: string | null; success: string | null }) {
  if (error) {
    return <div role="alert" className="rounded-clear-tile bg-clear-negative-fill px-3 py-2 text-sm font-semibold text-clear-negative">{error}</div>;
  }
  if (success) {
    return <div role="status" className="rounded-clear-tile bg-clear-positive-fill px-3 py-2 text-sm font-semibold text-clear-positive">{success}</div>;
  }
  return null;
}

export function NameForm({ user }: { user: User }) {
  const t = useTranslations("settings.account");
  const id = useId();
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    const fd = new FormData();
    fd.append("name", name);
    const result = await updateOwnProfileAction(fd);
    setSaving(false);
    if (result?.error) setError(result.error);
    else { setSuccess(true); router.refresh(); }
  }

  return (
    <div className="flex flex-col gap-3">
      <Status error={error} success={success ? t("nameUpdated") : null} />
      <ClearField label={t("name")} htmlFor={`${id}-name`}>
        <ClearInput id={`${id}-name`} value={name} autoComplete="name" onChange={(e) => { setName(e.target.value); setSuccess(false); }} />
      </ClearField>
      <ClearButton onClick={save} disabled={saving || !name.trim()} className="self-start">
        {saving ? t("saving") : t("save")}
      </ClearButton>
    </div>
  );
}

export function EmailForm({ user }: { user: User }) {
  const t = useTranslations("settings.account");
  const id = useId();
  const router = useRouter();
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    const fd = new FormData();
    fd.append("email", email);
    fd.append("currentPassword", password);
    const result = await updateOwnEmailAction(fd);
    setSaving(false);
    if (result?.error) setError(result.error);
    else { setSuccess(true); setPassword(""); router.refresh(); }
  }

  return (
    <div className="flex flex-col gap-3">
      <Status error={error} success={success ? t("emailUpdated") : null} />
      <ClearField label={t("email")} htmlFor={`${id}-email`} hint={t("emailHint")}>
        <ClearInput id={`${id}-email`} type="email" value={email} autoComplete="email" onChange={(e) => { setEmail(e.target.value); setSuccess(false); }} />
      </ClearField>
      <ClearField label={t("currentPassword")} htmlFor={`${id}-current`}>
        <ClearInput id={`${id}-current`} type="password" value={password} autoComplete="current-password" onChange={(e) => { setPassword(e.target.value); setSuccess(false); }} />
      </ClearField>
      <ClearButton onClick={save} disabled={saving || !email.trim() || !password} className="self-start">
        {saving ? t("saving") : t("save")}
      </ClearButton>
    </div>
  );
}

export function PasswordForm() {
  const t = useTranslations("settings.account");
  const id = useId();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function save() {
    if (!current || !next) return;
    setSaving(true);
    setError(null);
    const fd = new FormData();
    fd.append("currentPassword", current);
    fd.append("newPassword", next);
    const result = await updateOwnPasswordAction(fd);
    setSaving(false);
    if (result?.error) setError(result.error);
    else { setSuccess(true); setCurrent(""); setNext(""); }
  }

  return (
    <div className="flex flex-col gap-3">
      <Status error={error} success={success ? t("passwordUpdated") : null} />
      <ClearField label={t("currentPassword")} htmlFor={`${id}-current`}>
        <ClearInput id={`${id}-current`} type="password" value={current} autoComplete="current-password" onChange={(e) => { setCurrent(e.target.value); setSuccess(false); }} />
      </ClearField>
      <ClearField label={t("newPassword")} htmlFor={`${id}-new`} hint={t("newPasswordHint")}>
        <ClearInput id={`${id}-new`} type="password" value={next} autoComplete="new-password" onChange={(e) => { setNext(e.target.value); setSuccess(false); }} />
      </ClearField>
      <ClearButton onClick={save} disabled={saving || !current || !next} className="self-start">
        {saving ? t("saving") : t("save")}
      </ClearButton>
    </div>
  );
}

/** Photo, name and sign-in email. */
export function ProfileForms({ user }: { user: User }) {
  const t = useTranslations("settings.account");
  return (
    <div className="flex flex-col gap-7">
      <AccountFormSection title={t("photo")}><AvatarFormContent user={user} /></AccountFormSection>
      <AccountFormSection title={t("name")}><NameForm user={user} /></AccountFormSection>
      <AccountFormSection title={t("loginEmail")}><EmailForm user={user} /></AccountFormSection>
    </div>
  );
}

/** Password and two-factor sign-in. */
export function SecurityForms() {
  const t = useTranslations("settings.account");
  return (
    <div className="flex flex-col gap-7">
      <AccountFormSection title={t("password")}><PasswordForm /></AccountFormSection>
      <AccountFormSection title={t("twoFactor")}><TwoFactorSectionContent /></AccountFormSection>
    </div>
  );
}
