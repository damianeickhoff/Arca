"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconShieldCheck, IconTrash, IconUser, IconUsers } from "@tabler/icons-react";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { ClearChip } from "@/components/clear/chip";
import { IconTile } from "@/components/clear/icon-tile";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import { ClearSelect } from "@/components/settings/accounts/clear-select";
import { RowIconButton, SettingsEmpty, SettingsNotice } from "@/components/settings/settings-ui";
import { setUserAdminAction, deleteUserAction } from "@/app/actions/admin";
import type { User } from "@/db/schema";

interface Props {
  /** Already passed through toClientUser — no hashes or secrets. */
  users: User[];
  currentUserId: number;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** The Users panel (admins only): everyone who can sign in, their role, and removing
 *  them; then what each role may do. */
export function UsersClient({ users: initialUsers, currentUserId }: Props) {
  const t = useTranslations("settings.users");
  const tPanels = useTranslations("settings.panels");
  const [users, setUsers] = useState<User[]>(initialUsers);
  const admins = users.filter((u) => u.isAdmin).length;

  return (
    <>
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
