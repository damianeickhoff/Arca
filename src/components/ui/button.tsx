"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Mustard buttons are pills: the radius is always half the height. Variants:
//   default     — ink fill, background-coloured text (the house primary action)
//   accent      — mustard fill with ink text (the one saturated call to action)
//   outline     — surface fill with a 1px line border
//   secondary   — surface-2 fill
//   ghost       — no fill until hovered
//   destructive — negative on its soft wash
//   link        — accent-strong text
const buttonVariants = cva(
  "cursor-pointer group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-bold whitespace-nowrap transition-[transform,background-color,border-color,color,box-shadow,opacity] duration-150 outline-none select-none focus-visible:ring-3 focus-visible:ring-clear-ember/50 active:not-aria-[haspopup]:scale-[0.97] disabled:pointer-events-none disabled:bg-clear-tile disabled:!text-clear-muted disabled:border-transparent aria-invalid:border-clear-negative aria-invalid:ring-3 aria-invalid:ring-clear-negative/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-clear-primary text-clear-primary-ink hover:bg-clear-primary/90 aria-expanded:bg-clear-primary/90",
        accent: "bg-clear-ember text-clear-ember-ink hover:brightness-[1.03] aria-expanded:brightness-[1.03]",
        outline:
          "bg-clear-card border-clear-line text-clear-ink hover:bg-clear-tile aria-expanded:bg-clear-tile",
        secondary:
          "bg-clear-tile text-clear-ink hover:bg-clear-line aria-expanded:bg-clear-line",
        ghost:
          "bg-transparent text-clear-ink hover:bg-clear-tile aria-expanded:bg-clear-tile",
        destructive:
          "bg-clear-peach text-clear-negative hover:bg-clear-peach/80 focus-visible:ring-clear-negative/30",
        link: "h-auto px-0 text-clear-ember-text underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-12 gap-2 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4 text-[15px]",
        xs: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3.5 text-[13px] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-[18px] has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-10",
        // 40px hit area (WCAG touch-target minimum) around a visually smaller 14px icon —
        // for icon-sm-density layouts (e.g. transaction list rows) that need real tap targets.
        "icon-touch": "size-10 [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
