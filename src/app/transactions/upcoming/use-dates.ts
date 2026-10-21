"use client";

import { useLocale } from "next-intl";

/** The date wordings Upcoming uses, in the user's locale. */
export function useDates() {
  const locale = useLocale();
  const at = (date: string) => new Date(`${date}T12:00:00`);
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" });
  const shortFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const longFmt = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" });
  const monthFmt = new Intl.DateTimeFormat(locale, { month: "long" });
  const relativeFmt = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  return {
    /** "Thu 15 Oct" */
    day: (date: string) => dayFmt.format(at(date)),
    /** "15 Oct" */
    short: (date: string) => shortFmt.format(at(date)),
    /** "Thursday 15 October" */
    long: (date: string) => longFmt.format(at(date)),
    /** "January" */
    month: (date: string) => monthFmt.format(at(date)),
    /** "tomorrow", "in 4 days" */
    relative: (days: number) => relativeFmt.format(days, "day"),
  };
}

/** Whole days from `from` to `to` (negative when `to` has passed). */
export function daysBetween(from: string, to: string) {
  return Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000);
}
