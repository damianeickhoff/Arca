import { BRAND_MAP } from "@/lib/brand-map";
import { parseImgKey, parseBrandKey } from "@/components/icon";

// Brand icon -- renders a @thesvg SVG on a flat white chip.

const SIZE_CLASSES = {
  sm:  { wrap: "size-10", svg: 16 },
  md:  { wrap: "size-10", svg: 16 },
  lg:  { wrap: "size-10", svg: 18 },
  xxl: { wrap: "size-14", svg: 28 },
};

const CHIP_BG = "bg-foreground/3 dark:bg-white/12";

interface BrandIconProps {
  iconKey?: string | null;
  size?: "sm" | "md" | "lg" | "xxl";
  color?: string | null;
}

export function BrandIcon({ iconKey, size = "md" }: BrandIconProps) {
  const { wrap, svg: svgSize } = SIZE_CLASSES[size];

  if (iconKey?.startsWith("img:")) {
    const { src, scale, ox, oy } = parseImgKey(iconKey);
    return (
      <div className={`${wrap} rounded-full ${CHIP_BG} shrink-0 relative overflow-hidden`}>
        <img
          src={src}
          alt=""
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: `${scale * 100}%`,
            height: `${scale * 100}%`,
            objectFit: "contain",
            transform: `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`,
          }}
        />
      </div>
    );
  }

  if (iconKey?.startsWith("custom:")) {
    const char = iconKey.slice(7);
    return (
      <div className={`${wrap} rounded-full ${CHIP_BG} shrink-0 flex items-center justify-center`}>
        <span className="text-base leading-none select-none">{char}</span>
      </div>
    );
  }

  const base = iconKey?.includes("?") ? iconKey.slice(0, iconKey.indexOf("?")) : iconKey;
  const icon = base ? BRAND_MAP[base] : null;

  if (!icon || !iconKey) {
    return (
      <div className={`${wrap} rounded-full ${CHIP_BG} shrink-0 flex items-center justify-center`}>
        <span className="text-xs text-muted-foreground font-medium">?</span>
      </div>
    );
  }

  const { scale, ox, oy } = parseBrandKey(iconKey);
  const sizedSvg = icon.svg.replace("<svg ", `<svg width="${svgSize}" height="${svgSize}" `);

  return (
    <div className={`${wrap} rounded-full ${CHIP_BG} shrink-0 relative overflow-hidden`} aria-label={icon.title}>
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
