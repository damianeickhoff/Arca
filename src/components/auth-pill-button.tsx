import { IconArrowRight as ArrowRight } from "@tabler/icons-react";

// The auth pages' primary CTA — a white pill with the label on the left and a
// circular arrow badge on the right, matching the "Start Now" control from the
// reference designs. Used for both the login/sign-up submit and the onboarding
// wizard's per-step "Continue" button.
export function AuthPillButton({ className, children, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      {...props}
      className={`w-full h-14 rounded-full bg-white text-black font-semibold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-40 disabled:pointer-events-none ${className ?? ""}`}
    >
      <span className="truncate">{children}</span>
    </button>
  );
}
