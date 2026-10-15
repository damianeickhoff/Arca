import { cva } from "class-variance-authority";

// The Clear button styles, kept out of button.tsx (a client component) so server
// components can call clearButtonVariants() for links styled as buttons.
//
// Clear buttons are pills (radius = half the height). Variants:
//   primary   — black fill (inverts in dark mode); the one main action per area
//   secondary — tile-grey fill; Cancel, Back and other quiet actions inside cards
//   surface   — card-white fill; buttons that sit on the grey page ground
//   ember     — the orange fill with ink text; reserved for "needs you" actions
//   outline   — 1.5px line, transparent; e.g. the second action on the hero card
//   danger    — red text, no fill; destructive actions in dialog footers
//   ghost     — no fill until hovered
export const clearButtonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent font-clear font-bold outline-none transition-[background-color,border-color,color,opacity,transform] duration-150 select-none focus-visible:ring-3 focus-visible:ring-clear-ember/50 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-clear-primary text-clear-primary-ink hover:opacity-90",
        secondary: "bg-clear-tile text-clear-ink hover:bg-clear-line",
        surface: "bg-clear-card text-clear-ink hover:bg-clear-tile",
        ember: "bg-clear-ember text-clear-ember-ink hover:brightness-105",
        outline: "border-current/40 border-[1.5px] bg-transparent text-current hover:border-current/70",
        danger: "bg-transparent px-2 text-clear-negative hover:underline",
        ghost: "bg-transparent text-clear-ink hover:bg-clear-tile",
      },
      size: {
        sm: "h-9 px-3.5 text-[13px] [&_svg:not([class*='size-'])]:size-4",
        md: "h-11 px-5 text-[15px] [&_svg:not([class*='size-'])]:size-[18px]",
        lg: "h-12 px-6 text-[15px] [&_svg:not([class*='size-'])]:size-[18px]",
        icon: "size-11 [&_svg:not([class*='size-'])]:size-5",
        "icon-lg": "size-14 [&_svg:not([class*='size-'])]:size-[22px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);
