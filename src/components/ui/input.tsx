import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({
  className,
  type,
  backgroundClassName = "bg-clear-tile",
  ...props
}: React.ComponentProps<"input"> & {
  backgroundClassName?: string;
}) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-[14px] border border-transparent px-4 py-1 text-sm text-clear-ink transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-clear-ink placeholder:text-clear-muted focus-visible:border-clear-ember focus-visible:ring-3 mt-1 mb-2 focus-visible:ring-clear-ember/25 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        backgroundClassName,
        className
      )}
      {...props}
    />
  )
}

export { Input }
