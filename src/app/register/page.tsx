import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { OnboardingWizard } from "./onboarding-wizard";

// Background preset is user-configurable (Settings → Appearance) and must always
// reflect the latest saved value.
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  // A session already exists once the wizard's password step creates the account
  // (see /api/onboarding), long before the wizard is actually finished — so "a user
  // exists" alone can't gate this redirect, or a refresh/reload anywhere past that
  // step ejects straight to the dashboard, skipping the rest of onboarding. Only a
  // genuinely completed run (the wizard's Finish step, see /api/onboarding/finish)
  // should redirect away from here.
  if (user?.onboardingComplete) redirect("/");

  // A refresh after the account-creation step lands here with a valid session but an
  // unfinished wizard — the account/profile fields already exist, so resume past the
  // name/email/birthday/password steps instead of re-running them (re-submitting the
  // same email at the password step would 409 as "already registered").
  const resumeUser = user
    ? { firstName: user.firstName ?? "", lastName: user.lastName ?? "", email: user.email }
    : null;

  return (
    <AuthShell>
      <OnboardingWizard resumeUser={resumeUser} />
    </AuthShell>
  );
}
