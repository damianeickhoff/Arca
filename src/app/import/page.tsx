import { redirect } from "next/navigation";

// Import lives in Settings now (Settings › Import, components/settings/import-panel.tsx).
// Old links and the bank callback's ?bank= / ?bankError= land here and carry on.
export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = new URLSearchParams();
  params.set("panel", "import");
  for (const [key, value] of Object.entries(await searchParams)) if (value != null) params.set(key, value);
  redirect(`/settings?${params.toString()}`);
}
