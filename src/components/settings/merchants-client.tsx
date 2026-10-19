"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { IconBuildingStore, IconChevronRight } from "@tabler/icons-react";
import { Icon } from "@/components/icon";
import { ListRow } from "@/components/clear/list-row";
import { Segmented } from "@/components/clear/segmented";
import { ClearProgress } from "@/components/clear/progress";
import { AnchoredTip } from "@/components/anchored-tip";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import { SettingsEmpty, SettingsSearch } from "@/components/settings/settings-ui";
import { MerchantDetailPortal, merchantIcon, type MerchantRef } from "@/components/merchant-detail-portal";
import { EditMerchantDialog, MerchantSettingsClient } from "@/components/settings/merchant-settings-client";
import { formatEur } from "@/lib/format";
import type { MerchantListItem } from "@/lib/merchants";
import type { Category } from "@/db/schema";

type Filter = "all" | "noIcon";

/** The Merchants settings panel: how many merchants have a logo, a search and an
 *  All / Without icon switch, and the list. A row opens the merchant editor. */
export function MerchantsClient({ initialMerchants, categories }: { initialMerchants: MerchantListItem[]; categories: Category[] }) {
  const t = useTranslations("settings.merchants");
  const tPanels = useTranslations("settings.panels");
  const [merchants, setMerchants] = useState<MerchantListItem[]>(initialMerchants);

  // Render-time sync: router.refresh() hands down a fresh
  // array, but useState only reads its initial value once.
  const [prevInitial, setPrevInitial] = useState(initialMerchants);
  if (initialMerchants !== prevInitial) {
    setPrevInitial(initialMerchants);
    setMerchants(initialMerchants);
  }

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openProfile, setOpenProfile] = useState<MerchantRef | null>(null);

  // `editingId` stays set while the dialog animates closed, so its content doesn't
  // vanish mid-animation; `editOpen` opens and closes it.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  function closeEdit() {
    setEditOpen(false);
  }

  const withIcon = merchants.filter((m) => merchantIcon(m).iconKey != null).length;
  const withoutIcon = merchants.length - withIcon;
  const term = query.trim().toLowerCase();
  const visible = merchants
    .filter((m) => filter === "all" || merchantIcon(m).iconKey == null)
    .filter((m) => !term || m.name.toLowerCase().includes(term));
  const editing = merchants.find((m) => m.id === editingId) ?? null;

  return (
    <>
      <PanelHeader title={tPanels("merchants.title")} />
      <div className="flex flex-col gap-4 px-4 pt-1 font-clear text-clear-ink">
        {merchants.length > 0 && (
          <>
            <div className="flex flex-col gap-2 rounded-clear-tile bg-clear-tile px-4 py-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[15px] font-bold">{t("count", { count: merchants.length })}</span>
                <span className="text-[13px] text-clear-ink-2">{t("withIcon", { count: withIcon, total: merchants.length })}</span>
              </div>
              <ClearProgress value={withIcon / merchants.length} size="sm" fillClassName="bg-clear-positive-fill" />
            </div>

            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <SettingsSearch value={query} onChange={setQuery} placeholder={t("search")} label={t("search")} className="min-w-0 flex-1" />
              <span data-tip-anchor="merchantsWithoutIcon" className="inline-flex shrink-0">
                <Segmented
                  label={t("filterLabel")}
                  surface="tile"
                  value={filter}
                  onChange={setFilter}
                  items={[
                    { value: "all", label: t("filterAll", { count: merchants.length }) },
                    { value: "noIcon", label: t("filterNoIcon", { count: withoutIcon }) },
                  ]}
                />
              </span>
            </div>
          </>
        )}

        {visible.length > 0 ? (
          <div className="flex flex-col">
            {visible.map((m) => {
              const icon = merchantIcon(m);
              return (
                <ListRow
                  key={m.id}
                  onClick={() => { setEditingId(m.id); setEditOpen(true); }}
                  icon={<Icon iconKey={icon.iconKey} color={icon.color} background={icon.background} soft size="md" />}
                  title={m.name}
                  meta={`${t("transactionCount", { count: m.transactionCount })} · ${formatEur(m.totalSpent)}`}
                  trailing={<IconChevronRight aria-hidden size={18} stroke={2} className="shrink-0 text-clear-placeholder" />}
                />
              );
            })}
          </div>
        ) : (
          <SettingsEmpty icon={<IconBuildingStore stroke={1.9} />}>
            {term ? t("noMatch") : filter === "noIcon" ? t("allHaveIcons") : t("empty")}
          </SettingsEmpty>
        )}
      </div>

      {/* The Without icon switch is new — point it out once. */}
      {merchants.length > 0 && <AnchoredTip id="merchantsWithoutIcon" anchor="merchantsWithoutIcon" />}

      <EditMerchantDialog open={editOpen} onClose={closeEdit}>
        {editing && (
          <MerchantSettingsClient
            key={editing.id}
            merchant={editing}
            categories={categories}
            onClose={closeEdit}
            // Opens the profile *on top* of this editor (portal z-70) rather than
            // closing it first — closing would play its exit animation behind the
            // incoming profile, which reads as the editor falling away.
            onViewProfile={() => setOpenProfile({ id: editing.id, name: editing.name })}
          />
        )}
      </EditMerchantDialog>

      <MerchantDetailPortal merchant={openProfile} onClose={() => setOpenProfile(null)} allowEdit={false} />
    </>
  );
}
