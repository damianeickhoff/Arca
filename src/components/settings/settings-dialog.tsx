"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  IconUser,
  IconChevronRight,
  IconLogout,
  IconPencil,
} from "@tabler/icons-react";
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
import { PanelChromeContext, PanelHeader } from "@/components/settings/settings-panel-chrome";
import { SettingsPanelBody } from "@/components/settings/settings-panel-body";
import { settingsSections, isHeavyPanel, type SettingsPanelKey } from "@/components/settings/settings-sections";
import { ProfileForms, SecurityForms } from "@/components/settings/account-forms";
import { AnchoredTip } from "@/components/anchored-tip";
import { Sparkles } from "@/components/sparkles";
import { LogoMark } from "@/components/brand-mark";
import { useSettingsPortal } from "@/lib/settings-portal-state";

function Avatar({ user, size }: { user: User; size: number }) {
  if (user.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl}
        alt={user.name}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-mustard text-mustard-ink flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <IconUser className="size-1/2" />
    </div>
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
  triggerClassName,
  iconOnly,
}: {
  user: User;
  panels: SettingsPanelContent;
  financialMonth: FinancialMonthConfig;
  budgetRecurringMode?: BudgetRecurringMode;
  sharedCostMode?: SharedCostMode;
  triggerClassName?: string;
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

  // The profile is edited from the header here, so no Account group; admins get
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
          iconOnly ? "glass-icon-btn size-11 p-0" : "glass-icon-btn h-11 gap-2 p-1 pr-5 max-w-[60vw] ",
          triggerClassName,
        )}
      >
        <Avatar user={user} size={38} />
        {!iconOnly && (
          <span className="pl-1 text-sm text-white truncate">{firstName}</span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="px-0" sheetClassName="bg-bg" hideHandle hideHeaderRow title={t("title")}>
          {/* ── Root menu ── shares the same sticky header chrome as every sub-panel
              (PanelHeader from settings-panel-chrome.tsx), with the X acting as a
              close button for the whole dialog. Rendered as a sibling of the hero
              content (not nested inside it) so its containing block is the full
              scrollable sheet body — nesting it inside a hero wrapper div would
              only let it stay `sticky` for as long as that div is on-screen.
              Sparkles is a sibling too: it's self-contained (absolute, sizes itself
              to a fixed hero height off its own `top-0`) and anchors against
              DialogContent's own `relative` scroll container. */}
          <PanelChromeContext.Provider value={{ closePanel: () => setOpen(false) }}>
            <PanelHeader title="" transparent closeIcon />
          </PanelChromeContext.Provider>
          <Sparkles />
          <div className="flex flex-col items-center gap-3 pt-2 pb-6 px-5">
            <Avatar user={user} size={88} />
            <div className="text-center">
              <p className="heading text-2xl leading-tight text-ink">{user.name}</p>
              <p className="text-sm text-ink-3">{user.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => logoutAction()}
                className="flex items-center gap-2 rounded-full bg-destructive/10 text-destructive px-4 h-10 text-sm font-medium active:scale-[0.97] transition-transform"
              >
                <IconLogout className="size-4.5" />
                {t("signOut")}
              </button>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                aria-label={t("editProfile")}
                className="flex items-center justify-center size-10 rounded-full bg-foreground/8 text-ink active:scale-[0.97] transition-transform"
              >
                <IconPencil className="size-4.5" />
              </button>
            </div>
          </div>

          <div className="px-5 pb-[calc(1.5rem+var(--sab))]">
            {/* Section cards */}
            <div className="space-y-6">
              {sections.map((section) => (
                <div key={section.key}>
                  <p className="px-1 ml-5 mb-2 text-[13px] font-bold text-clear-muted">
                    {t(`sections.${section.key}`)}
                  </p>
                  <div className="rounded-card border border-line bg-surface overflow-hidden">
                    {section.rows.map(({ key, icon: Icon }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => openPanel(key)}
                        className="relative w-full flex items-center gap-3.5 px-4 py-3.5 text-left active:bg-foreground/5 transition-colors"
                        // Only the Data Health row is a tip target today; the attribute
                        // is undefined on every other row so the selector stays unique.
                        data-tip-anchor={key === "dataHealth" ? "dataHealthMenu" : undefined}
                      >
                        <Icon className="size-6 shrink-0 text-ink" />
                        <span className="flex-1 text-base font-normal text-ink">{t(`panels.${key}.title`)}</span>
                        <IconChevronRight className="size-5 text-ink-3 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Points out where a broken import can be cleaned up. Only while the menu
              itself is on screen — an open sub-panel covers the row it points at. */}
          <AnchoredTip id="dataHealth" anchor="dataHealthMenu" active={open && !active} />

          {/* ── Slide-over sub-panel ── fixed so it's positioned against the
              full-height drawer (its transformed containing block), not the
              scroll offset of the menu underneath. */}
          {active && (
            <div
              className={cn(
                // `fixed inset-0` escapes the sheet it slides over, so it needs the
                // column cap itself to stay aligned with that sheet on desktop.
                SHEET_COLUMN,
                "fixed inset-0 z-[60] flex flex-col rounded-t-4xl overflow-hidden bg-sidebar",
                !dragging && "transition-transform duration-300 ease-out",
              )}
              style={{ transform: visible ? `translateX(${dragX}px)` : "translateX(100%)" }}
              onTouchStart={onPanelTouchStart}
              onTouchMove={onPanelTouchMove}
              onTouchEnd={onPanelTouchEnd}
              onTouchCancel={onPanelTouchEnd}
            >
              <PanelChromeContext.Provider value={{ closePanel, variant: "sheet", title: t(`panels.${active}.title`) }}>
                {/* Panel body — the header sits inside the scroll container as a sticky
                    row so content blurs and fades under it as it scrolls. */}
                <div className="flex-1 overflow-y-auto pb-[calc(1.5rem+var(--sab))]">
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

          <div className="pt-6 pb-8 flex flex-col items-center gap-2 text-center opacity-40">
            <LogoMark className="size-8" />
            <p className="text-lg font-medium text-ink">
              Arca
            </p>
            <p className="text-xs text-ink-3">v{packageJson.version}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
