// categories has a unique index on (name, group): within one money kind (spending,
// savings, income) no two rows — groups and categories alike — may share a name. This
// finds the row a new or renamed one would clash with, case-insensitively, so the API
// can answer 409 with a clear message and the forms can say so while you type.

type Row = { id: number; name: string; group: string; isGroup: boolean; parentCategoryId: number | null };

export type NameConflict = {
  /** The existing row's name, as it is spelled there. */
  name: string;
  /** Whether the existing row is a group. */
  isGroup: boolean;
  /** For a category: the name of the group it sits in (null when it has none). For a
   *  group: its kind ("" spending, "savings", "income"). */
  where: string | null;
};

export function findNameConflict(
  rows: readonly Row[],
  { name, kind, excludeId = null }: { name: string; kind: string; excludeId?: number | null },
): NameConflict | null {
  const wanted = name.trim().toLocaleLowerCase();
  if (!wanted) return null;
  const hit = rows.find((r) => r.id !== excludeId && r.group === kind && r.name.trim().toLocaleLowerCase() === wanted);
  if (!hit) return null;
  if (hit.isGroup) return { name: hit.name, isGroup: true, where: hit.group };
  const parent = hit.parentCategoryId != null ? rows.find((r) => r.id === hit.parentCategoryId) : undefined;
  return { name: hit.name, isGroup: false, where: parent?.name ?? null };
}

/** The 409 body the categories API answers with when a name is taken. */
export type NameConflictResponse = NameConflict & { error: "exists" };

export function isNameConflictResponse(body: unknown): body is NameConflictResponse {
  return typeof body === "object" && body !== null && (body as { error?: unknown }).error === "exists";
}
