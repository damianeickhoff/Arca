"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { IconCheck, IconCopy, IconLink, IconShieldCheck, IconTrash, IconUser, IconUserPlus, IconUsers } from "@tabler/icons-react";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { ClearButton } from "@/components/clear/button";
import { ClearChip } from "@/components/clear/chip";
import { IconTile } from "@/components/clear/icon-tile";
import { ContextualTip } from "@/components/contextual-tip";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import { ClearSelect } from "@/components/settings/accounts/clear-select";
import { RowIconButton, SettingsEmpty, SettingsNotice, SettingsSection } from "@/components/settings/settings-ui";
import { setUserAdminAction, deleteUserAction, createInviteAction, revokeInviteAction } from "@/app/actions/admin";
import { invitePath } from "@/lib/invite-rules";
import type { Invite, User } from "@/db/schema";

interface Props {
  /** Already passed through toClientUser — no hashes or secrets. */
  users: User[];
  /** Pending invite links: not used and not expired. */
  invites: Invite[];
  currentUserId: number;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** The Users panel (admins only): everyone who can sign in, their role, and removing
 *  them; then what each role may do. */
export function UsersClient({ users: initialUsers, invites, currentUserId }: Props) {
  const t = useTranslations("settings.users");
  const tPanels = useTranslations("settings.panels");
  const [users, setUsers] = useState<User[]>(initialUsers);
  const admins = users.filter((u) => u.isAdmin).length;

  return (
    <>
      <ContextualTip id="userInvites" />
      <PanelHeader title={tPanels("users.title")} />
      <div className="flex flex-col gap-6 px-4 pt-1 font-clear text-clear-ink">
        <p className="m-0 text-sm text-clear-ink-2">{t("intro", { count: users.length })}</p>

        {users.length === 0 ? (
          <SettingsEmpty icon={<IconUsers stroke={1.9} />}>{t("empty")}</SettingsEmpty>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                isSelf={user.id === currentUserId}
                onDeleted={(id) => setUsers((list) => list.filter((u) => u.id !== id))}
                onRoleChanged={(id, isAdmin) => setUsers((list) => list.map((u) => (u.id === id ? { ...u, isAdmin } : u)))}
              />
            ))}
          </ul>
        )}

        <InvitesSection invites={invites} />

        <section aria-labelledby="users-roles" className="flex flex-col gap-3">
          <h3 id="users-roles" className="m-0 text-lg font-bold">{t("rolesTitle")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <RoleCard
              icon={<IconShieldCheck stroke={1.9} />}
              tone="lilac"
              title={t("roleAdmin")}
              count={t("peopleCount", { count: admins })}
              body={t("roleAdminBody")}
            />
            <RoleCard
              icon={<IconUser stroke={1.9} />}
              tone="sky"
              title={t("roleMember")}
              count={t("peopleCount", { count: users.length - admins })}
              body={t("roleMemberBody")}
            />
          </div>
        </section>
      </div>
    </>
  );
}

/**
 * Invite links. Sign-up is closed once the household has a user, so this is how a new
 * person gets in: the admin makes a link, sends it along, and the link opens /register
 * once, until it expires. The list is server-rendered; a fresh link is added locally
 * so it can be copied right away.
 */
function InvitesSection({ invites: initialInvites }: { invites: Invite[] }) {
  const t = useTranslations("settings.users");
  const router = useRouter();
  const [invites, setInvites] = useState<Invite[]>(initialInvites);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setPending(true);
    setError(null);
    const result = await createInviteAction().catch(() => null);
    setPending(false);
    const created = result?.invite;
    if (!created) {
      setError(t("inviteError"));
      return;
    }
    setInvites((list) => [created, ...list]);
    router.refresh();
  }

  async function revoke(id: number) {
    setError(null);
    const result = await revokeInviteAction(id).catch(() => ({ error: "failed" as const }));
    if (result.error) {
      setError(t("inviteRevokeError"));
      return;
    }
    setInvites((list) => list.filter((i) => i.id !== id));
    router.refresh();
  }

  return (
    <SettingsSection
      title={t("invitesTitle")}
      subtitle={t("invitesSubtitle")}
      action={
        <ClearButton size="sm" onClick={create} disabled={pending}>
          <IconUserPlus stroke={2} />
          {pending ? t("inviteCreating") : t("inviteCreate")}
        </ClearButton>
      }
    >
      {error && <SettingsNotice>{error}</SettingsNotice>}
      {invites.length === 0 ? (
        <SettingsEmpty icon={<IconLink stroke={1.9} />}>{t("invitesEmpty")}</SettingsEmpty>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {invites.map((invite) => (
            <InviteRow key={invite.id} invite={invite} onRevoke={() => revoke(invite.id)} />
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}

function InviteRow({ invite, onRevoke }: { invite: Invite; onRevoke: () => void }) {
  const t = useTranslations("settings.users");
  const format = useFormatter();
  const confirm = useConfirm();
  const [copied, setCopied] = useState(false);
  // The origin is only known in the browser (it is whatever address the admin uses);
  // the path is the same for every install, so the server render shows just that.
  const [origin, setOrigin] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the origin only exists in the browser; the server render shows the path alone
  useEffect(() => setOrigin(window.location.origin), []);
  const link = origin + invitePath(invite.token);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: the link stays selectable in the row */
    }
  }

  async function revoke() {
    const ok = await confirm({
      title: t("inviteRevokeTitle"),
      body: t("inviteRevokeBody"),
      confirmLabel: t("inviteRevokeConfirm"),
      destructive: true,
    });
    if (ok) onRevoke();
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-clear-tile bg-clear-tile px-4 py-3">
      <IconTile tone="mint" size="sm">
        <IconLink stroke={1.9} />
      </IconTile>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] font-bold select-all">{link}</span>
        <span className="text-[13px] text-clear-muted">
          {t("inviteExpires", { date: format.dateTime(new Date(invite.expiresAt), { day: "numeric", month: "long" }) })}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ClearButton variant="surface" size="sm" onClick={copy} aria-label={t("inviteCopyLabel")}>
          {copied ? <IconCheck stroke={2.2} /> : <IconCopy stroke={2} />}
          <span aria-live="polite">{copied ? t("inviteCopied") : t("inviteCopy")}</span>
        </ClearButton>
        <RowIconButton label={t("inviteRevokeLabel")} onClick={revoke} danger>
          <IconTrash stroke={2} />
        </RowIconButton>
      </div>
    </li>
  );
}

function RoleCard({
  icon,
  tone,
  title,
  count,
  body,
}: {
  icon: React.ReactNode;
  tone: "lilac" | "sky";
  title: string;
  count: string;
  body: string;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-clear-tile bg-clear-tile p-4">
      <div className="flex items-center gap-3">
        <IconTile tone={tone} size="sm">{icon}</IconTile>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-bold">{title}</span>
          <span className="text-[13px] text-clear-muted">{count}</span>
        </span>
      </div>
      <p className="m-0 text-sm text-clear-ink-2">{body}</p>
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  onDeleted,
  onRoleChanged,
}: {
  user: User;
  isSelf: boolean;
  onDeleted: (id: number) => void;
  onRoleChanged: (id: number, isAdmin: boolean) => void;
}) {
  const router = useRouter();
  const t = useTranslations("settings.users");
  const confirm = useConfirm();
  const roleLabelId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeRole(isAdmin: boolean) {
    if (isAdmin === user.isAdmin) return;
    setPending(true);
    setError(null);
    const result = await setUserAdminAction(user.id, isAdmin).catch(() => ({ error: "failed" }));
    setPending(false);
    if (result?.error) setError(t("roleError"));
    else { onRoleChanged(user.id, isAdmin); router.refresh(); }
  }

  async function remove() {
    const ok = await confirm({
      title: t("deleteTitle", { name: user.name }),
      body: t("deleteBody"),
      confirmLabel: t("deleteConfirm"),
      destructive: true,
    });
    if (!ok) return;
    setPending(true);
    setError(null);
    const result = await deleteUserAction(user.id).catch(() => ({ error: "failed" }));
    setPending(false);
    if (result?.error) setError(t("deleteError"));
    else { onDeleted(user.id); router.refresh(); }
  }

  return (
    <li className="flex flex-col gap-2 border-b border-clear-ground py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-3">
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt="" className="size-11 shrink-0 rounded-full object-cover" />
        ) : (
          <span aria-hidden className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-clear-peach text-sm font-extrabold text-clear-peach-ink">
            {initials(user.name)}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-bold">{user.name}</span>
            {isSelf && <ClearChip tone="stone" className="h-6 px-2.5 text-xs">{t("you")}</ClearChip>}
          </span>
          <span className="truncate text-[13px] text-clear-muted">{user.email}</span>
        </div>
        {isSelf ? (
          <ClearChip tone={user.isAdmin ? "lilac" : "sky"}>{user.isAdmin ? t("roleAdmin") : t("roleMember")}</ClearChip>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <span id={roleLabelId} className="sr-only">{t("roleFor", { name: user.name })}</span>
            <ClearSelect
              ariaLabelledBy={roleLabelId}
              value={user.isAdmin ? "admin" : "member"}
              onChange={(v) => changeRole(v === "admin")}
              options={[
                { value: "member", label: t("roleMember") },
                { value: "admin", label: t("roleAdmin") },
              ]}
              className="h-10 w-[132px]"
            />
            <RowIconButton label={t("deleteLabel", { name: user.name })} onClick={remove} disabled={pending} danger>
              <IconTrash stroke={2} />
            </RowIconButton>
          </div>
        )}
      </div>
      {error && <SettingsNotice>{error}</SettingsNotice>}
    </li>
  );
}
