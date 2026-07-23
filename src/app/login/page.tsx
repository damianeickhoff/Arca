import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { isFirstUser } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";

// Background preset is user-configurable (Settings → Appearance) and must always
// reflect the latest saved value.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  // Fresh install (no accounts yet) → send them straight into onboarding.
  if (await isFirstUser()) redirect("/register");

  return (
    <AuthShell
      title="No Penny left behind."
      subtitle="You can have anything you want if you work hard, trust the process, and stick to the plan."
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
