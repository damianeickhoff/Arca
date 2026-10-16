import { redirect } from "next/navigation";

// Adding an asset is a dialog on the Accounts settings panel now; old links land
// there with the dialog open.
export default function AddAssetPage() {
  redirect("/settings?panel=accounts&add=asset");
}
