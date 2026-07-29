"use client";

import { useState } from "react";
import { IconSearch as Search, IconChevronRight as ChevronRight } from "@tabler/icons-react";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/icon";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import { MerchantDetailPortal, merchantIcon, type MerchantRef } from "@/components/merchant-detail-portal";
import { MerchantSettingsClient, MerchantSettingsOverlay } from "@/components/settings/merchant-settings-client";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MerchantListItem } from "@/lib/merchants";

interface Props {
  initialMerchants: MerchantListItem[];
  /** Renders the shared sticky PanelHeader — on for the settings-dialog panel, which
   *  supplies no chrome of its own. Mirrors BrandIconsClient's prop of the same name. */
  panelHeader?: boolean;
}

export function MerchantsClient({ initialMerchants, panelHeader = true }: Props) {
  const [merchants, setMerchants] = useState<MerchantListItem[]>(initialMerchants);

  // Same render-time sync as BrandIconsClient: router.refresh() hands down a fresh
  // array, but useState only reads its initial value once.
  const [prevInitial, setPrevInitial] = useState(initialMerchants);
  if (initialMerchants !== prevInitial) {
    setPrevInitial(initialMerchants);
    setMerchants(initialMerchants);
  }

  const [query, setQuery] = useState("");
  const [openProfile, setOpenProfile] = useState<MerchantRef | null>(null);

  // `editingId` keeps the editor mounted; `editVisible` drives its slide animation, so
  // the layer survives long enough to animate back out instead of vanishing.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editVisible, setEditVisible] = useState(false);

  function closeEdit() {
    setEditVisible(false);
    setTimeout(() => setEditingId(null), 320);
  }

  const term = query.trim().toLowerCase();
  const visible = term ? merchants.filter((m) => m.name.toLowerCase().includes(term)) : merchants;
  const editing = merchants.find((m) => m.id === editingId) ?? null;

  return (
    <>
      {panelHeader && <PanelHeader title="Merchants" />}
      <div className="px-4 pt-1 pb-8 space-y-4">
        {merchants.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-foreground/40" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search merchants"
              className="pl-10 text-sm"
            />
          </div>
        )}

        {visible.length > 0 ? (
          <section>
            <div className="flex items-baseline justify-between px-1 mb-2.5">
              <h2 className="text-sm font-medium text-foreground/45">Merchants</h2>
              <span className="text-sm font-medium text-foreground/45 tabular-nums">{visible.length}</span>
            </div>
            <div className="space-y-3">
              {visible.map((m) => {
                const icon = merchantIcon(m);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { setEditingId(m.id); setEditVisible(true); }}
                    className={cn(
                      "w-full flex items-center gap-4 rounded-2xl px-4 py-3.5 text-left active:scale-[0.99] transition-transform",
                      panelHeader ? "bg-[var(--dialog-content-background)]" : "bg-card",
                    )}
                  >
                    <span className="size-12 shrink-0">
                      <Icon iconKey={icon.iconKey} color={icon.color} background={icon.background} round size="xl" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-lg truncate leading-tight">{m.name}</p>
                      <p className="text-sm text-foreground/50 truncate mt-0.5 tabular-nums">
                        {m.transactionCount} {m.transactionCount === 1 ? "transaction" : "transactions"} · {formatEur(m.totalSpent)}
                      </p>
                    </div>
                    <ChevronRight className="size-4 text-foreground/30 shrink-0" />
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <div className={cn("rounded-2xl py-16 text-center text-muted-foreground", panelHeader ? "bg-[var(--dialog-content-background)]" : "bg-card")}>
            <p className="text-sm">{term ? "No merchants match that search" : "No merchants yet"}</p>
          </div>
        )}
      </div>

      {/* Edit merchant — a full-screen slide-over above the settings panel, the same
          drill-down shape CategoryDetailPortal uses for its embedded category editor.
          z-[52] sits above the settings dialog (z-50) and below BrandIconPicker's own
          dialog (overlay z-85 / content z-90), so the icon picker still opens on top. */}
      {editing && (
        <MerchantSettingsOverlay open={editVisible} zIndex={52}>
          <MerchantSettingsClient
            key={editing.id}
            merchant={editing}
            onClose={closeEdit}
            // Opens the profile *on top* of this editor (portal z-70) rather than
            // closing it first — closing would play its exit animation behind the
            // incoming profile, which reads as the editor falling away.
            onViewProfile={() => setOpenProfile({ id: editing.id, name: editing.name })}
          />
        </MerchantSettingsOverlay>
      )}

      <MerchantDetailPortal merchant={openProfile} onClose={() => setOpenProfile(null)} allowEdit={false} />
    </>
  );
}
