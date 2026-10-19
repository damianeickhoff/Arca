"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { IconChevronRight, IconLogout, IconPencil, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { SHEET_COLUMN } from "@/components/page-container";
import packageJson from "../../../package.json";
import type { User } from "@/db/schema";
import type { FinancialMonthConfig } from "@/lib/date-range";
import type { SettingsPanelContent } from "@/app/settings-panel-content";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import { logoutAction } from "@/app/actions/auth";
import type { BudgetRecurringMode, SharedCostMode } from "@/lib/app-settings";
import { PanelChromeContext } from "@/components/settings/settings-panel-chrome";
import { SettingsPanelBody } from "@/components/settings/settings-panel-body";
import { settingsSections, isHeavyPanel, type SettingsPanelKey } from "@/components/settings/settings-sections";
import { ProfileForms, SecurityForms } from "@/components/settings/account-forms";
import { AnchoredTip } from "@/components/anchored-tip";
import { BrandMark } from "@/components/clear/brand-mark";
import { TONE_FILL, type ClearTone } from "@/components/clear/tones";
import { useSettingsPortal } from "@/lib/settings-portal-state";

// The pastel each row's icon sits on, as drawn in the phone Settings concept.
const ROW_TONES: Record<SettingsPanelKey, ClearTone> = {
  profile: "peach",
  security: "stone",
  accounts: "sky",
  categories: "mint",
  recurring: "butter",
  merchants: "lilac",
  automations: "mint",
  financialMonth: "peach",
  monthOverrides: "peach",
  budgetRecurring: "peach",
  import: "sky",
  importProfiles: "sky",
  dataHealth: "rose",
  appearance: "butter",
  privacy: "stone",
  appLock: "stone",
  language: "sky",
  currency: "mint",
  ai: "lilac",
  help: "mint",
  users: "lilac",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function Avatar({ user, size }: { user: User; size: number }) {
  if (user.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={user.avatarUrl} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-clear-peach font-clear font-extrabold text-clear-peach-ink"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      {initials(user.name)}
    </span>
  );
}

/** The phone Settings sheet, opened from the Home avatar. Desktop uses the /settings
 *  page, which lists the same sections (settings-sections.ts). */
export function SettingsDialog({
  user,
  panels,
  financialMonth,
  budgetRecurringMode = "budgeted",
  sharedCostMode = "gross",
  iconOnly,
}: {
  user: User;
  panels: SettingsPanelContent;
  financialMonth: FinancialMonthConfig;
  budgetRecurringMode?: BudgetRecurringMode;
  sharedCostMode?: SharedCostMode;
  /** Just the avatar; otherwise the avatar and the first name in a pill. */
  iconOnly?: boolean;
}) {
  const t = useTranslations("settings");
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Sub-panel with slide animation: `active` is the rendered panel, `visible`
  // drives the transform so it can animate out before unmounting.
  const [active, setActive] = useState<SettingsPanelKey | null>(null);
  const [visible, setVisible] = useState(false);

  // Lets a server-rendered sibling (e.g. the dashboard's Accounts card) open this
  const { requestedPanel, clearRequest } = useSettingsPortal();
  useEffect(() => {
    if (requestedPanel) {
      setOpen(true);
      openPanel(requestedPanel);
      clearRequest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedPanel]);

  function openPanel(key: SettingsPanelKey) {
    setActive(key);
    // Next frame so the initial (off-screen) transform is committed before flipping.
    requestAnimationFrame(() => setVisible(true));
  }
  function closePanel() {
    setVisible(false);
    setTimeout(() => setActive(null), 280);
  }

  // Keyboard equivalent of the edge-swipe-back below: with a sub-panel open,
  // Escape steps back to the settings menu instead of dismissing the whole sheet.
  // The panel is a descendant of the drawer, so Radix would otherwise close the
  // drawer out from under it — aboveDialog takes the key first.
  useEscapeToClose(active != null && visible, closePanel, { aboveDialog: true });

  // Edge-swipe-back for the sub-panel — mirrors iOS: dragging in from the left
  // edge tracks the finger 1:1, releasing past a threshold (or with a fast
  // flick) commits the close, otherwise it springs back to place. Restricted to
  // starting near the left edge so it doesn't fight normal vertical scrolling
  // or horizontal-scrolling content inside the panel.
  const dragStartX = useRef<number | null>(null);
  const dragStartTime = useRef(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  function onPanelTouchStart(e: React.TouchEvent) {
    const x = e.touches[0].clientX;
    if (x > 24) return;
    dragStartX.current = x;
    dragStartTime.current = Date.now();
    setDragging(true);
  }
  function onPanelTouchMove(e: React.TouchEvent) {
    if (dragStartX.current == null) return;
    const dx = e.touches[0].clientX - dragStartX.current;
    if (dx > 0) setDragX(dx);
  }
  function onPanelTouchEnd() {
    if (dragStartX.current == null) return;
    const elapsed = Date.now() - dragStartTime.current;
    const velocity = dragX / Math.max(elapsed, 1);
    const shouldClose = dragX > 100 || (dragX > 40 && velocity > 0.5);
    dragStartX.current = null;
    setDragging(false);
    setDragX(0);
    if (shouldClose) closePanel();
  }

  // Reset the panel stack whenever the whole dialog closes. Synced during render
  // (guarded) rather than in an effect — the house pattern for this codebase.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setVisible(false);
      setActive(null);
    }
  }

  const firstName = user.name.split(" ")[0] || user.name;

  // The profile is edited from the profile card here, so no Account group; admins get
  // Users at the bottom of the App group.
  const sections = settingsSections({ isAdmin: user.isAdmin, withAccount: false });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("open")}
        // Target for the "everything else is behind your photo" pointer tip. Only one
        // SettingsDialog is ever rendered per route, so the selector stays unambiguous.
        data-tip-anchor="settingsTrigger"
        className={cn(
          "inline-flex shrink-0 cursor-pointer items-center rounded-full bg-clear-card font-clear text-clear-ink outline-none transition-transform focus-visible:ring-3 focus-visible:ring-clear-ember/50 active:scale-[0.97]",
          iconOnly ? "size-11 justify-center" : "h-11 max-w-[60vw] gap-2 p-1 pr-4",
        )}
      >
        <Avatar user={user} size={iconOnly ? 44 : 36} />
        {!iconOnly && <span className="truncate text-sm font-bold">{firstName}</span>}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="px-0" sheetClassName="bg-clear-ground" hideHeaderRow title={t("title")}>
          <div className="flex flex-col gap-3.5 px-4 pt-4 pb-2 font-clear text-clear-ink">
            {/* Header */}
            <div className="flex h-12 items-center gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("close")}
                className="inline-flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-clear-card text-clear-ink transition-colors hover:bg-clear-tile"
              >
                <IconX size={22} stroke={2.2} aria-hidden />
              </button>
              <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.03em]">{t("title")}</h1>
            </div>

            {/* Profile */}
            <section aria-label={t("dialog.profile")} className="flex items-center gap-3.5 rounded-clear-card bg-clear-card p-4">
              <Avatar user={user} size={56} />
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="truncate text-[17px] font-extrabold tracking-[-0.01em]">{user.name}</span>
                <span className="truncate text-[13px] text-clear-muted">{user.email}</span>
              </span>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                aria-label={t("editProfile")}
                className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-clear-ground text-clear-ink transition-colors hover:bg-clear-line"
              >
                <IconPencil size={18} stroke={1.9} aria-hidden />
              </button>
            </section>

            {/* Sections */}
            {sections.map((section) => (
              <section key={section.key} aria-labelledby={`settings-dialog-${section.key}`} className="flex flex-col gap-2">
                <h2 id={`settings-dialog-${section.key}`} className="m-0 ml-1.5 text-[13px] font-bold text-clear-muted">
                  {t(`sections.${section.key}`)}
                </h2>
                <div className="flex flex-col rounded-clear-card bg-clear-card py-1">
                  {section.rows.map(({ key, icon: Icon }, i) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => openPanel(key)}
                      // Data Health and AI rows are tip targets; the attribute is
                      // undefined on every other row so the selector stays unique.
                      data-tip-anchor={key === "dataHealth" ? "dataHealthMenu" : key === "ai" ? "settingsAi" : undefined}
                      className={cn(
                        "flex h-[52px] w-full cursor-pointer items-center gap-3 border-t pr-3.5 pl-3 text-left text-clear-ink transition-colors active:bg-clear-tile",
                        i === 0 ? "border-transparent" : "border-clear-ground",
                      )}
                    >
                      <span aria-hidden className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-clear-icon", TONE_FILL[ROW_TONES[key]])}>
                        <Icon size={18} stroke={1.9} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{t(`panels.${key}.title`)}</span>
                      <IconChevronRight aria-hidden size={18} stroke={2} className="shrink-0 text-clear-placeholder" />
                    </button>
                  ))}
                </div>
              </section>
            ))}

            {/* Sign out */}
            <button
              type="button"
              onClick={() => logoutAction()}
              className="flex h-[52px] cursor-pointer items-center gap-3 rounded-clear-card bg-clear-card pr-3.5 pl-3 text-left text-clear-negative transition-colors active:bg-clear-tile"
            >
              <span aria-hidden className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-clear-icon", TONE_FILL.rose)}>
                <IconLogout size={18} stroke={1.9} />
              </span>
              <span className="text-[15px] font-bold">{t("signOut")}</span>
            </button>

            <div className="flex flex-col items-center gap-1.5 pt-4 pb-2 text-center text-clear-muted">
              <BrandMark className="size-7 opacity-60" />
              <p className="m-0 text-xs">{t("dialog.version", { version: packageJson.version })}</p>
            </div>
          </div>

          {/* Points out where a broken import can be cleaned up. Only while the menu
              itself is on screen — an open sub-panel covers the row it points at. */}
          <AnchoredTip id="dataHealth" anchor="dataHealthMenu" active={open && !active} />
          <AnchoredTip id="aiSettings" anchor="settingsAi" active={open && !active} />

          {/* ── Slide-over sub-panel ── fixed so it's positioned against the
              full-height drawer (its transformed containing block), not the
              scroll offset of the menu underneath. */}
          {active && (
            <div
              className={cn(
                // `fixed inset-0` escapes the sheet it slides over, so it needs the
                // column cap itself to stay aligned with that sheet on desktop.
                SHEET_COLUMN,
                "fixed inset-0 z-[60] flex flex-col overflow-hidden rounded-t-clear-card bg-clear-card lg:rounded-clear-dialog",
                // Phones: slides in from the right (and follows the edge swipe). From lg
                // the sheet is a centred modal, so the panel crossfades in place on the
                // dialog's Settle timing instead of travelling sideways.
                "max-lg:[transform:translateX(var(--panel-x))]",
                !dragging && "max-lg:transition-transform max-lg:duration-300 max-lg:ease-out",
                "lg:transition-opacity",
                visible
                  ? "lg:opacity-100 lg:duration-[260ms] lg:ease-[cubic-bezier(0.22,1,0.36,1)]"
                  : "lg:opacity-0 lg:duration-[160ms] lg:ease-[cubic-bezier(0.4,0,1,1)]",
              )}
              style={{ "--panel-x": visible ? `${dragX}px` : "100%" } as React.CSSProperties}
              onTouchStart={onPanelTouchStart}
              onTouchMove={onPanelTouchMove}
              onTouchEnd={onPanelTouchEnd}
              onTouchCancel={onPanelTouchEnd}
            >
              <PanelChromeContext.Provider
                value={{ closePanel, variant: "sheet", title: t(`panels.${active}.title`), subtitle: t(`panels.${active}.subtitle`) }}
              >
                {/* Panel body — the header sits inside the scroll container as a sticky
                    row so content blurs and fades under it as it scrolls. */}
                <div className="flex-1 overflow-y-auto pb-[calc(1.5rem+var(--sab,0px))]">
                  <SettingsPanelBody
                    panelKey={active}
                    heavy={isHeavyPanel(active) ? panels[active] : undefined}
                    user={user}
                    settings={{ financialMonth, budgetRecurringMode, sharedCostMode }}
                  />
                </div>
              </PanelChromeContext.Provider>
            </div>
          )}

          {/* Rendered inside DialogContent so it's a NESTED sheet (stacks on top of
              the menu) — closing it returns to the menu instead of tearing down the
              whole settings dialog. */}
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-h-[85dvh] overflow-y-auto" title={t("editProfile")}>
              <div className="flex flex-col gap-7 pt-2">
                <ProfileForms user={user} />
                <SecurityForms />
              </div>
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>
    </>
  );
}
