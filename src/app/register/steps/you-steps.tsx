"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { IconCamera, IconCheck, IconUpload } from "@tabler/icons-react";
import { ClearButton } from "@/components/clear/button";
import { Segmented } from "@/components/clear/segmented";
import { AvatarCropDialog } from "@/app/settings/avatar-crop-dialog";
import { locales, localeNames, type Locale } from "@/i18n/config";
import type { ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { StepFooter, StepHeading, StepNotice, initialsOf } from "../onboarding-ui";

const LOCALE_TONE: Record<Locale, string> = {
  en: "bg-clear-sky text-clear-sky-ink",
  nl: "bg-clear-peach text-clear-peach-ink",
};

// ── 6 · Photo and language (Onboard-06) ───────────────────────────────────────

export function ProfileStep({
  firstName,
  lastName,
  avatarUrl,
  onAvatarUploaded,
  locale,
  onLocale,
  onBack,
  onNext,
}: {
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  onAvatarUploaded: (url: string) => void;
  locale: Locale;
  onLocale: (l: Locale) => void;
  onBack?: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("onboarding.profile");
  const tApp = useTranslations("onboarding");
  const inputRef = useRef<HTMLInputElement>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const initials = initialsOf(firstName, lastName);

  function pick(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    setFailed(false);
    setCropSource(URL.createObjectURL(file));
  }

  function closeCropper() {
    if (cropSource) URL.revokeObjectURL(cropSource);
    setCropSource(null);
  }

  async function upload(blob: Blob) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", blob, "avatar.png");
    try {
      const res = await fetch("/api/profile/avatar", { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      const body = await res.json();
      onAvatarUploaded(body.url);
    } catch {
      setFailed(true);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <StepHeading title={t("title")} subtitle={t("subtitle")} />

      <div className="flex flex-col gap-[22px]">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-7">
          <div
            className="relative size-[120px] shrink-0"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pick(e.dataTransfer.files[0]);
            }}
          >
            <div
              role="img"
              aria-label={avatarUrl ? t("avatarPhotoLabel") : t("avatarLabel", { initials })}
              className={cn(
                "size-full rounded-full border-2 border-dashed p-[7px] transition-colors",
                dragOver ? "border-clear-ember" : "border-clear-line",
              )}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- the user's uploaded avatar
                <img src={avatarUrl} alt="" className="size-full rounded-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center rounded-full bg-clear-peach text-4xl font-extrabold tracking-[-0.02em] text-clear-ink">
                  {initials}
                </span>
              )}
            </div>
            <button
              type="button"
              aria-label={t("upload")}
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="absolute right-[-2px] bottom-0.5 inline-flex size-11 cursor-pointer items-center justify-center rounded-full border-4 border-clear-card bg-clear-primary text-clear-primary-ink outline-none focus-visible:ring-3 focus-visible:ring-clear-ember/50"
            >
              <IconCamera size={18} stroke={1.9} aria-hidden />
            </button>
          </div>
          <div className="flex min-w-0 flex-col items-center gap-3 text-center sm:items-start sm:text-left">
            <div className="flex flex-col gap-1">
              <span className="text-[15px] font-bold">{t("dropTitle")}</span>
              <span className="text-[13px] leading-[1.45] text-clear-muted">{t("dropHint")}</span>
            </div>
            <ClearButton onClick={() => inputRef.current?.click()} disabled={uploading}>
              <IconUpload stroke={1.9} aria-hidden />
              {uploading ? t("uploading") : avatarUrl ? t("changeButton") : t("uploadButton")}
            </ClearButton>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        {failed && <StepNotice>{t("uploadFailed")}</StepNotice>}

        <div className="h-px bg-clear-line" />

        <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
          <legend className="mb-3 p-0 text-[15px] font-bold">{t("languageTitle")}</legend>
          <div role="radiogroup" aria-label={t("languageTitle")} className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            {locales.map((l) => {
              const on = l === locale;
              return (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onLocale(l)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3.5 rounded-clear-tile border-2 bg-clear-card p-4 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-clear-ember/50",
                    on ? "border-clear-ink" : "border-clear-line hover:border-clear-placeholder",
                  )}
                >
                  <span aria-hidden className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-clear-icon text-sm font-extrabold", LOCALE_TONE[l])}>
                    {l.toUpperCase()}
                  </span>
                  <span lang={l} className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-base font-bold">{localeNames[l]}</span>
                    <span className="text-[13px] text-clear-muted">{t(`languageNative.${l}`)}</span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "inline-flex size-6 shrink-0 items-center justify-center rounded-full",
                      on ? "bg-clear-primary text-clear-primary-ink" : "border-[1.5px] border-clear-line",
                    )}
                  >
                    {on && <IconCheck size={14} stroke={2.6} />}
                  </span>
                </button>
              );
            })}
          </div>
          <span className="text-[13px] text-clear-muted">{t("languageHint")}</span>
        </fieldset>
      </div>

      <AvatarCropDialog
        imageUrl={cropSource}
        open={cropSource !== null}
        onOpenChange={(open) => {
          if (!open) closeCropper();
        }}
        onCropped={(blob) => {
          closeCropper();
          void upload(blob);
        }}
      />

      <StepFooter onBack={onBack} onSkip={avatarUrl ? undefined : onNext} primaryLabel={tApp("continue")} onPrimary={onNext} />
    </>
  );
}

// ── 7 · Make it yours (Onboard-07) ────────────────────────────────────────────

export function MakeItYoursStep({
  theme,
  onTheme,
  onBack,
  onNext,
}: {
  theme: ThemeMode;
  onTheme: (m: ThemeMode) => void;
  onBack?: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("onboarding.makeItYours");
  const tApp = useTranslations("onboarding");

  return (
    <>
      <StepHeading title={t("title")} subtitle={t("subtitle")} />

      <div className="flex flex-col gap-6">
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-3.5 p-0 text-[15px] font-bold">{t("appearance")}</legend>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <Segmented
              label={t("appearance")}
              surface="tile"
              value={theme}
              onChange={onTheme}
              items={(["light", "dark", "system"] as const).map((m) => ({ value: m, label: t(`themes.${m}`) }))}
              className="self-start"
            />
            <span className="text-[13px] leading-[1.45] text-clear-muted">{t(`themeHints.${theme}`)}</span>
          </div>
        </fieldset>
      </div>

      <StepFooter onBack={onBack} primaryLabel={tApp("continue")} onPrimary={onNext} />
    </>
  );
}
