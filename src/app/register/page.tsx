import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { OnboardingWizard, type ResumeUser } from "./onboarding-wizard";

// Reads the session on every request: a refresh mid-wizard must resume, not start over.
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
  // welcome/about/password steps instead of re-running them. Only the fields the wizard
  // shows go to the client, never the user row itself.
  const resumeUser: ResumeUser | null = user
    ? {
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        email: user.email,
        avatarUrl: user.avatarUrl ?? null,
        mfaEnabled: user.totpEnabled,
      }
    : null;

  return <OnboardingWizard resumeUser={resumeUser} />;
}
