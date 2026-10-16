"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { IconCheck, IconChevronRight, IconEye, IconEyeOff, IconLock, IconTarget, IconUpload } from "@tabler/icons-react";
import { ClearField, ClearInput } from "@/components/clear/field";
import { Amount } from "@/components/clear/amount";
import { ClearButton } from "@/components/clear/button";
import { IconTile } from "@/components/clear/icon-tile";
import { DatePicker } from "@/components/date-picker";
import { cn } from "@/lib/utils";
import { StepFooter, StepHeading } from "../onboarding-ui";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── 1 · Welcome (Onboard-01) ──────────────────────────────────────────────────

export function WelcomeStep({ onStart, signedIn }: { onStart: () => void; signedIn: boolean }) {
  const t = useTranslations("onboarding.welcome");
  const tApp = useTranslations("onboarding");
  const app = tApp("appName");

  return (
    <>
      <StepHeading large title={t("title", { app })} subtitle={t("subtitle")} />

      <ul aria-label={t("featuresLabel", { app })} className="m-0 grid list-none grid-cols-1 gap-3.5 p-0 md:grid-cols-3">
        <li className="flex min-h-[160px] flex-col md:min-h-[214px] gap-3.5 rounded-clear-card bg-clear-hero p-[22px] text-clear-hero-ink">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[15px] font-bold">{t("safeToSpend")}</span>
            <span className="inline-flex h-[26px] items-center rounded-full bg-clear-hero-ink/14 px-2.5 text-xs font-bold">{t("example")}</span>
          </div>
          <Amount value={973.25} className="mt-auto text-[38px] leading-none tracking-[-0.035em]" />
          <div role="img" aria-label={t("exampleBar")} className="flex h-2.5 overflow-hidden rounded-full bg-clear-hero-ink/16">
            <span className="w-[58%] rounded-full bg-clear-ember" />
          </div>
          <span className="text-[13px] leading-[1.45] text-clear-hero-ink-2">{t("safeToSpendBody")}</span>
        </li>
        <li className="flex min-h-[160px] flex-col md:min-h-[214px] gap-3 rounded-clear-card bg-clear-mint p-[22px]">
          <IconTile className="bg-clear-card text-clear-mint-ink">
            <IconUpload stroke={1.9} />
          </IconTile>
          <span className="mt-auto text-lg leading-tight font-extrabold tracking-[-0.02em]">{t("importTitle")}</span>
          <span className="text-[13px] leading-[1.45] text-clear-ink-2">{t("importBody")}</span>
        </li>
        <li className="flex min-h-[160px] flex-col md:min-h-[214px] gap-3 rounded-clear-card bg-clear-peach p-[22px]">
          <IconTile className="bg-clear-card text-clear-peach-ink">
            <IconTarget stroke={1.9} />
          </IconTile>
          <span className="mt-auto text-lg leading-tight font-extrabold tracking-[-0.02em]">{t("planTitle")}</span>
          <span className="text-[13px] leading-[1.45] text-clear-ink-2">{t("planBody")}</span>
        </li>
      </ul>

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-[22px]">
        <ClearButton size="lg" onClick={onStart} className="h-13 px-[30px] text-base">
          {t("start")}
          <IconChevronRight stroke={2.2} aria-hidden className="size-4" />
        </ClearButton>
        {!signedIn && (
          <Link href="/login" className="text-center text-[15px] font-bold text-clear-ember-text no-underline hover:underline">
            {t("haveAccount")}
          </Link>
        )}
        <span className="hidden sm:block sm:flex-1" />
        <span className="inline-flex items-center justify-center gap-2 text-[13px] text-clear-muted">
          <IconLock size={16} stroke={1.9} aria-hidden />
          {t("privacy")}
        </span>
      </div>
    </>
  );
}

// ── 2 · About you (Onboard-02) ────────────────────────────────────────────────

export interface AboutYou {
  firstName: string;
  lastName: string;
  email: string;
  birthday: string;
}

export function aboutYouValid(v: AboutYou) {
  return v.firstName.trim() !== "" && v.lastName.trim() !== "" && EMAIL_RE.test(v.email.trim()) && v.birthday !== "";
}

export function AboutYouStep({
  value,
  onChange,
  emailError,
  checking,
  onBack,
  onNext,
}: {
  value: AboutYou;
  onChange: (v: AboutYou) => void;
  emailError: string | null;
  checking: boolean;
  onBack?: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("onboarding.about");
  const tApp = useTranslations("onboarding");
  const [emailTouched, setEmailTouched] = useState(false);
  const set = (key: keyof AboutYou, v: string) => onChange({ ...value, [key]: v });
  const emailInvalid = emailTouched && value.email.trim() !== "" && !EMAIL_RE.test(value.email.trim());

  return (
    <>
      <StepHeading title={t("title")} subtitle={t("subtitle")} />
      <form
        className="grid grid-cols-1 gap-3.5 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          onNext();
        }}
      >
        <ClearField label={t("firstName")} htmlFor="ob-first">
          <ClearInput id="ob-first" value={value.firstName} onChange={(e) => set("firstName", e.target.value)} autoFocus autoComplete="given-name" placeholder={t("firstNamePlaceholder")} />
        </ClearField>
        <ClearField label={t("lastName")} htmlFor="ob-last">
          <ClearInput id="ob-last" value={value.lastName} onChange={(e) => set("lastName", e.target.value)} autoComplete="family-name" placeholder={t("lastNamePlaceholder")} />
        </ClearField>
        <ClearField
          label={t("email")}
          htmlFor="ob-email"
          hint={t("emailHint")}
          error={emailError ?? (emailInvalid ? t("emailInvalid") : undefined)}
          className="sm:col-span-2"
        >
          <ClearInput
            id="ob-email"
            type="email"
            value={value.email}
            onChange={(e) => set("email", e.target.value)}
            onBlur={() => setEmailTouched(true)}
            aria-invalid={emailError != null || emailInvalid || undefined}
            autoComplete="email"
            placeholder={t("emailPlaceholder")}
          />
        </ClearField>
        <div role="group" aria-labelledby="ob-birthday" className="flex flex-col gap-1.5 sm:col-span-2">
          <span id="ob-birthday" className="text-[13px] font-bold text-clear-ink-2">{t("birthday")}</span>
          <DatePicker value={value.birthday} onChange={(v) => set("birthday", v)} placeholder={t("birthdayPlaceholder")} triggerClassName="font-normal" />
        </div>
        {/* Enter in a field submits; the visible buttons live in the footer. */}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
      <StepFooter
        onBack={onBack}
        primaryLabel={checking ? t("checking") : tApp("continue")}
        onPrimary={onNext}
        primaryDisabled={!aboutYouValid(value) || checking}
      />
    </>
  );
}

// ── 3 · Password (Onboard-03) ─────────────────────────────────────────────────

/** 0 (too short) to 4 (strong): length first, then variety. */
function strengthOf(pw: string) {
  if (pw.length < 8) return 0;
  let score = 1;
  if (pw.length >= 12) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) score++;
  return Math.min(score, 4);
}

const STRENGTH = ["tooShort", "weak", "fair", "good", "strong"] as const;
const STRENGTH_FILL = ["bg-clear-negative-fill", "bg-clear-negative-fill", "bg-clear-warning-fill", "bg-clear-positive-fill", "bg-clear-positive-fill"];
const STRENGTH_TEXT = ["text-clear-negative", "text-clear-negative", "text-clear-warning", "text-clear-positive", "text-clear-positive"];

export function passwordValid(password: string, confirm: string, email: string) {
  return password.length >= 8 && password === confirm && password.trim().toLowerCase() !== email.trim().toLowerCase();
}

export function PasswordStep({
  password,
  confirm,
  email,
  onChange,
  pending,
  onBack,
  onNext,
}: {
  password: string;
  confirm: string;
  email: string;
  onChange: (password: string, confirm: string) => void;
  pending: boolean;
  onBack?: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("onboarding.password");
  const tApp = useTranslations("onboarding");
  const [show, setShow] = useState(false);
  const strength = strengthOf(password);
  const rules = [
    { key: "ruleLength", met: password.length >= 8 },
    { key: "ruleNumber", met: /\d/.test(password) },
    { key: "ruleNotEmail", met: password !== "" && password.trim().toLowerCase() !== email.trim().toLowerCase() },
  ] as const;
  const matches = confirm !== "" && confirm === password;

  return (
    <>
      <StepHeading title={t("title")} subtitle={t("subtitle")} />
      <form
        className="flex flex-col gap-[18px]"
        onSubmit={(e) => {
          e.preventDefault();
          onNext();
        }}
      >
        {/* Lets password managers file the new password under the right account. */}
        <input type="email" name="email" value={email} autoComplete="username" readOnly hidden />
        <ClearField label={t("label")} htmlFor="ob-password">
          <span className="relative block">
            <ClearInput
              id="ob-password"
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => onChange(e.target.value, confirm)}
              autoFocus
              autoComplete="new-password"
              aria-describedby="ob-pw-strength ob-pw-rules"
              className="pr-13"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? t("hide") : t("show")}
              aria-pressed={show}
              className="absolute top-1 right-1 inline-flex size-10 cursor-pointer items-center justify-center rounded-full text-clear-ink-2 outline-none hover:text-clear-ink focus-visible:ring-3 focus-visible:ring-clear-ember/50"
            >
              {show ? <IconEyeOff size={18} stroke={1.9} aria-hidden /> : <IconEye size={18} stroke={1.9} aria-hidden />}
            </button>
          </span>
        </ClearField>

        <div id="ob-pw-strength" className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span className="font-bold text-clear-ink-2">{t("strength")}</span>
            {password !== "" && <span className={cn("font-extrabold", STRENGTH_TEXT[strength])}>{t(`levels.${STRENGTH[strength]}`)}</span>}
          </div>
          <div
            role="meter"
            aria-label={t("strength")}
            aria-valuemin={0}
            aria-valuemax={4}
            aria-valuenow={strength}
            aria-valuetext={t(`levels.${STRENGTH[strength]}`)}
            className="grid grid-cols-4 gap-1.5"
          >
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={cn("h-1.5 rounded-full", password !== "" && i <= Math.max(strength, 1) ? STRENGTH_FILL[strength] : "bg-clear-line")} />
            ))}
          </div>
        </div>

        <ul id="ob-pw-rules" aria-label={t("rulesLabel")} className="m-0 flex list-none flex-col gap-2.5 rounded-clear-tile bg-clear-tile px-4 py-3.5">
          {rules.map((r) => (
            <li key={r.key} className="flex items-center gap-2.5 text-sm font-semibold">
              <span
                aria-hidden
                className={cn(
                  "inline-flex size-[22px] shrink-0 items-center justify-center rounded-full",
                  r.met ? "bg-clear-mint text-clear-mint-ink" : "border-[1.5px] border-clear-line bg-clear-card",
                )}
              >
                {r.met && <IconCheck size={13} stroke={3} />}
              </span>
              <span className={r.met ? undefined : "text-clear-ink-2"}>{t(r.key)}</span>
              <span className="sr-only">, {r.met ? t("met") : t("notMet")}</span>
            </li>
          ))}
        </ul>

        <ClearField
          label={t("confirm")}
          htmlFor="ob-password-confirm"
          error={confirm !== "" && confirm.length >= password.length && !matches ? t("noMatch") : undefined}
        >
          <ClearInput
            id="ob-password-confirm"
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => onChange(password, e.target.value)}
            autoComplete="new-password"
            aria-invalid={(confirm !== "" && confirm.length >= password.length && !matches) || undefined}
          />
        </ClearField>
        {matches && (
          <span className="-mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-clear-positive">
            <IconCheck size={14} stroke={2.6} aria-hidden />
            {t("match")}
          </span>
        )}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
      <StepFooter
        onBack={onBack}
        primaryLabel={pending ? t("creating") : tApp("continue")}
        onPrimary={onNext}
        primaryDisabled={!passwordValid(password, confirm, email) || pending}
      />
    </>
  );
}
