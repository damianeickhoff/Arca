"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconArrowsExchange, IconCreditCard, IconRepeat, IconTag, IconTarget } from "@tabler/icons-react";
import { refreshLayoutAction } from "@/app/actions/refresh-layout";
import { loadQuickAddData, type QuickAddData } from "@/app/actions/quick-add";
import { DebtFormDialog } from "@/app/debts/debt-form-dialog";
import { GoalFormDialog } from "@/app/goals/goal-form-dialog";
import { NewCategoryDialog } from "@/components/settings/categories/category-client";
import { RecurringClient } from "@/components/settings/recurring/recurring-client";
import { IconTile } from "@/components/clear/icon-tile";
import { ListRow } from "@/components/clear/list-row";
import { ResponsivePopover } from "@/components/clear/responsive-popover";
import type { ClearTone } from "@/components/clear/tones";
import { useNavHidden } from "@/lib/nav-visibility";
import { useIsDesktop } from "@/lib/use-is-desktop";

// The global "+": one menu — Transaction, Recurring bill, Debt, Goal, Category — opened
// from the sidebar's round button beside "Search everything" (desktop), the ember add
// button in the phone tab bar, or Ctrl/Cmd+N. Each item opens its create dialog right
// where you are; the dialogs are hosted here, once, by the app shell. Transaction goes
// to /transactions/add, which is already a popup over the page (a full-screen page with
// the keypad on phones) and needs its own server data.

type Kind = "transaction" | "recurring" | "debt" | "goal" | "category";

const ITEMS: { kind: Kind; Glyph: typeof IconTag; tone: ClearTone }[] = [
  { kind: "transaction", Glyph: IconArrowsExchange, tone: "mint" },
  { kind: "recurring", Glyph: IconRepeat, tone: "sky" },
  { kind: "debt", Glyph: IconCreditCard, tone: "rose" },
  { kind: "goal", Glyph: IconTarget, tone: "butter" },
  { kind: "category", Glyph: IconTag, tone: "lilac" },
];

/** The dialog the menu opened; `open` turns false first so the dialog can animate out. */
type Active = { data: QuickAddData | { kind: "recurring" }; open: boolean; session: number };

interface QuickAddContextValue {
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  choose: (kind: Kind) => void;
}

const QuickAddContext = createContext<QuickAddContextValue>({ menuOpen: false, setMenuOpen: () => {}, choose: () => {} });

export function QuickAddProvider({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const router = useRouter();
  const navHidden = useNavHidden();
  const isDesktop = useIsDesktop();
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState<Active | null>(null);
  // The latest choice; a slower earlier load never opens over it.
  const request = useRef(0);

  const choose = useCallback(
    async (kind: Kind) => {
      setMenuOpen(false);
      const id = ++request.current;
      if (kind === "transaction") {
        router.push("/transactions/add");
        return;
      }
      const data = kind === "recurring" ? { kind } : await loadQuickAddData(kind);
      if (!data || id !== request.current) return;
      setActive((prev) => ({ data, open: true, session: (prev?.session ?? 0) + 1 }));
    },
    [router],
  );

  // Every save in these dialogs refreshes the page; the layout (the sidebar's counts and
  // balances) only through revalidatePath — see actions/refresh-layout.ts.
  const close = useCallback(() => {
    setActive((prev) => (prev ? { ...prev, open: false } : prev));
    void refreshLayoutAction();
  }, []);
  const onOpenChange = useCallback((open: boolean) => !open && close(), [close]);

  // Ctrl/Cmd+N opens the menu on desktop (on phones the tab bar's add button does).
  // Skipped while a full-screen overlay holds the screen or a sheet is open.
  useEffect(() => {
    if (!enabled || navHidden || !isDesktop) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "n" && e.key !== "N") return;
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.altKey || e.shiftKey) return;
      if (document.querySelector('[data-vaul-drawer][data-state="open"]')) return;
      e.preventDefault();
      setMenuOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, navHidden, isDesktop]);

  const value = useMemo(() => ({ menuOpen, setMenuOpen, choose }), [menuOpen, choose]);
  const data = active?.data;
  const open = active?.open ?? false;

  return (
    <QuickAddContext.Provider value={value}>
      {children}
      {enabled && data?.kind === "recurring" && <RecurringClient action="add" open={open} onOpenChange={onOpenChange} />}
      {enabled && data?.kind === "debt" && <DebtFormDialog key={active!.session} open={open} onOpenChange={onOpenChange} bills={data.bills} />}
      {enabled && data?.kind === "goal" && (
        <GoalFormDialog key={active!.session} target={{ mode: "new", type: "choose" }} open={open} onOpenChange={onOpenChange} categories={data.categories} />
      )}
      {enabled && data?.kind === "category" && (
        <NewCategoryDialog open={open} onOpenChange={onOpenChange} categories={data.categories} banks={data.banks} />
      )}
    </QuickAddContext.Provider>
  );
}

/**
 * The add menu around its trigger: the sidebar's round button (`placement` "desktop")
 * or the tab bar's ember button ("phone"). Both are mounted, one hidden by the breakpoint,
 * so the shared open state only opens the one that is showing.
 */
export function QuickAddMenu({ placement, trigger }: { placement: "desktop" | "phone"; trigger: React.ReactElement<React.ComponentProps<"button">> }) {
  const t = useTranslations("nav.quickAdd");
  const isDesktop = useIsDesktop();
  const { menuOpen, setMenuOpen, choose } = useContext(QuickAddContext);
  const mine = isDesktop === (placement === "desktop");

  return (
    <ResponsivePopover
      open={mine && menuOpen}
      onOpenChange={(next) => mine && setMenuOpen(next)}
      title={t("title")}
      trigger={trigger}
      className="w-[300px]"
    >
      <div className="flex flex-col">
        {ITEMS.map(({ kind, Glyph, tone }) => (
          <ListRow
            key={kind}
            onClick={() => choose(kind)}
            icon={
              <IconTile tone={tone} size="sm">
                <Glyph stroke={2} />
              </IconTile>
            }
            title={t(`${kind}.title`)}
            meta={t(`${kind}.meta`)}
            className="min-h-14 border-b-0"
          />
        ))}
      </div>
    </ResponsivePopover>
  );
}
