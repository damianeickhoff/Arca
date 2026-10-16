import { redirect } from "next/navigation";

// The old full-page "add recurring item" form. Every button now opens the Clear form in
// place (components/settings/recurring/add-recurring-button.tsx); old links and bookmarks
// land on Settings › Recurring, which has its own Add button.
export default function AddRecurringPage() {
  redirect("/settings?panel=recurring");
}
