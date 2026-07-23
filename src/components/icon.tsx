import { BRAND_MAP } from "@/lib/brand-map";
import * as Tabler from "@tabler/icons-react";
import { resolveLegacyIconKey } from "@/lib/legacy-icon-map";
import { contrastIconColor } from "@/lib/color-luminance";

const SIZE = {
  xs: { wrap: "size-6", svg: 12 },
  sm: { wrap: "size-8", svg: 14 },
  md: { wrap: "size-10", svg: 22 },
  lg: { wrap: "size-10", svg: 22 },
  xl: { wrap: "size-12", svg: 26 },
  xxl: { wrap: "size-14", svg: 30 },
};


type TablerLib = Record<
  string,
  React.ComponentType<{ size?: number; color?: string; style?: React.CSSProperties }>
>;

// Parses img: keys that may carry ?s=scale&x=offsetX&y=offsetY transform params.
export function parseImgKey(key: string): { src: string; scale: number; ox: number; oy: number } {
  const raw = key.startsWith("img:") ? key.slice(4) : key;
  const q = raw.indexOf("?");
  if (q === -1) return { src: raw, scale: 1, ox: 0, oy: 0 };
  const p = new URLSearchParams(raw.slice(q + 1));
  return {
    src: raw.slice(0, q),
    scale: parseFloat(p.get("s") ?? "1") || 1,
    ox: parseFloat(p.get("x") ?? "0") || 0,
    oy: parseFloat(p.get("y") ?? "0") || 0,
  };
}

export function buildImgKey(src: string, scale: number, ox: number, oy: number): string {
  const p = new URLSearchParams();
  if (scale !== 1) p.set("s", String(scale));
  if (ox !== 0) p.set("x", String(ox));
  if (oy !== 0) p.set("y", String(oy));
  const qs = p.toString();
  return `img:${src}${qs ? "?" + qs : ""}`;
}

// Parses brand icon keys that may carry ?s=scale&x=offsetX&y=offsetY transform params.
export function parseBrandKey(key: string): { base: string; scale: number; ox: number; oy: number } {
  const q = key.indexOf("?");
  if (q === -1) return { base: key, scale: 1, ox: 0, oy: 0 };
  const p = new URLSearchParams(key.slice(q + 1));
  return {
    base: key.slice(0, q),
    scale: parseFloat(p.get("s") ?? "1") || 1,
    ox: parseFloat(p.get("x") ?? "0") || 0,
    oy: parseFloat(p.get("y") ?? "0") || 0,
  };
}

export function buildBrandKey(base: string, scale: number, ox: number, oy: number): string {
  const p = new URLSearchParams();
  if (scale !== 1) p.set("s", String(scale));
  if (ox !== 0) p.set("x", String(ox));
  if (oy !== 0) p.set("y", String(oy));
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

interface IconProps {
  iconKey?: string | null;
  color?: string | null;
  background?: string | null;
  backgroundGradient?: [string, string] | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "xxl";
  gradient?: [string, string];
  round?: boolean;
  flat?: boolean;
  /** Overrides the glyph (SVG/brand/emoji) pixel size while keeping the chip size fixed. */
  glyphSize?: number;
  /** Rendered instead of the plain placeholder dot when there's no iconKey — e.g. a person's initials. */
  initials?: string | null;
}

const INITIALS_TEXT_SIZE: Record<string, string> = {
  xs: "text-[8px]",
  sm: "text-[10px]",
  md: "text-[10px]",
  lg: "text-[11px]",
  xl: "text-xs",
  xxl: "text-sm",
};

export function isBrandIcon(key: string): boolean {
  const base = key.includes("?") ? key.slice(0, key.indexOf("?")) : key;
  return base in BRAND_MAP;
}

// True for any "logo-style" icon that renders on a transparent chip unless an
// explicit background is given — @thesvg brand icons, uploaded images, and
// custom emoji/text. Plain Tabler icons don't count: they get their own
// colored chip from `color` automatically, so they never need this.
export function isLogoStyleIcon(key: string): boolean {
  return key.startsWith("img:") || key.startsWith("custom:") || isBrandIcon(key);
}

export function Icon({
  iconKey,
  color,
  background,
  backgroundGradient,
  size = "md",
  gradient,
  round,
  flat,
  initials,
  glyphSize,
}: IconProps) {
  const { wrap, svg: baseSvgSize } = SIZE[size];
  const svgSize = glyphSize ?? baseSvgSize;
  const shape = round ? "rounded-full" : "rounded-xl";

  const chipBg = flat
    ? "dark:bg-black"
    : "dark:bg-black";

  const chipStyle: React.CSSProperties = {};

  if (backgroundGradient) {
    chipStyle.background = `linear-gradient(
      135deg,
      ${backgroundGradient[0]},
      ${backgroundGradient[1]}
    )`;
  } else if (background) {
    chipStyle.backgroundColor = background;
  }

  const gradId = gradient
    ? `ig-${gradient[0].replace("#", "")}-${gradient[1].replace("#", "")}`
    : null;

  if (!iconKey) {
    const solid = color && !background && !backgroundGradient;
    if (solid) chipStyle.backgroundColor = color!;
    return (
      <div
        className={`${wrap} ${shape} ${solid ? "" : chipBg} shrink-0 flex items-center justify-center`}
        style={chipStyle}
      >
        {initials ? (
          <span
            className={`${INITIALS_TEXT_SIZE[size]} font-semibold leading-none select-none tracking-tight`}
            style={{ color: solid ? contrastIconColor(color!) : (color ?? "#64748b") }}
          >
            {initials}
          </span>
        ) : (
          <div className="size-2 rounded-sm" style={{ backgroundColor: solid ? contrastIconColor(color!) : (color ?? "#94a3b8") }} />
        )}
      </div>
    );
  }

  if (iconKey.startsWith("img:")) {
    const { src, scale, ox, oy } = parseImgKey(iconKey);
    return (
      <div
        className={`${wrap} ${shape} ${chipBg} shrink-0 relative overflow-hidden`}
        style={chipStyle}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: `${scale * 100}%`,
            height: "auto",
            transform: `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`,
          }}
        />
      </div>
    );
  }

  if (iconKey.startsWith("custom:")) {
    const char = iconKey.slice(7);
    const solid = color && !background && !backgroundGradient;
    if (solid) chipStyle.backgroundColor = color!;
    const fg = solid ? contrastIconColor(color!) : (color ?? undefined);
    return (
      <div
        className={`${wrap} ${shape} ${solid ? "" : chipBg} shrink-0 flex items-center justify-center`}
        style={chipStyle}
      >
        <span
          className="text-base leading-none select-none"
          style={fg ? { color: fg } : undefined}
        >
          {char}
        </span>
      </div>
    );
  }

  if (isBrandIcon(iconKey)) {
    const { base, scale, ox, oy } = parseBrandKey(iconKey);
    const icon = BRAND_MAP[base];
    // Brand SVGs must fit within the inscribed circle (rounded-full) with ~2px padding from the edge.
    const BRAND_PX: Record<string, number> = { "size-6": 13, "size-10": 25, "size-12": 30, "size-14": 35 };
    const brandSvgSize = glyphSize ?? BRAND_PX[wrap] ?? svgSize;
    const sizedSvg = icon.svg.replace("<svg ", `<svg width="${brandSvgSize}" height="${brandSvgSize}" `);

    return (
      <div
        className={`${wrap} ${shape} ${chipBg} shrink-0 relative overflow-hidden`}
        style={chipStyle}
        aria-label={icon.title}
      >
        <div
          dangerouslySetInnerHTML={{ __html: sizedSvg }}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            lineHeight: 0,
            transform: `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px)) scale(${scale})`,
          }}
        />
      </div>
    );
  }

  const tablerLib = Tabler as unknown as TablerLib;
  const tablerKeys = new Set(Object.keys(Tabler));

  const resolvedKey =
    iconKey.startsWith("Icon") && tablerKeys.has(iconKey)
      ? iconKey
      : resolveLegacyIconKey(iconKey, tablerKeys);

  const TablerIconComp = resolvedKey ? tablerLib[resolvedKey] : undefined;
  const isFilled = resolvedKey?.endsWith("Filled") ?? false;

  // color = the icon glyph color; the chip gets an automatic muted tint of that
  // same color (a lighter, opacity-based wash) unless an explicit background is set.
  const hasColorBackground =
    color && !background && !backgroundGradient && !gradient;

  if (hasColorBackground) {
    chipStyle.backgroundColor = color;
  }

  const fg = gradient
    ? undefined
    : hasColorBackground
      ? contrastIconColor(color!)
      : color ?? "#94a3b8";

  const iconStyle: React.CSSProperties =
    gradient && gradId
      ? isFilled
        ? { fill: `url(#${gradId})` }
        : { stroke: `url(#${gradId})` }
      : {};

  if (!TablerIconComp) {
    return (
      <div
        className={`${wrap} ${shape} ${hasColorBackground ? "" : chipBg} shrink-0`}
        style={chipStyle}
      />
    );
  }

  return (
    <>
      {gradient && gradId && (
        <svg
          aria-hidden="true"
          style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
        >
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={gradient[0]} />
              <stop offset="100%" stopColor={gradient[1]} />
            </linearGradient>
          </defs>
        </svg>
      )}

      <div
        className={`${wrap} ${shape} ${hasColorBackground ? "" : chipBg} shrink-0 flex items-center justify-center`}
        style={chipStyle}
      >
        <TablerIconComp size={svgSize} color={fg} style={iconStyle} />
      </div>
    </>
  );
}
