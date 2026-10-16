import { notFound, redirect } from "next/navigation";

// Editing a debt happens in the form sheet on the Debts page; old links land there.
export default async function EditDebtPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!Number.isFinite(Number(id))) notFound();
  redirect(`/debts?edit=${id}`);
}
