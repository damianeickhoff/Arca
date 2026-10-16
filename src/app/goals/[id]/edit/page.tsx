import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The goal form is a dialog on the Goals page now; this keeps old links working. */
export default async function EditGoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!Number.isFinite(Number(id))) notFound();
  redirect(`/goals?edit=${id}`);
}
