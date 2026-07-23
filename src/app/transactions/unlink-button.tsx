"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconXFilled as X
} from "@tabler/icons-react";

export function UnlinkButton({ linkId }: { linkId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function unlink() {
    setLoading(true);
    await fetch("/api/reimbursements", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: linkId }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={unlink}
      disabled={loading}
      title="Ontkoppelen"
      className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
    >
      <X className="size-3.5" />
    </button>
  );
}
