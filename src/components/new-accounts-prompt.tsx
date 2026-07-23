"use client";

import { useState } from "react";
import { IconBuildingBank as Landmark } from "@tabler/icons-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/date-picker";
import type { Bank } from "@/db/schema";
import { currencySymbol } from "@/lib/format";

// Shown right after a CSV import (or the onboarding import step) introduces one or more
// brand-new bank accounts. Lets the user backfill a starting saldo/date for each — the
// value is added to the account's displayed balance but never touches reports, since
// import history rarely reaches back to when the account was actually opened.
export function NewAccountsPrompt({ accounts, onDone }: { accounts: Bank[]; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [values, setValues] = useState<Record<number, { name: string; balance: string; date: string }>>({});
  const [saving, setSaving] = useState(false);

  function fieldsFor(id: number, fallbackName: string) {
    return values[id] ?? { name: fallbackName, balance: "", date: today };
  }
  function setField(id: number, fallbackName: string, key: "name" | "balance" | "date", value: string) {
    setValues((v) => ({ ...v, [id]: { ...fieldsFor(id, fallbackName), [key]: value } }));
  }

  async function save() {
    setSaving(true);
    await Promise.all(
      accounts
        .filter((a) => {
          const f = fieldsFor(a.id, a.displayName ?? "");
          return f.balance.trim() !== "" || f.name.trim() !== (a.displayName ?? "");
        })
        .map((a) => {
          const f = fieldsFor(a.id, a.displayName ?? "");
          const body: Record<string, unknown> = { id: a.id };
          if (f.balance.trim() !== "") {
            body.startingBalance = parseFloat(f.balance);
            body.startingDate = f.date || null;
          }
          if (f.name.trim() !== (a.displayName ?? "")) body.displayName = f.name.trim() || null;
          return fetch("/api/banks", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        }),
    );
    setSaving(false);
    onDone();
  }

  return (
    <Dialog open={accounts.length > 0} onOpenChange={(v) => !v && onDone()}>
      <DialogContent
        className="sm:max-w-lg max-h-[90dvh] overflow-y-auto [scrollbar-gutter:stable]"
        sheetClassName="bg-[#0f1533]/95 backdrop-blur-xl text-white border border-white/10"
      >
        <DialogHeader>
          <DialogTitle className="text-white">{accounts.length === 1 ? "New account found" : "New accounts found"}</DialogTitle>
          <DialogDescription className="text-white/60">
            Add a starting saldo if you want this account&apos;s balance to be accurate from before this import — it never affects reports.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {accounts.map((a) => {
            const f = fieldsFor(a.id, a.displayName ?? "");
            return (
              <div key={a.id} className="rounded-xl bg-white/5 p-4 space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="size-9 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                    <Landmark className="size-4 text-white" />
                  </div>
                  <p className="font-semibold text-sm truncate text-white">{a.displayName ?? a.accountNumber}</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-white/60">Friendly name</label>
                  <Input
                    value={f.name}
                    onChange={(e) => setField(a.id, a.displayName ?? "", "name", e.target.value)}
                    placeholder={a.accountNumber ?? ""}
                    className="bg-white/10 border-white/15 text-white placeholder:text-white/35 focus-visible:border-white/40 focus-visible:ring-white/20"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/60">Starting balance ({currencySymbol()})</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={f.balance}
                      onChange={(e) => setField(a.id, a.displayName ?? "", "balance", e.target.value)}
                      placeholder="0"
                      className="bg-white/10 border-white/15 text-white placeholder:text-white/35 focus-visible:border-white/40 focus-visible:ring-white/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/60">Starting date</label>
                    <DatePicker value={f.date} onChange={(v) => setField(a.id, a.displayName ?? "", "date", v)} dark />
                  </div>
                </div>
              </div>
            );
          })}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 bg-white/10 text-white border-white/20 hover:bg-white/15"
              onClick={onDone}
              disabled={saving}
            >
              Skip
            </Button>
            <Button className="flex-1 bg-white text-[#0a1a5c] hover:bg-white/90" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
