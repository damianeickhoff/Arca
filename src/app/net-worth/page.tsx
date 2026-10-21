import { redirect } from "next/navigation";

/** Net worth lives on Insights (/reports?tab=vermogen, drawn by ./net-worth-tab.tsx);
 * old links and bookmarks keep their range (?range=1m|3m|6m|1y). */
export default async function NetWorthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams({ tab: "vermogen" });
  for (const [key, value] of Object.entries(sp)) {
    if (key === "tab" || value == null) continue;
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
  }
  redirect(`/reports?${params.toString()}`);
}
