"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconUserFilled, IconTrashFilled } from "@tabler/icons-react";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import { setUserAdminAction, deleteUserAction } from "@/app/actions/admin";
import type { User } from "@/db/schema";

interface Props {
  users: User[];
  currentUserId: number;
}

export function UsersClient({ users: initialUsers, currentUserId }: Props) {
  const [users, setUsers] = useState<User[]>(initialUsers);

  return (
    <>
      <PanelHeader title="Users" />
      <div className="px-4 pt-1 pb-8 space-y-3">
        {users.map((user) => (
          <UserRow
            key={user.id}
            user={user}
            isSelf={user.id === currentUserId}
            onDeleted={(id) => setUsers((list) => list.filter((u) => u.id !== id))}
            onRoleChanged={(id, isAdmin) =>
              setUsers((list) => list.map((u) => (u.id === id ? { ...u, isAdmin } : u)))
            }
          />
        ))}
        {users.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">No users yet.</p>
        )}
      </div>
    </>
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleAdmin() {
    setPending(true);
    setError(null);
    const result = await setUserAdminAction(user.id, !user.isAdmin);
    setPending(false);
    if (result?.error) setError(result.error);
    else { onRoleChanged(user.id, !user.isAdmin); router.refresh(); }
  }

  async function remove() {
    if (!confirm(`Delete ${user.name}? This cannot be undone.`)) return;
    setPending(true);
    setError(null);
    const result = await deleteUserAction(user.id);
    setPending(false);
    if (result?.error) setError(result.error);
    else { onDeleted(user.id); router.refresh(); }
  }

  return (
    <div className="rounded-2xl bg-[var(--dialog-content-background)] px-4 py-3.5">
      <div className="flex items-center gap-4">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-blue-600 text-white shrink-0">
          <IconUserFilled className="size-6" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-lg truncate leading-tight">{user.name}</p>
          <p className="text-sm text-foreground/50 truncate mt-0.5">{user.email}</p>
        </div>
        {isSelf ? (
          <span className="text-xs text-foreground/40 shrink-0">You</span>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleAdmin}
              disabled={pending}
              className="inline-flex items-center rounded-full bg-foreground/8 text-foreground/70 text-xs font-semibold px-2.5 py-1.5 active:scale-[0.97] transition-transform disabled:opacity-50"
            >
              {user.isAdmin ? "Admin" : "User"}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              aria-label="Delete user"
              className="size-9 rounded-full bg-destructive/10 flex items-center justify-center text-destructive active:scale-[0.95] transition-transform disabled:opacity-50"
            >
              <IconTrashFilled className="size-4" />
            </button>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
    </div>
  );
}
