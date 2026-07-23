import { useSyncExternalStore } from "react";

// Reference-counted flag for hiding the mobile bottom nav while a full-screen overlay
// (e.g. the category picker) is open. Counting rather than a boolean means nested or
// stacked overlays each hold their own claim and the nav only reappears once the last
// one closes.
let count = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Hide the bottom nav; call the returned function to release the claim. */
export function acquireNavHidden(): () => void {
  count++;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    count--;
    emit();
  };
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** True while at least one overlay wants the bottom nav hidden. */
export function useNavHidden(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => count > 0,
    () => false,
  );
}
