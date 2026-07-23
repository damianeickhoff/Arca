/**
 * Renders a formatEur(...) string US-style: comma as the thousands separator, dot as the decimal
 * separator, with the cents portion in a dimmer color than the whole-euro part. Single source of
 * truth for this treatment — used by the dashboard's wallet card, "Still to pay" card, and the
 * Reports page.
 */
export function SplitEur({ formatted, centsClassName = "opacity-30" }: { formatted: string; centsClassName?: string }) {
  const [wholePart, cents] = formatted.split(",");
  const whole = wholePart.replace(/\./g, ",");
  return (
    <>
      {whole}
      {cents && <span className={centsClassName}>.{cents}</span>}
    </>
  );
}
