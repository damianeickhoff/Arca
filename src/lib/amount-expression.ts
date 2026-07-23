// Shared calculator-keypad expression logic, used by the add-transaction page and the
// recurrence amount subpage (see components/amount-keypad.tsx) so both behave identically.

export const OPERATORS = ["÷", "×", "−", "+"] as const;
export type Operator = (typeof OPERATORS)[number];

export function isOperator(ch: string): ch is Operator {
  return (OPERATORS as readonly string[]).includes(ch);
}

// Evaluate a keypad expression ("12+3×4", comma as decimal) into a number.
// Two-pass precedence (× ÷ before + −); a trailing operator is ignored so the
// amount updates live while mid-expression. Returns null for an empty/invalid one.
export function evaluateExpression(expr: string): number | null {
  const normalized = expr
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/,/g, ".");
  const tokens = normalized.match(/\d*\.?\d+|[+\-*/]/g);
  if (!tokens) return null;
  while (tokens.length && /[+\-*/]/.test(tokens[tokens.length - 1])) tokens.pop();
  if (!tokens.length) return null;

  const nums: number[] = [];
  const ops: string[] = [];
  for (const tk of tokens) {
    if (/[+\-*/]/.test(tk)) ops.push(tk);
    else nums.push(parseFloat(tk));
  }
  if (nums.length !== ops.length + 1) return null;

  // First pass: fold × and ÷ into the running number list.
  const foldedNums: number[] = [nums[0]];
  const foldedOps: string[] = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const n = nums[i + 1];
    if (op === "*") foldedNums[foldedNums.length - 1] *= n;
    else if (op === "/") foldedNums[foldedNums.length - 1] /= n;
    else {
      foldedNums.push(n);
      foldedOps.push(op);
    }
  }
  // Second pass: left-to-right + and −.
  let result = foldedNums[0];
  for (let i = 0; i < foldedOps.length; i++) {
    result = foldedOps[i] === "+" ? result + foldedNums[i + 1] : result - foldedNums[i + 1];
  }
  return Number.isFinite(result) ? Math.round(result * 100) / 100 : null;
}

export function formatAmount(n: number): string {
  return n.toLocaleString("nl-NL", { maximumFractionDigits: 2 });
}

// Apply a keypad key to the current expression string, returning the next expression.
export function pressKey(prev: string, key: string): string {
  if (key === "back") return prev.slice(0, -1);
  if (isOperator(key)) {
    if (!prev) return prev; // no leading operator
    if (isOperator(prev[prev.length - 1])) return prev.slice(0, -1) + key; // swap operator
    return prev + key;
  }
  if (key === ",") {
    // One decimal separator per number segment; auto-prefix a 0 when starting one.
    const segment = prev.split(/[÷×−+]/).pop() ?? "";
    if (segment.includes(",")) return prev;
    if (segment === "") return prev + "0,";
    return prev + ",";
  }
  return prev + key; // a digit
}
