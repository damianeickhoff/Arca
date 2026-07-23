import { ReactNode } from "react";
import { authBackgroundStyle, getAuthBackgroundPreset } from "@/lib/auth-background";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/utils";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  // Omit both when the child content owns its own heading — the onboarding wizard
  // does this so it can swap between the intro splash and a persistent small logo
  // per step instead of one fixed hero.
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  // The background is per-user now (see users.authBackground), but there's no signed-in
  // user yet on this screen — always the default preset here, whichever user logs in
  // then sees their own choice on the dashboard.
  const bgStyle = authBackgroundStyle(getAuthBackgroundPreset(null));

  return (
    <div className="min-h-dvh w-full relative overflow-hidden bg-[#050e2e]">
      {/* Full-bleed background — one of the preset color fades (picked in Settings →
          Appearance), no card or split panel on top of it; the whole viewport reads as
          one continuous scene, the way the dashboard's wallet hero does. */}
      <div className="fixed inset-0" style={bgStyle} />

      {/* Dark scrim so form text stays legible regardless of which preset is active —
          heavier at the edges, clearest center. */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: "radial-gradient(120% 90% at 50% 30%, transparent 0%, rgba(3,8,30,0.35) 60%, rgba(3,8,30,0.75) 100%)" }}
      />

      {/* Soft glowing blobs — the same "aurora" motif as the onboarding finishing
          overlay, so the whole auth flow feels like one continuous piece of art
          instead of a plain flat gradient. */}
      <div aria-hidden className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-1/3 -left-1/4 size-[65vmax] rounded-full bg-blue-500/25 blur-[120px]" />
        <div className="absolute -bottom-1/3 -right-1/4 size-[65vmax] rounded-full bg-indigo-400/20 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[50vmax] rounded-full bg-sky-400/10 blur-[140px]" />
      </div>

      {/* Content column — single centered column, no card chrome, no split layout.
          Logo, heading, and form stack directly on the gradient at any viewport size. */}
      <div className="relative min-h-dvh w-full flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm flex flex-col items-center text-center">
          {title && (
            <>
              <BrandMark variant="light" size="lg" />
              <h1 className="mt-6 text-3xl sm:text-4xl font-black tracking-tight leading-[1.05] text-white">
                {title}
              </h1>
              {subtitle && <p className="mt-3 text-base text-white/60">{subtitle}</p>}
            </>
          )}

          <div className={cn("w-full", title ? "mt-8" : "")}>{children}</div>
        </div>
      </div>
    </div>
  );
}
