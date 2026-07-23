"use client";

import { m, spring } from "@/lib/motion";

// The one tap-feedback primitive: spring-based scale on press. Use instead of
// CSS `active:scale-*` when an element deserves physical feedback (rows, FABs,
// tappable cards). Don't combine with CSS active:scale on the same element.
export function Pressable({
  scale = 0.97,
  ...props
}: React.ComponentProps<typeof m.button> & { scale?: number }) {
  return <m.button whileTap={{ scale }} transition={spring.press} {...props} />;
}

// Non-button variant for tappable cards / Link wrappers.
export function PressableDiv({
  scale = 0.985,
  ...props
}: React.ComponentProps<typeof m.div> & { scale?: number }) {
  return <m.div whileTap={{ scale }} transition={spring.press} {...props} />;
}
