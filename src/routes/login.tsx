import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail, ShieldCheck, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/context";
import { useAdminLogin, useSignIn } from "@/lib/queries";

/**
 * PRD 40: two login paths, but the path chosen here grants NOTHING. The
 * backend decides the account type (PRD 5, 40).
 *
 * The page exposes three distinct actions:
 *   * Log in (student) — email / optional password sign in
 *   * Create Student Account — normal student signup, leads to onboarding
 *   * Administrator Login / Activation — visually separate, allowlist-only
 *
 * Administrator activation is driven by AuthProvider, which wraps every route:
 * the emailed link can land anywhere because the client sets
 * detectSessionInUrl. Once a session exists, AuthProvider completes the
 * activation handshake and routes the user (onboarding for incomplete student
 * profiles, home otherwise), so this page does not perform its own redirect.
 */
export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => {
    const n = s["next"];
    if (typeof n !== "string") return {};
    if (n.startsWith("//")) return {};
    if (!n.startsWith("/")) return {};
    if (n.includes("\\") || n.includes("\r") || n.includes("\n") || n.includes(":")) return {};
    return { next: n };
  },
  component: LoginPage,
});

function LoginPage() {
  const { session, isConfigured } = useAuth();
  const { next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const signIn = useSignIn();
  const adminLogin = useAdminLogin();

  useEffect(() => {
    if (next) sessionStorage.setItem("clubset_next", next);
  }, [next]);

  const handleStudentLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (!password) {
      // Passwordless: sends a magic link (PRD 4, email-based authentication).
      await signIn.mutateAsync({ email });
      setMessage("Check your school email for a sign-in link.");
      return;
    }

    await signIn.mutateAsync({ email, password });
    setMessage("Signed in.");
  };

  const handleAdminLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    await adminLogin.mutateAsync(email);
    setMessage(
      "If that email is on your school's administrator allowlist, an activation link is on its way. Open it to finish setting up your account.",
    );
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

  // Signed in: AuthProvider finishes any administrator activation handshake and
  // routes the user (student onboarding if the profile is incomplete, home
  // otherwise). Do not render the login form while signed in.
  if (session) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Clubset</CardTitle>
          <CardDescription>
            Communication, membership, events, attendance, finances and forms for your school clubs
            -- in one place.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* ---------------- Student log in ---------------- */}
          <section>
            <form onSubmit={handleStudentLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="student-email">School email</Label>
                <Input
                  id="student-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@school.edu"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="student-password">Password (optional)</Label>
                <Input
                  id="student-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Leave blank to use a sign-in link"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={signIn.isPending}>
                {signIn.isPending ? <Mail className="size-4" /> : null}
                Continue
              </Button>
            </form>
          </section>

          {message ? (
            <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              {message}
            </p>
          ) : null}

          {signIn.error ? (
            <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {signIn.error.message}
            </p>
          ) : null}

          {/* ---------------- Create Student Account ---------------- */}
          <section className="pt-2">
            <Link
              to="/signup"
              className="block"
              onClick={() => {
                setMessage(null);
              }}
            >
              <Button
                className="w-full"
                variant="outline"
                disabled={signIn.isPending || adminLogin.isPending}
              >
                <UserPlus className="mr-2 size-4" />
                Create Student Account
              </Button>
            </Link>
            <p className="mt-2 text-xs text-muted-foreground text-center">
              New to Clubset? Create your student account, then set up your profile.
            </p>
          </section>

          {/* ---------------- Administrator (visually separate) ---------------- */}
          <Card className="border border-muted mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4" />
                Administrator Login / Activation
              </CardTitle>
              <CardDescription>
                Teachers and staff only. Administrator access is granted by your school via the
                administrator allowlist -- entering an address here cannot grant it on its own.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="admin-email">School email</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="teacher@school.edu"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={adminLogin.isPending}>
                  {adminLogin.isPending ? <Mail className="size-4" /> : null}
                  Send activation link
                </Button>
              </form>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}
