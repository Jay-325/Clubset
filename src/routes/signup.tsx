import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/context";
import { useSignUp } from "@/lib/queries";

/**
 * Student account creation (PRD 4).
 *
 *   Enter email + password
 *   -> create/activate student account (HIBP-checked password)
 *   -> email verification, if the Auth project requires it
 *   -> student profile setup/onboarding (/onboarding)
 *   -> Clubset home
 *
 * The administrator flow is deliberately NOT here: administrator access is
 * activation-only via the existing AdminUser allowlist and is reached from the
 * Administrator Login/Activation tab on /login, never from this page.
 */
export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const { session, isConfigured } = useAuth();
  const navigate = useNavigate();
  const signUp = useSignUp();
  const [step, setStep] = useState<"account" | "verify">("account");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  // Already signed in (for example after clicking the email verification link):
  // finish onboarding instead of re-showing the signup form.
  useEffect(() => {
    if (session) {
      void navigate({ to: "/onboarding" });
    }
  }, [session, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (!email || !password) {
      setMessage("Please enter your email and a password.");
      return;
    }

    try {
      const result = await signUp.mutateAsync({ email, password });

      // If Supabase created a session (email auto-confirmed or no confirmation
      // required), continue straight to profile onboarding.
      if (result?.session) {
        void navigate({ to: "/onboarding" });
        return;
      }

      // Otherwise email confirmation is required: the user must verify their
      // address before they can sign in and finish onboarding.
      setStep("verify");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "We couldn't create your account. Please try again.",
      );
    }
  };

  if (!isConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Connect Supabase to continue</CardTitle>
            <CardDescription>
              Clubset needs a Supabase project before it can store accounts and clubs. Copy{" "}
              <code className="rounded bg-muted px-1 py-0.5">.env.example</code> to{" "}
              <code className="rounded bg-muted px-1 py-0.5">.env</code> and set{" "}
              <code className="rounded bg-muted px-1 py-0.5">VITE_SUPABASE_URL</code> and{" "}
              <code className="rounded bg-muted px-1 py-0.5">VITE_SUPABASE_PUBLISHABLE_KEY</code>.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Create Student Account</CardTitle>
          <CardDescription>
            Join Clubset as a student. Administrator access is separate -- use the{" "}
            <Link
              to="/login"
              search={{ tab: "admin" }}
              className="font-medium underline underline-offset-4 hover:text-primary"
            >
              Administrator tab
            </Link>{" "}
            on the login page instead.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {step === "account" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <Input
                  id="signup-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="Choose a strong password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Your password is checked against known data breaches before the account is
                  created.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={signUp.isPending}>
                {signUp.isPending ? <Mail className="size-4" /> : null}
                <ArrowRight className="ml-2 size-4" />
                Create account
              </Button>
            </form>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Check your email</CardTitle>
                <CardDescription>
                  We sent a verification link to your email. Open it to verify your address, then
                  sign in to finish setting up your profile.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-sm text-muted-foreground">
                  Didn't receive it? Check your spam folder, or{" "}
                  <Link
                    to="/login"
                    className="font-medium underline underline-offset-4 hover:text-primary"
                  >
                    sign in
                  </Link>
                  .
                </p>
              </CardContent>
            </>
          )}

          {message ? (
            <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {message}
            </p>
          ) : null}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-medium underline underline-offset-4 hover:text-primary"
            >
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Creating an account as a student does not grant administrator access. Administrator accounts
        are activation-only and require an address on your school's administrator allowlist -- see
        the{" "}
        <Link
          to="/login"
          search={{ tab: "admin" }}
          className="font-medium underline underline-offset-4 hover:text-primary"
        >
          Administrator tab
        </Link>{" "}
        on the login page.
      </p>
    </div>
  );
}
