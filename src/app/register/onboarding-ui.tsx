"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { IconCheck, IconChevronRight, IconCurrencyEuro } from "@tabler/icons-react";
import { ClearButton } from "@/components/clear/button";
import { cn } from "@/lib/utils";

// The building blocks every onboarding step shares (Onboard-*.dc.html): the logo, the
// black stepper panel, the white step card with its progress bar, the heading, the
// Back · Skip · Continue footer, a notice tile and the digit boxes used by the 2FA
// code and the app-lock PIN.

export function OnboardingBrand({ className }: { className?: string }) {
  const t = useTranslations("onboarding");
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-[19px] font-extrabold tracking-[-0.02em]", className)}>
      <span aria-hidden className="inline-flex size-10 items-center justify-center rounded-full bg-clear-ember text-clear-ember-ink">
        <IconCurrencyEuro size={22} stroke={2.4} />
      </span>
      {t("appName")}
    </span>
  );
}

export interface StepperGroup {
  name: string;
  steps: { key: string; label: string }[];
}

/** The black panel on the left (lg+): logo, the five groups with their steps, sign-in link. */
export function OnboardingStepper({
  groups,
  currentKey,
  footer,
}: {
  groups: StepperGroup[];
  currentKey: string;
  footer?: React.ReactNode;
}) {
  const t = useTranslations("onboarding");
  const flat = groups.flatMap((g) => g.steps.map((s) => s.key));
  const current = flat.indexOf(currentKey);
  let n = 0;

  return (
    <aside className="sticky top-0 hidden h-dvh w-[440px] shrink-0 flex-col gap-10 overflow-y-auto bg-clear-hero px-11 py-10 text-clear-hero-ink lg:flex">
      <OnboardingBrand />
      <ol aria-label={t("stepsLabel")} className="m-0 flex list-none flex-col gap-[22px] p-0">
        {groups.map((g) => (
          <li key={g.name} className="flex flex-col gap-2.5">
            <span className="text-[13px] font-bold text-clear-hero-ink/60">{g.name}</span>
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {g.steps.map((s) => {
                const i = n++;
                const done = i < current;
                const now = i === current;
                return (
                  <li
                    key={s.key}
                    aria-current={now ? "step" : undefined}
                    className={cn(
                      "flex items-center gap-3 text-[15px]",
                      now ? "font-extrabold text-clear-hero-ink" : done ? "font-semibold text-clear-hero-ink/85" : "font-semibold text-clear-hero-ink/50",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "inline-flex size-[26px] shrink-0 items-center justify-center rounded-full text-xs font-extrabold",
                        done
                          ? "bg-clear-mint text-clear-mint-ink"
                          : now
                            ? "bg-clear-ember text-clear-ember-ink"
                            : "border-[1.5px] border-clear-hero-ink/30 text-clear-hero-ink/60",
                      )}
                    >
                      {done ? <IconCheck size={14} stroke={3} /> : i + 1}
                    </span>
                    {s.label}
                    {done && <span className="sr-only">{t("stepDone")}</span>}
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>
      {footer && <div className="mt-auto text-sm text-clear-hero-ink-2">{footer}</div>}
    </aside>
  );
}

/** The step card's progress bar and "Step 2 of 12 · Account" caption. */
export function StepProgress({ current, total, group }: { current: number; total: number; group: string }) {
  const t = useTranslations("onboarding");
  return (
    <div className="flex flex-col gap-2.5">
      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-clear-ground">
        <span
          className="block h-full rounded-full bg-clear-ember transition-[width] duration-500 ease-out"
          style={{ width: `${(current / total) * 100}%` }}
        />
      </div>
      <span className="text-[13px] font-bold text-clear-muted">{t("progress", { current, total, group })}</span>
    </div>
  );
}

export function StepHeading({ title, subtitle, large = false }: { title: React.ReactNode; subtitle?: React.ReactNode; large?: boolean }) {
  return (
    <div className={cn("flex flex-col", large ? "gap-3" : "gap-2")}>
      <h1
        className={cn(
          "m-0 font-extrabold",
          large
            ? "text-[32px] leading-[1.08] tracking-[-0.035em] sm:text-[44px]"
            : "text-[26px] leading-[1.15] tracking-[-0.03em] sm:text-[32px]",
        )}
      >
        {title}
      </h1>
      {subtitle && (
        <p className={cn("m-0 text-clear-ink-2", large ? "max-w-[560px] text-base leading-[1.55] sm:text-lg" : "text-base leading-normal")}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

/**
 * Back on the left, then an optional "Skip for now" and the primary action. On phones
 * the buttons stack full width with the primary one on top.
 */
export function StepFooter({
  onBack,
  onSkip,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  primaryArrow = true,
}: {
  onBack?: () => void;
  onSkip?: () => void;
  primaryLabel: React.ReactNode;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryArrow?: boolean;
}) {
  const t = useTranslations("onboarding");
  return (
    <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:items-center">
      {onBack && (
        <ClearButton variant="secondary" size="lg" onClick={onBack}>
          {t("back")}
        </ClearButton>
      )}
      <span aria-hidden className="hidden sm:block sm:flex-1" />
      {onSkip && (
        <ClearButton variant="ghost" size="lg" onClick={onSkip} className="px-4 text-clear-ink-2 hover:text-clear-ink">
          {t("skip")}
        </ClearButton>
      )}
      <ClearButton size="lg" onClick={onPrimary} disabled={primaryDisabled}>
        {primaryLabel}
        {primaryArrow && <IconChevronRight stroke={2.2} aria-hidden className="size-4" />}
      </ClearButton>
    </div>
  );
}

/** A rose (error) or mint (done) tile inside the card. */
export function StepNotice({ tone = "error", children }: { tone?: "error" | "success"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-clear-tile px-4 py-3 text-sm font-semibold",
        tone === "error" ? "bg-clear-rose text-clear-negative" : "bg-clear-mint text-clear-mint-ink",
      )}
    >
      {children}
    </div>
  );
}

/**
 * A row of single-character boxes over one real input, so typing, pasting, the phone's
 * number keyboard and one-time-code autofill all just work. `length` boxes are drawn;
 * boxes from `required` on are optional (dashed while empty). `masked` shows dots.
 */
export function CodeBoxes({
  value,
  onChange,
  length,
  required = length,
  masked = false,
  label,
  onEnter,
  autoFocus,
  size = "md",
}: {
  value: string;
  onChange: (v: string) => void;
  length: number;
  required?: number;
  masked?: boolean;
  label: string;
  onEnter?: () => void;
  autoFocus?: boolean;
  size?: "md" | "lg";
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, length - 1);

  return (
    <div
      className={cn("relative grid gap-2.5", size === "lg" ? "w-fit grid-flow-col gap-3" : "w-full")}
      style={size === "md" ? { gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` } : undefined}
      onClick={() => inputRef.current?.focus()}
    >
      {Array.from({ length }, (_, i) => {
        const char = value[i];
        const isActive = focused && i === active && value.length < length;
        return (
          <span
            key={i}
            aria-hidden
            className={cn(
              "relative flex items-center justify-center rounded-clear-row border-2 text-2xl font-extrabold tabular-nums transition-[border-color,box-shadow,background-color]",
              size === "lg" ? "h-16 w-14" : "h-[58px]",
              isActive
                ? "border-clear-ember bg-clear-card ring-4 ring-clear-ember/20"
                : i >= required && !char
                  ? "border-dashed border-clear-line bg-transparent"
                  : "border-transparent bg-clear-tile",
            )}
          >
            {char ? (masked ? "•" : char) : isActive ? <span className="h-6 w-0.5 animate-pulse rounded-full bg-clear-ink" /> : null}
          </span>
        );
      })}
      <input
        ref={inputRef}
        id={id}
        type={masked ? "password" : "text"}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete={masked ? "off" : "one-time-code"}
        maxLength={length}
        value={value}
        aria-label={label}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter?.();
        }}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </div>
  );
}

/** Initials from a first and last name, for the avatar placeholder. */
export function initialsOf(first: string, last: string) {
  return `${first.trim().charAt(0)}${last.trim().charAt(0)}`.toUpperCase() || "?";
}
