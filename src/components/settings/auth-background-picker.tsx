"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconCheck as Check } from "@tabler/icons-react";
import {
  AUTH_BACKGROUND_PRESETS,
  DEFAULT_AUTH_BACKGROUND_ID,
  authBackgroundPreviewStyle,
} from "@/lib/auth-background";
import { updateOwnAuthBackgroundAction } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

// Self-fetching: SettingsDialog is mounted in several places (dashboard header,
// debts/goals mobile pages) without a shared server-fetched user prop, so this reads
// its own current value from /api/profile/background instead of threading one more
// prop through every call site. Per-user (see users.authBackground), not app-wide, so
// each family member sharing the install can pick their own dashboard color fade.
export function AuthBackgroundPicker() {
  const router = useRouter();
  const [current, setCurrent] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile/background")
      .then((r) => r.json())
      .then((data) => setCurrent(data.authBackground ?? DEFAULT_AUTH_BACKGROUND_ID))
      .catch(() => setCurrent(DEFAULT_AUTH_BACKGROUND_ID));
  }, []);

  async function choose(id: string) {
    if (id === current) return;
    const previous = current;
    setCurrent(id);
    setSaving(id);
    const result = await updateOwnAuthBackgroundAction(id);
    setSaving(null);
    if (result?.error) { setCurrent(previous); return; }
    // The dashboard hero reads the preset server-side (src/app/page.tsx), so refresh
    // it now instead of waiting for the next unrelated navigation to pick it up.
    router.refresh();
  }

  return (
    <div className="rounded-2xl bg-[var(--dialog-content-background)] p-5">
      <p className="font-medium">Background</p>
      <p className="text-sm text-foreground/50 mb-4">Choose a color fade for your own dashboard background.</p>
      <div className="grid grid-cols-3 gap-3">
        {AUTH_BACKGROUND_PRESETS.map((preset) => {
          const isSelected = current === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => choose(preset.id)}
              disabled={saving !== null}
              className="flex flex-col items-center gap-1.5"
            >
              <span
                className={cn(
                  "relative h-14 w-full rounded-xl ring-2 ring-offset-2 ring-offset-[#2e2e30] transition-all",
                  isSelected ? "ring-white" : "ring-transparent",
                )}
                style={authBackgroundPreviewStyle(preset)}
              >
                {isSelected && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Check className="size-5 text-white drop-shadow" />
                  </span>
                )}
              </span>
              <span className="text-xs text-foreground/60">{preset.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
