"use server";

import { cookies } from "next/headers";

export async function selectBankAction(accountNumber: string) {
  const store = await cookies();
  if (accountNumber) {
    store.set("selected_bank", accountNumber, { path: "/", maxAge: 31536000 });
  } else {
    store.delete("selected_bank");
  }
}
