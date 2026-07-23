// The mobile hamburger menu has been removed from page headers — the menu is now
// reached via the bottom navigation's Settings tab. Kept as a no-op so the many
// call sites don't need to change, and header layouts keep their spacing.
export function MobileMenuButton(_props?: { className?: string }) {
  return null;
}
