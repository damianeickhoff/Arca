export type BudgetRow = {
  categoryName: string;
  target: number | null;
  actual: number;
};

// Shared threshold logic — "near budget" starts at 80% of target, matching the budget
// page's original inline filters.
export function classifyBudgetRows<T extends BudgetRow>(rows: T[]) {
  const overRows = rows.filter((r) => r.target != null && r.target > 0 && r.actual > r.target);
  const nearRows = rows.filter(
    (r) => r.target != null && r.target > 0 && r.actual / r.target >= 0.8 && r.actual <= r.target,
  );
  const totalTarget = rows.reduce((s, r) => s + (r.target ?? 0), 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);
  const totalOver = totalTarget > 0 && totalActual > totalTarget;
  return { overRows, nearRows, totalOver, totalTarget, totalActual };
}
