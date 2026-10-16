"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { m } from "@/lib/motion";
import { IconBackspace, IconCalendarRepeat, IconCheck, IconChartPie, IconFileSpreadsheet, IconLock } from "@tabler/icons-react";
import { ClearButton } from "@/components/clear/button";
import { ClearChip } from "@/components/clear/chip";
import { IconTile } from "@/components/clear/icon-tile";
import type { ClearTone } from "@/components/clear/tones";
import { setPinAction, setAppLockEnabledAction } from "@/app/actions/app-lock";
import type { BudgetStrategyDraft } from "@/app/budget/budget-strategy-editor";
import { cn } from "@/lib/utils";
import { CodeBoxes, StepFooter, StepHeading } from "../onboarding-ui";

const MIN_PIN = 4;
const MAX_PIN = 6;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

// ── 11 · App lock (Onboard-11) ────────────────────────────────────────────────

/** A PIN only (no biometrics) to keep onboarding quick; Settings → App lock adds those. */
export function AppLockStep({
  onLocked,
  onBack,
  onSkip,
}: {
  onLocked: () => void;
  onBack?: () => void;
  onSkip: () => void;
}) {
  const t = useTranslations("onboarding.appLock");
  const tApp = useTranslations("onboarding");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [stage, setStage] = useState<"choose" | "confirm">("choose");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const value = stage === "choose" ? pin : confirm;
  const setValue = (v: string) => {
    setError(null);
    if (stage === "choose") setPin(v);
    else setConfirm(v);
  };
  const required = stage === "choose" ? MIN_PIN : pin.length;
  const length = stage === "choose" ? MAX_PIN : pin.length;

  function startOver() {
    setPin("");
    setConfirm("");
    setStage("choose");
    setError(null);
  }

  async function primary() {
    if (stage === "choose") {
      if (pin.length < MIN_PIN) {
        setError(t("tooShort"));
        return;
      }
      setStage("confirm");
      return;
    }
    if (confirm !== pin) {
      setError(t("mismatch"));
      setConfirm("");
      return;
    }
    setSaving(true);
    const res = await setPinAction(pin);
    if (res.error) {
      setSaving(false);
      setError(tApp("genericError"));
      return;
    }
    await setAppLockEnabledAction(true);
    setSaving(false);
    onLocked();
  }

  const keyClass =
    "h-14 cursor-pointer rounded-clear-tile border-0 text-[22px] font-bold tabular-nums outline-none transition-colors focus-visible:ring-3 focus-visible:ring-clear-ember/50";

  return (
    <>
      <StepHeading title={t("title")} subtitle={t("subtitle", { app: tApp("appName") })} />

      <section aria-labelledby="ob-pin-stage" className="flex flex-col items-center gap-4 pt-1">
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <h2 id="ob-pin-stage" className="m-0 text-lg font-bold">{stage === "choose" ? t("choose") : t("confirm")}</h2>
          {stage === "confirm" && (
            <ClearChip tone="mint" icon={<IconCheck stroke={3} aria-hidden />}>
              {t("chosen")}
            </ClearChip>
          )}
        </div>

        <CodeBoxes
          key={stage}
          value={value}
          onChange={setValue}
          length={length}
          required={required}
          masked
          size="lg"
          label={t("entered", { count: value.length, total: length })}
          onEnter={primary}
        />
        {error ? (
          <span role="alert" className="text-[13px] font-semibold text-clear-negative">{error}</span>
        ) : (
          stage === "choose" && <span className="text-[13px] text-clear-muted">{t("lengthHint")}</span>
        )}

        <div role="group" aria-label={t("keypad")} className="mt-1 grid grid-cols-[repeat(3,minmax(0,96px))] gap-2">
          {KEYS.map((k) => (
            <button key={k} type="button" onClick={() => value.length < length && setValue(value + k)} className={cn(keyClass, "bg-clear-tile text-clear-ink hover:bg-clear-line")}>
              {k}
            </button>
          ))}
          <button type="button" onClick={startOver} className={cn(keyClass, "bg-transparent text-sm text-clear-ink-2 hover:text-clear-ink")}>
            {t("startOver")}
          </button>
          <button type="button" onClick={() => value.length < length && setValue(value + "0")} className={cn(keyClass, "bg-clear-tile text-clear-ink hover:bg-clear-line")}>
            0
          </button>
          <button
            type="button"
            aria-label={t("delete")}
            onClick={() => setValue(value.slice(0, -1))}
            className={cn(keyClass, "inline-flex items-center justify-center bg-transparent text-clear-ink hover:bg-clear-tile")}
          >
            <IconBackspace size={22} stroke={1.9} aria-hidden />
          </button>
        </div>
      </section>

      <p className="m-0 text-[13px] text-clear-muted">{t("laterHint")}</p>

      <StepFooter
        onBack={onBack}
        onSkip={onSkip}
        primaryLabel={saving ? tApp("saving") : stage === "choose" ? tApp("continue") : t("set")}
        onPrimary={primary}
        primaryDisabled={saving || (stage === "choose" ? pin.length < MIN_PIN : confirm.length < pin.length)}
      />
    </>
  );
}

// ── 12 · All set (Onboard-12) ─────────────────────────────────────────────────

export function FinishStep({
  firstName,
  imported,
  bills,
  strategy,
  appLock,
  finishing,
  onFinish,
}: {
  firstName: string;
  imported: number;
  bills: number;
  strategy: BudgetStrategyDraft;
  appLock: boolean;
  finishing: boolean;
  /** Gets the check circle's centre and radius (viewport px), where the bloom starts. */
  onFinish: (origin: { x: number; y: number; r: number } | null) => void;
}) {
  const t = useTranslations("onboarding.finish");
  const tApp = useTranslations("onboarding");
  const app = tApp("appName");
  const checkRef = useRef<HTMLSpanElement>(null);

  const tiles: { key: string; tone: ClearTone; icon: React.ReactNode; title: string; hint: string }[] = [
    {
      key: "import",
      tone: "mint",
      icon: <IconFileSpreadsheet stroke={1.9} />,
      title: imported > 0 ? t("transactions", { count: imported }) : t("noImport"),
      hint: imported > 0 ? t("imported") : t("noImportHint"),
    },
    {
      key: "bills",
      tone: "sky",
      icon: <IconCalendarRepeat stroke={1.9} />,
      title: t("bills", { count: bills }),
      hint: bills > 0 ? t("billsHint") : t("billsNone"),
    },
    {
      key: "strategy",
      tone: "peach",
      icon: <IconChartPie stroke={1.9} />,
      title: t("strategy", { needs: strategy.nodig, wants: strategy.willen, savings: strategy.sparen }),
      hint: t("strategyHint"),
    },
    {
      key: "lock",
      tone: "lilac",
      icon: <IconLock stroke={1.9} />,
      title: appLock ? t("lockOn") : t("lockOff"),
      hint: appLock ? t("lockOnHint") : t("lockOffHint"),
    },
  ];

  // Everything but the check fades while it pulses; the ember bloom
  // (FinishTransitionOverlay) then grows out of the check itself.
  const fade = cn("transition-opacity duration-300", finishing && "pointer-events-none opacity-0");

  function finish() {
    const rect = checkRef.current?.getBoundingClientRect();
    onFinish(rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, r: rect.width / 2 } : null);
  }

  return (
    <div className="flex flex-col items-center gap-7 text-center">
      <m.div
        aria-hidden
        animate={finishing ? { scale: [1, 1.08, 1] } : { scale: 1 }}
        transition={{ duration: 0.35, ease: "easeInOut", times: [0, 0.5, 1] }}
        className="flex size-[200px] items-center justify-center rounded-full bg-clear-card/55 sm:size-[260px]"
      >
        <div className="flex size-[164px] items-center justify-center rounded-full bg-clear-card sm:size-[212px]">
          <span ref={checkRef} className="inline-flex size-[124px] items-center justify-center rounded-full bg-clear-ember text-clear-ember-ink sm:size-40">
            <IconCheck size={64} stroke={2.6} />
          </span>
        </div>
      </m.div>

      <div className={cn("flex flex-col items-center gap-3", fade)}>
        <h1 className="m-0 text-[30px] leading-[1.1] font-extrabold tracking-[-0.03em] sm:text-[40px]">
          {firstName ? t("title", { name: firstName }) : t("titleNoName")}
        </h1>
        <p className="m-0 text-base leading-normal text-clear-ink-2">{t("subtitle", { app })}</p>
      </div>

      <ul aria-label={t("summaryLabel")} className={cn("m-0 grid w-full max-w-[820px] list-none grid-cols-1 gap-3 p-0 text-left min-[420px]:grid-cols-2 xl:grid-cols-4", fade)}>
        {tiles.map((tile) => (
          <li key={tile.key} className="flex flex-col gap-2.5 rounded-clear-tile bg-clear-card p-3.5">
            <IconTile tone={tile.tone} size="sm">
              {tile.icon}
            </IconTile>
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-extrabold tabular-nums">{tile.title}</span>
              <span className="text-xs text-clear-muted">{tile.hint}</span>
            </span>
          </li>
        ))}
      </ul>

      <ClearButton size="lg" onClick={finish} disabled={finishing} className={cn("mt-2 h-13 px-[30px] text-base", fade)}>
        {finishing ? t("opening") : t("open", { app })}
      </ClearButton>
    </div>
  );
}
