import { Icon, isLogoStyleIcon } from "@/components/icon";
import { cn } from "@/lib/utils";

const SIZE = {
  sm: { icon: "sm", glyph: 15 },
  md: { icon: "md", glyph: 18 },
  lg: { icon: "xl", glyph: 22 },
} as const;

/**
 * A category's icon as a circle: the category colour at a light wash behind the
 * glyph drawn in the colour itself (~13% in light mode, 20% in dark — see
 * --arca-icon-wash). 40px by default; brand logos and uploaded images render as they
 * always have. Without a colour it falls back to a neutral surface-2 chip.
 */
export function CategoryIcon({
  icon,
  color,
  size = "md",
  className,
}: {
  icon: string | null | undefined;
  color: string | null | undefined;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const s = SIZE[size];
  // Logos and uploads carry their own artwork and sizing; only plain glyphs get the wash.
  const logo = icon ? isLogoStyleIcon(icon) : false;
  const background = color
    ? `color-mix(in srgb, ${color} var(--arca-icon-wash), transparent)`
    : "var(--arca-surface-2)";
  return (
    <span className={cn("inline-flex shrink-0", className)}>
      <Icon
        iconKey={icon ?? null}
        color={color ?? null}
        background={icon && !logo ? background : null}
        size={s.icon}
        glyphSize={logo ? undefined : s.glyph}
        round
      />
    </span>
  );
}
