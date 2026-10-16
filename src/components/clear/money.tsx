import { Children, cloneElement, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Privacy mode (html.privacy, see components/privacy-toggle.tsx) hides every money
 * figure behind a fixed run of dots ("€•••,••"), so neither the value nor its size
 * shows. These helpers render the real figure next to its dots; CSS in globals.css
 * swaps which one is visible, so they work in server components too.
 *
 * - <Money>: one formatted amount ("€1.234,56", "−€40").
 * - <MoneyText>: a sentence with formatted amounts in it ("About €12 a day until …"):
 *   only the amounts turn into dots, the words stay readable.
 * - <SvgMoneyText>: the same inside an SVG <text> (tspans instead of spans).
 * - The `money` class: for text that cannot be split, masked glyph by glyph instead.
 */

/** A formatted amount as lib/format writes it: optional sign, currency symbol,
 *  optional sign, digits with grouping/decimal marks — ending on a digit so a full
 *  stop or comma after the amount stays outside it — and the K/M/B of compact labels. */
const MONEY_PATTERN = /([−+-]?[€$£][−+-]?\d(?:[\d.,]*\d)?[KMBkmb]?)/;

/** The dots for one amount: the sign and symbol stay, the number (and a compact K/M)
 *  becomes a fixed "•••" (plus ",••" when it had cents) so the length gives nothing away. */
export function maskedMoney(formatted: string): string {
  return formatted.replace(/\d(?:[\d.,]*\d)?[KMBkmb]?/, (n) => (/,\d{2}$/.test(n) ? "•••,••" : "•••"));
}

export function Money({ children, className }: { children: string; className?: string }) {
  return (
    <span className={cn("money-swap", className)}>
      <span className="money-real">{children}</span>
      <span className="money-mask">{maskedMoney(children)}</span>
    </span>
  );
}

/** Splits every amount out of a translated sentence and wraps it in <Money>. It also
 *  looks inside elements it is given (the <b> chunks of a t.rich sentence, a label
 *  span), so wrapping the whole sentence is enough. Text that may only hold a string
 *  (<option>, SVG <text>) is left alone. */
export function MoneyText({ children }: { children: ReactNode }) {
  return <>{splitMoney(children)}</>;
}

/** <MoneyText> for the inside of an SVG <text>: each amount becomes a pair of tspans. */
export function SvgMoneyText({ children }: { children: string }) {
  const parts = children.split(new RegExp(MONEY_PATTERN.source, "g"));
  if (parts.length === 1) return <>{children}</>;
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Fragment key={i}>
            <tspan className="money-real">{part}</tspan>
            <tspan className="money-mask">{maskedMoney(part)}</tspan>
          </Fragment>
        ) : part ? (
          <Fragment key={i}>{part}</Fragment>
        ) : null,
      )}
    </>
  );
}

/** Elements whose children must stay plain text. */
const TEXT_ONLY = new Set(["option", "textarea", "title", "text", "tspan", "desc", "script", "style"]);

function splitMoney(node: ReactNode): ReactNode {
  if (typeof node === "string") {
    const parts = node.split(new RegExp(MONEY_PATTERN.source, "g"));
    if (parts.length === 1) return node;
    return parts.map((part, i) =>
      i % 2 === 1 ? <Money key={i}>{part}</Money> : part ? <Fragment key={i}>{part}</Fragment> : null,
    );
  }
  if (Array.isArray(node)) {
    return Children.map(node, (child) => splitMoney(child));
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    const children = node.props.children;
    if (children == null || typeof children === "function" || (typeof node.type === "string" && TEXT_ONLY.has(node.type))) return node;
    if (node.type === Money) return node;
    const split = splitMoney(children);
    return split === children ? node : cloneElement(node as ReactElement<{ children?: ReactNode }>, undefined, split);
  }
  return node;
}
