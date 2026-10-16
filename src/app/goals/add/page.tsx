import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The goal form is a dialog on the Goals page now; this keeps old links working. */
export default async function AddGoalPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  redirect(`/goals?new=${type === "savings" || type === "expense" ? type : "choose"}`);
}
