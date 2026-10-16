import { cn } from "@/lib/utils";

/**
 * A single centred card for error and not-found pages: an illustration, the title,
 * one sentence, an optional reference chip, the actions and an optional footer line.
 * Fills the space beside the shell and centres itself (AGENTS.md: single-card pages
 * may). All text arrives translated.
 */
export function StatusCard({
  illustration,
  title,
  body,
  chip,
  actions,
  footer,
  titleId = "status-title",
}: {
  illustration: React.ReactNode;
  title: string;
  body: string;
  chip?: React.ReactNode;
  actions: React.ReactNode;
  footer?: React.ReactNode;
  titleId?: string;
}) {
  return (
    <div className="flex min-h-[calc(100dvh-var(--nav-clearance))] items-center justify-center px-4 pt-[calc(var(--sat)+16px)] pb-4 font-clear text-clear-ink lg:min-h-dvh lg:px-8 lg:pt-7 lg:pb-12">
      <section
        aria-labelledby={titleId}
        className="flex w-full max-w-[640px] flex-col items-center gap-[22px] rounded-clear-card bg-clear-card px-6 py-10 text-center lg:px-12 lg:pt-12 lg:pb-10"
      >
        {illustration}
        <div className="flex flex-col items-center gap-3">
          <h1 id={titleId} className="m-0 text-[26px] leading-tight font-extrabold tracking-[-0.03em] lg:text-[32px]">
            {title}
          </h1>
          <p className="m-0 max-w-[480px] text-[15px] leading-normal text-clear-ink-2 lg:text-base">{body}</p>
        </div>
        {chip}
        <div className="flex flex-wrap justify-center gap-2.5 pt-1">{actions}</div>
        {footer && <span className="text-[13px] text-clear-muted">{footer}</span>}
      </section>
    </div>
  );
}

/** A tilted receipt with a round ember badge: "!" for errors, "?" for a missing page. */
export function ReceiptIllustration({ badge, className }: { badge: "alert" | "question"; className?: string }) {
  return (
    <svg width="220" height="164" viewBox="0 0 220 164" aria-hidden className={cn("max-w-full", className)}>
      <circle cx="110" cy="84" r="74" className="fill-clear-tile" />
      <circle cx="36" cy="40" r="7" className="fill-clear-butter" />
      <circle cx="188" cy="132" r="9" className="fill-clear-sky" />
      <circle cx="180" cy="34" r="5" className="fill-clear-lilac" />
      <rect x="40" y="128" width="26" height="8" rx="4" className="fill-clear-mint" />
      <g transform="rotate(-9 110 84)">
        <path d="M78 26h64v104l-8 7-8-7-8 7-8-7-8 7-8-7-8 7-8-7z" strokeWidth="3" strokeLinejoin="round" className="fill-clear-card stroke-clear-ink" />
        <rect x="90" y="42" width="40" height="7" rx="3.5" className="fill-clear-ink" />
        <rect x="90" y="60" width="26" height="5" rx="2.5" className="fill-clear-line" />
        <rect x="120" y="60" width="10" height="5" rx="2.5" className="fill-clear-line" />
        <rect x="90" y="74" width="20" height="5" rx="2.5" className="fill-clear-line" />
        <rect x="116" y="74" width="14" height="5" rx="2.5" className="fill-clear-line" />
        <rect x="90" y="88" width="30" height="5" rx="2.5" className="fill-clear-line" />
        <line x1="90" y1="104" x2="130" y2="104" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" className="stroke-clear-ink" />
        <rect x="112" y="112" width="18" height="7" rx="3.5" className="fill-clear-peach" />
      </g>
      <circle cx="154" cy="40" r="22" strokeWidth="5" className="fill-clear-ember stroke-clear-card" />
      {badge === "alert" ? (
        <>
          <line x1="154" y1="30" x2="154" y2="42" strokeWidth="4" strokeLinecap="round" className="stroke-clear-ember-ink" />
          <circle cx="154" cy="50" r="2.6" className="fill-clear-ember-ink" />
        </>
      ) : (
        <>
          <path d="M147 34a7 7 0 1 1 10 6.3c-2 1-3 2.4-3 4.2" fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-clear-ember-ink" />
          <circle cx="154" cy="51" r="2.6" className="fill-clear-ember-ink" />
        </>
      )}
    </svg>
  );
}

/** A cloud crossed out by an ember line, for the offline page. */
export function OfflineIllustration({ className }: { className?: string }) {
  return (
    <svg width="168" height="132" viewBox="0 0 168 132" aria-hidden className={cn("max-w-full", className)}>
      <circle cx="84" cy="66" r="62" className="fill-clear-sky" />
      <circle cx="30" cy="24" r="6" className="fill-clear-butter" />
      <circle cx="146" cy="104" r="8" className="fill-clear-peach" />
      <circle cx="140" cy="30" r="4" className="fill-clear-lilac" />
      <g className="fill-clear-card">
        <rect x="38" y="64" width="92" height="34" rx="17" />
        <circle cx="68" cy="64" r="20" />
        <circle cx="96" cy="58" r="26" />
      </g>
      <rect x="58" y="84" width="54" height="5" rx="2.5" className="fill-clear-stone" />
      <line x1="48" y1="30" x2="122" y2="108" strokeWidth="14" strokeLinecap="round" className="stroke-clear-ground" />
      <line x1="48" y1="30" x2="122" y2="108" strokeWidth="7" strokeLinecap="round" className="stroke-clear-ember" />
    </svg>
  );
}
