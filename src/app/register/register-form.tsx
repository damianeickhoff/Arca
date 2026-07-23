"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { registerAction } from "@/app/actions/auth";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    const result = await registerAction(formData);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.push("/login?registered=1");
  }

  return (
    <div>
      <h1 className="text-2xl lg:text-3xl font-black tracking-tight mb-1">Account aanmaken</h1>
      <p className="text-sm text-muted-foreground mb-4 lg:mb-8">Enter your details to register.</p>

      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2.5">
          {error}
        </div>
      )}

      <form action={handleSubmit} className="space-y-2 lg:space-y-1">
        <label className="text-sm font-medium text-foreground/80">Name</label>
        <Input type="text" name="name" required autoComplete="name" placeholder="Your name" />

        <label className="text-sm font-medium text-foreground/80">E-mailadres</label>
        <Input type="email" name="email" required autoComplete="email" placeholder="jij@email.com" />

        <label className="text-sm font-medium text-foreground/80">Password</label>
        <Input type="password" name="password" required autoComplete="new-password" placeholder="At least 8 characters" />

        <Button type="submit" disabled={pending} className="w-full mt-4">
          {pending ? "Account aanmaken..." : "Registreren"}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground text-center mt-4 lg:mt-6">
        Al een account?{" "}
        <Link href="/login" className="font-semibold text-foreground hover:underline">
          Inloggen
        </Link>
      </p>
    </div>
  );
}
