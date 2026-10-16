import { redirect } from "next/navigation";

// Adding a bank account is a dialog on the Accounts settings panel now; old links
// land there with the dialog open.
export default function AddBankPage() {
  redirect("/settings?panel=accounts&add=bank");
}
