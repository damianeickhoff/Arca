import { cn } from "@/lib/utils";
import { SHEET_COLUMN } from "@/components/page-container";

// Where anything that docks to the bottom of the screen sits: full-bleed with
// 1.5rem gutters on a phone, capped to the shared content column and centred on
// desktop. Moved here from the old bottom nav, which the app shell's tab bar replaced.
export const bottomDockClass = cn(SHEET_COLUMN, "fixed inset-x-0 bottom-5 px-6");
