import { redirect } from "next/navigation";

// Adding a debt happens in the form sheet on the Debts page; old links land there.
export default function AddDebtPage() {
  redirect("/debts?add=owe");
}
