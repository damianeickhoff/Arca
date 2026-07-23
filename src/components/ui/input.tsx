import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({
  className,
  type,
  backgroundClassName = "dark:bg-[var(--dialog-background)] bg-[var(--dialog-content-background)]",
  ...props
}: React.ComponentProps<"input"> & {
  backgroundClassName?: string;
}) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-lg border-input px-3.5 py-1 text-sm transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-foreground/30 focus-visible:border-ring focus-visible:ring-1 mt-1 mb-2 focus-visible:ring-foreground/15 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        backgroundClassName,
        className
      )}
      {...props}
    />
  )
}

export { Input }
