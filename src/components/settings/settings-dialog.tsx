"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconUser,
  IconChevronRight,
  IconLogout,
  IconPencil,
  IconCreditCard,
  IconTag,
  IconRepeat,
  IconStar,
  IconCalendar,
  IconCalendarEvent,
  IconFileUpload,
  IconMoon,
  IconShield,
  IconLock,
  IconLanguage,
  IconCoin,
  IconHelpCircle,
  IconUsers,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type { User } from "@/db/schema";
import type { FinancialMonthConfig } from "@/lib/date-range";
import type { SettingsPanelContent } from "@/app/settings-panel-content";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { logoutAction, updateOwnProfileAction, updateOwnEmailAction, updateOwnPasswordAction } from "@/app/actions/auth";
import { FinancieleMaandForm, MaandUitzonderingenSubPage } from "@/app/settings/general-client";
import { ImportCsvCard } from "@/components/import-csv-card";
import { ThemeList } from "@/components/theme-toggle";
import { LanguageList } from "@/components/language-switcher";
import { CurrencyList } from "@/components/currency-switcher";
import { PrivacyToggle } from "@/components/privacy-toggle";
import { AvatarFormContent, AppLockSectionContent, TwoFactorSectionContent } from "@/app/settings/profile-client";
import { PanelChromeContext, PanelHeader } from "@/components/settings/settings-panel-chrome";
import { AuthBackgroundPicker } from "@/components/settings/auth-background-picker";
import { Sparkles } from "@/components/sparkles";
import { useSettingsPortal } from "@/lib/settings-portal-state";

type PanelKey =
  | "accounts" | "categories" | "recurring" | "brandIcons"
  | "financialMonth" | "monthOverrides"
  | "import" | "appearance" | "privacy" | "appLock" | "language" | "currency"
  | "help" | "users";

type Section = {
  title: string;
  rows: { key: PanelKey; label: string; icon: React.ComponentType<{ className?: string }> }[];
};

const SECTIONS: Section[] = [
  {
    title: "Manage",
    rows: [
      { key: "accounts", label: "Accounts", icon: IconCreditCard },
      { key: "categories", label: "Categories", icon: IconTag },
      { key: "recurring", label: "Recurring", icon: IconRepeat },
      { key: "brandIcons", label: "Brand Icons", icon: IconStar },
      { key: "financialMonth", label: "Financial Month", icon: IconCalendar },
      { key: "monthOverrides", label: "Month Overrides", icon: IconCalendarEvent },
    ],
  },
  {
    title: "App",
    rows: [
      { key: "import", label: "Import CSV", icon: IconFileUpload },
      { key: "appearance", label: "Appearance", icon: IconMoon },
      { key: "privacy", label: "Privacy", icon: IconShield },
      { key: "appLock", label: "App Lock", icon: IconLock },
      { key: "language", label: "Language", icon: IconLanguage },
      { key: "currency", label: "Currency", icon: IconCoin },
    ],
  },
  {
    title: "About",
    rows: [{ key: "help", label: "Help", icon: IconHelpCircle }],
  },
];

const PANEL_TITLES: Record<PanelKey, string> = {
  accounts: "Accounts",
  categories: "Categories",
  recurring: "Recurring",
  brandIcons: "Brand Icons",
  financialMonth: "Financial Month",
  monthOverrides: "Month Overrides",
  import: "Import CSV",
  appearance: "Appearance",
  privacy: "Privacy",
  appLock: "App Lock",
  language: "Language",
  currency: "Currency",
  help: "Help",
  users: "Users",
};

// The data-heavy panels are server-rendered on the dashboard and injected as
// nodes; the rest are built inline here from existing client components.
const HEAVY_KEYS: PanelKey[] = ["accounts", "categories", "recurring", "brandIcons", "users"];

// Panels that render their own sticky header (back + panel-specific actions) via
// PanelHeader, so SettingsDialog skips the generic header for them.
const SELF_CHROMED = new Set<PanelKey>(["accounts", "categories", "recurring", "brandIcons", "users"]);

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
      className="rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <IconUser className="size-1/2" />
    </div>
  );
}

export function SettingsDialog({
  user,
  panels,
  financialMonth,
  triggerClassName,
  iconOnly,
}: {
  user: User;
  panels: SettingsPanelContent;
  financialMonth: FinancialMonthConfig;
  triggerClassName?: string;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Sub-panel with slide animation: `active` is the rendered panel, `visible`
  // drives the transform so it can animate out before unmounting.
  const [active, setActive] = useState<PanelKey | null>(null);
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

  function openPanel(key: PanelKey) {
    setActive(key);
    // Next frame so the initial (off-screen) transform is committed before flipping.
    requestAnimationFrame(() => setVisible(true));
  }
  function closePanel() {
    setVisible(false);
    setTimeout(() => setActive(null), 280);
  }

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

  // Admins get an extra row at the bottom of the "App" section that opens the
  // Users management sub-panel — same slide-over mechanism as every other panel.
  const sections: Section[] = user.isAdmin
    ? SECTIONS.map((s) =>
        s.title === "App"
          ? { ...s, rows: [...s.rows, { key: "users" as PanelKey, label: "Users", icon: IconUsers }] }
          : s,
      )
    : SECTIONS;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open settings"
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
        <DialogContent className="px-0" sheetClassName="bg-[#1c1c1e]" hideHandle hideHeaderRow title="Settings">
          {/* ── Root menu ── shares the same sticky header chrome as every sub-panel
              (PanelHeader from settings-panel-chrome.tsx), with the X acting as a
              close button for the whole dialog. Rendered as a sibling of the hero
              content (not nested inside it) so its containing block is the full
              scrollable sheet body — nesting it inside a hero wrapper div would
              only let it stay `sticky` for as long as that div is on-screen,
              causing it to drift away as soon as the hero scrolls past.
              Sparkles is a sibling too, not a wrapper: it's self-contained
              (absolute, sizes itself to a fixed hero height off its own `top-0`)
              and anchors fine directly against DialogContent's own `relative`
              scroll container — so it still renders behind the header at rest
              without the header needing to share a parent with it, and stays a
              first-page touch instead of following the user into every
              sub-panel or scrolling behind the plain settings list below. */}
          <PanelChromeContext.Provider value={{ closePanel: () => setOpen(false) }}>
            <PanelHeader title="" transparent closeIcon />
          </PanelChromeContext.Provider>
          <Sparkles />
          <div className="flex flex-col items-center gap-3 pt-2 pb-6 px-5">
            <Avatar user={user} size={88} />
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground leading-tight">{user.name}</p>
              <p className="text-sm text-foreground/50">{user.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => logoutAction()}
                className="flex items-center gap-2 rounded-full bg-destructive/10 text-destructive px-4 h-10 text-sm font-medium active:scale-[0.97] transition-transform"
              >
                <IconLogout className="size-4.5" />
                Log out
              </button>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                aria-label="Edit profile"
                className="flex items-center justify-center size-10 rounded-full bg-foreground/8 text-foreground active:scale-[0.97] transition-transform"
              >
                <IconPencil className="size-4.5" />
              </button>
            </div>
          </div>

          <div className="px-5 pb-[calc(1.5rem+var(--sab))]">
            {/* Section cards */}
            <div className="space-y-6">
              {sections.map((section) => (
                <div key={section.title}>
                  <p className="px-1 ml-5 mb-2 text-xs font-semibold uppercase tracking-wider text-foreground/40">
                    {section.title}
                  </p>
                  <div className="rounded-2xl bg-sidebar-primary-foreground overflow-hidden">
                    {section.rows.map(({ key, label, icon: Icon }, index) => {
                      const divider = index !== section.rows.length - 1 && (
                        <span className="absolute bottom-0 left-4 right-0 h-px" />
                      );
                      const rowClass =
                        "relative w-full flex items-center gap-3.5 px-4 py-3.5 text-left active:bg-foreground/5 transition-colors";

                      return (
                        <button key={key} type="button" onClick={() => openPanel(key)} className={rowClass}>
                          <Icon className="size-6 shrink-0 text-foreground" />
                          <span className="flex-1 text-base font-normal text-foreground">{label}</span>
                          <IconChevronRight className="size-5 text-foreground/30 shrink-0" />
                          {divider}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Slide-over sub-panel ── fixed so it's positioned against the
              full-height drawer (its transformed containing block), not the
              scroll offset of the menu underneath. */}
          {active && (
            <div
              className={cn(
                "fixed inset-0 z-[60] flex flex-col rounded-t-4xl overflow-hidden bg-[#1c1c1e]",
                !dragging && "transition-transform duration-300 ease-out",
              )}
              style={{ transform: visible ? `translateX(${dragX}px)` : "translateX(100%)" }}
              onTouchStart={onPanelTouchStart}
              onTouchMove={onPanelTouchMove}
              onTouchEnd={onPanelTouchEnd}
              onTouchCancel={onPanelTouchEnd}
            >
              <PanelChromeContext.Provider value={{ closePanel }}>
              {/* Panel body — the header sits inside the scroll container as a sticky
                  row so content blurs and fades under it as it scrolls (HeaderBlurFade).
                  Self-chromed panels (accounts/categories/recurring) draw their own
                  sticky header with panel-specific actions, so skip it for those. */}
              <div className="flex-1 overflow-y-auto pb-[calc(1.5rem+var(--sab))]">
                {!SELF_CHROMED.has(active) && <PanelHeader title={PANEL_TITLES[active]} />}
                {HEAVY_KEYS.includes(active) ? (
                  panels[active as keyof SettingsPanelContent]
                ) : (
                  <InlinePanel panelKey={active} financialMonth={financialMonth} />
                )}
              </div>
              </PanelChromeContext.Provider>
            </div>
          )}

          {/* Rendered inside DialogContent so it's a NESTED sheet (stacks on top of
              the menu) — closing it returns to the menu instead of tearing down the
              whole settings dialog. */}
          <ProfileEditDialog open={editOpen} onOpenChange={setEditOpen} user={user} />

          <div className="pt-6 pb-8 text-center">
            <p className="text-lg font-medium text-foreground/40">
              Arca
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Inline (client-only) panels ────────────────────────────────────────────────

function InlinePanel({
  panelKey,
  financialMonth,
}: {
  panelKey: PanelKey;
  financialMonth: FinancialMonthConfig;
}) {
  const [addOverrideOpen, setAddOverrideOpen] = useState(false);

  switch (panelKey) {
    case "import":
      return <div className="px-4 pt-4"><ImportCsvCard /></div>;

    case "appearance":
      return (
        <div className="px-4 pt-4 space-y-3">
          <ThemeList />
          <p className="px-2 text-sm text-foreground/50">
            Controls the visual appearance of the app. &quot;System Default&quot; follows your device settings.
          </p>
          <AuthBackgroundPicker />
        </div>
      );

    case "privacy":
      return (
        <div className="px-4 pt-4 space-y-3">
          <div className="rounded-2xl bg-[#2e2e30] p-2">
            <PrivacyToggle variant="row" />
          </div>
          <p className="px-2 text-sm text-foreground/50">
            Blurs all amounts across the app so you can use it in public without revealing balances.
          </p>
        </div>
      );

    case "appLock":
      return <div className="px-4 pt-4"><AppLockSectionContent /></div>;

    case "language":
      return (
        <div className="px-4 pt-4 space-y-3">
          <LanguageList />
          <p className="px-2 text-sm text-foreground/50">Choose the language for the interface.</p>
        </div>
      );

    case "currency":
      return (
        <div className="px-4 pt-4 space-y-3">
          <CurrencyList />
          <p className="px-2 text-sm text-foreground/50">Currency symbol shown on amounts.</p>
        </div>
      );

    case "financialMonth":
      return (
        <div className="px-4 pt-4">
          <div className="rounded-2xl bg-[#2e2e30] p-5">
            <FinancieleMaandForm
              currentStartDay={financialMonth.defaultStartDay}
              currentWeekendRollback={financialMonth.weekendRollback ?? false}
            />
          </div>
        </div>
      );

    case "monthOverrides": {
      const initialOverrides = Object.entries(financialMonth.overrides ?? {}).map(
        ([month, startDay]) => ({ month, startDay: startDay as number }),
      );
      return (
        <div className="pt-2">
          <div className="flex justify-end px-4">
            <button
              type="button"
              onClick={() => setAddOverrideOpen(true)}
              className="text-sm font-medium text-primary px-2 py-1"
            >
              + Add override
            </button>
          </div>
          <MaandUitzonderingenSubPage
            currentStartDay={financialMonth.defaultStartDay}
            initialOverrides={initialOverrides}
            addOpen={addOverrideOpen}
            onAddOpenChange={setAddOverrideOpen}
          />
        </div>
      );
    }

    case "help":
      return (
        <div className="px-4 pt-4 space-y-3">
          <div className="rounded-2xl bg-[#2e2e30] p-5">
            <p className="text-sm font-medium text-foreground mb-1">Questions or problems?</p>
            <p className="text-sm text-foreground/70">
              Email support and we&apos;ll get back to you as soon as possible.
            </p>
          </div>
          <a
            href="mailto:support@arca.app"
            className="flex items-center gap-3.5 rounded-2xl bg-[#2e2e30] px-4 py-3.5 active:bg-foreground/5 transition-colors"
          >
            <IconHelpCircle className="size-5 text-primary shrink-0" />
            <span className="flex-1 text-sm font-medium text-foreground">Contact support</span>
            <IconChevronRight className="size-4 text-foreground/30" />
          </a>
        </div>
      );

    default:
      return null;
  }
}

// ── Profile edit dialog — all settings shown directly, stacked ──────────────────

function EditSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/40">{title}</h3>
      {children}
    </section>
  );
}

function ProfileEditDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: User;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto" title="Edit profile">
        <div className="space-y-6 pt-2">
          <AvatarFormContent user={user} />
          <EditSection title="Name"><NameForm user={user} /></EditSection>
          <EditSection title="Login email"><EmailForm user={user} /></EditSection>
          <EditSection title="Password"><PasswordForm /></EditSection>
          <EditSection title="Two-factor authentication"><TwoFactorSectionContent /></EditSection>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NameForm({ user }: { user: User }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    const fd = new FormData();
    fd.append("name", name);
    const result = await updateOwnProfileAction(fd);
    setSaving(false);
    if (result?.error) setError(result.error);
    else { setSuccess(true); router.refresh(); }
  }

  return (
    <div className="space-y-3">
      {error && <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>}
      {success && <div className="text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-lg px-3 py-2">Name updated.</div>}
      <div className="space-y-1">
        <Input value={name} onChange={(e) => { setName(e.target.value); setSuccess(false); }} />
      </div>
      <Button onClick={save} disabled={saving || !name.trim()} className="w-full">
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}

function EmailForm({ user }: { user: User }) {
  const router = useRouter();
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    const fd = new FormData();
    fd.append("email", email);
    fd.append("currentPassword", password);
    const result = await updateOwnEmailAction(fd);
    setSaving(false);
    if (result?.error) setError(result.error);
    else { setSuccess(true); setPassword(""); router.refresh(); }
  }

  return (
    <div className="space-y-3">
      {error && <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>}
      {success && <div className="text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-lg px-3 py-2">Email updated.</div>}
      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground/80">Email</label>
        <Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setSuccess(false); }} autoComplete="email" />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground/80">Current password</label>
        <Input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setSuccess(false); }} autoComplete="current-password" />
      </div>
      <Button onClick={save} disabled={saving || !email.trim() || !password} className="w-full">
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function save() {
    if (!current || !next) return;
    setSaving(true);
    setError(null);
    const fd = new FormData();
    fd.append("currentPassword", current);
    fd.append("newPassword", next);
    const result = await updateOwnPasswordAction(fd);
    setSaving(false);
    if (result?.error) setError(result.error);
    else { setSuccess(true); setCurrent(""); setNext(""); }
  }

  return (
    <div className="space-y-3">
      {error && <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>}
      {success && <div className="text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-lg px-3 py-2">Password updated.</div>}
      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground/80">Current password</label>
        <Input type="password" value={current} onChange={(e) => { setCurrent(e.target.value); setSuccess(false); }} autoComplete="current-password" />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground/80">New password</label>
        <Input type="password" value={next} onChange={(e) => { setNext(e.target.value); setSuccess(false); }} placeholder="At least 8 characters" autoComplete="new-password" />
      </div>
      <Button onClick={save} disabled={saving || !current || !next} className="w-full">
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
