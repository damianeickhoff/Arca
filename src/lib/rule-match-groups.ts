// Pure: the "Show the N transactions" list for rules being made for several merchants
// at once. Kept apart from the dialog so it can be tested.

/** One transaction a new rule would file, as the preview endpoint's `rows=1` returns it. */
export interface RuleMatchRow {
  id: number;
  date: string;
  description: string;
  amount: number;
  direction: string;
  accountName: string | null;
}

/**
 * Each rule's matches (`perRule`, in rule order) as groups: a transaction two rules match
 * is listed once, under the first; `skip` (the ones filed by hand anyway) is left out.
 * Every group is newest first.
 */
export function groupMatchesByRule(perRule: RuleMatchRow[][], skip: Set<number>): RuleMatchRow[][] {
  const seen = new Set<number>(skip);
  return perRule.map((rows) => {
    const group = rows.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
    return group.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  });
}
