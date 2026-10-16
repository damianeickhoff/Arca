import { redirect } from "next/navigation";

/** Net worth lives in Insights now; this keeps old links and bookmarks working. */
export default function NetWorthPage() {
  redirect("/reports?tab=vermogen");
}
