import { redirect } from "next/navigation";

/** Trends lives on Insights now (/reports?tab=trends); old links keep their period and
 * comparison months (from, to, cmpA, cmpB, cat, acct). */
export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams({ tab: "trends" });
  for (const [key, value] of Object.entries(sp)) {
    if (key === "tab" || value == null) continue;
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
  }
  redirect(`/reports?${params.toString()}`);
}
