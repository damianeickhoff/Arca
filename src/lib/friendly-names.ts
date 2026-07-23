import { FRIENDLY_NAMES } from "@/config/friendlyNames";

/** Returns the configured friendly name for a transaction description, or null if none match. */
export function resolveFriendlyName(description: string): string | null {
  const desc = description.toLowerCase();
  for (const rule of FRIENDLY_NAMES) {
    if (desc.includes(rule.pattern.toLowerCase())) return rule.name;
  }
  return null;
}

/**
 * The name to display for a transaction, in precedence order:
 *   1. customName          — per-transaction manual override
 *   2. recurringFriendlyName — a matched recurring item's friendly name
 *   3. friendlyNames.ts cleanup for the raw description
 *   4. the raw description
 */
export function resolveDisplayName(row: {
  customName?: string | null;
  recurringFriendlyName?: string | null;
  description: string;
}): string {
  return row.customName ?? row.recurringFriendlyName ?? resolveFriendlyName(row.description) ?? row.description;
}
