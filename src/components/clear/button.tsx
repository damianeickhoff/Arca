"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import type { VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { clearButtonVariants } from "./button-variants";

/** A Clear button (see button-variants.ts for the variants). For a link styled as a
 *  button, use clearButtonVariants() on the <Link> instead. */
export function ClearButton({
  className,
  variant,
  size,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof clearButtonVariants>) {
  return <ButtonPrimitive data-slot="clear-button" className={cn(clearButtonVariants({ variant, size }), className)} {...props} />;
}
