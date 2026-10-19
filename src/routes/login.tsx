import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { GraduationCap, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SkeletonSpinner } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth/context";
import { useAdminActivation, useAdminLogin, useIsEmailVerified, useSignIn } from "@/lib/queries";

/**
 * PRD 40: two login paths, but the path chosen here grants NOTHING. The
 * backend decides the account type (PRD 5, 40) -- picking "Administrator"
 * only changes which check the backend runs.
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
  const { session, isConfigured, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [mode, setMode] = useState<"student" | "administrator">("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);

  const signIn = useSignIn();
  const adminLogin = useAdminLogin();
  const activateAdministrator = useAdminActivation();
  const emailVerified = useIsEmailVerified();

  // PRD 5: finishing the administrator handshake.
  //
  // The emailed link lands the teacher back here with a confirmed session but
  // still account_type 'student'. The role is granted only by the database --
  // this simply asks it to run the check once the email is actually verified.
  // A non-allowlisted or unverified user gets an error, not a role, and the
  // attempt is harmless either way: activate_administrator() is idempotent and
  // refuses anyone whose verified email is not on the allowlist.
  const activationAttempted = useRef(false);
  useEffect(() => {
    if (!session) {
      activationAttempted.current = false;
      return;
    }
    if (profile?.account_type === "administrator") return;
    if (emailVerified.data !== true) return;
    if (activationAttempted.current) return;
    activationAttempted.current = true;

    activateAdministrator
      .mutateAsync()
      .then(() => refreshProfile())
      .catch((error: unknown) => {
        // Not allowlisted is the common, expected case -- it is not an error
        // the teacher needs to see mid-sign-in. Anything else is surfaced.
        const text = error instanceof Error ? error.message : String(error);
        if (!/allowlist/i.test(text)) setActivationError(text);
      });
  }, [session, profile?.account_type, emailVerified.data, activateAdministrator, refreshProfile]);

  useEffect(() => {
    if (next) sessionStorage.setItem("joinin_next", next);
  }, [next]);

  // Stay on this page until the administrator handshake has settled, so the
  // redirect below cannot race the activation RPC and strand the teacher on a
  // student landing page.
  const activationPending =
    Boolean(session && profile?.account_type !== "administrator" && emailVerified.data === true) ||
    activateAdministrator.isPending;

  useEffect(() => {
    if (!session) return;
    if (activationPending) return;
    const target = next ?? sessionStorage.getItem("joinin_next");
    sessionStorage.removeItem("joinin_next");
    if (!target) {
      void navigate({ to: "/" });
      return;
    }
    if (target.startsWith("/") && !target.startsWith("//") && !/[\\\r\n:]/.test(target)) {
      try {
        const url = new URL(target, window.location.origin);
        if (url.origin === window.location.origin) {
          void navigate({ to: url.pathname + url.search + url.hash });
          return;
        }
      } catch {
        // ignore
      }
    }
    void navigate({ to: "/" });
  }, [session, navigate, next, activationPending]);

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
              Joinin needs a Supabase project before it can store accounts and clubs. Copy{" "}
              <code className="rounded bg-muted px-1 py-0.5">.env.example</code> to{" "}
              <code className="rounded bg-muted px-1 py-0.5">.env</code> and set{" "}
              <code className="rounded bg-muted px-1 py-0.5">VITE_SUPABASE_URL</code> and{" "}
              <code className="rounded bg-muted px-1 py-0.5">VITE_SUPABASE_ANON_KEY</code>.
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
          <CardTitle className="text-2xl">Joinin</CardTitle>
          <CardDescription>
            Communication, membership, events, attendance, finances and forms for your school clubs
            -- in one place.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="student">
                <GraduationCap className="size-4" />
                Student Login
              </TabsTrigger>
              <TabsTrigger value="administrator">
                <ShieldCheck className="size-4" />
                Administrator Login
              </TabsTrigger>
            </TabsList>

            <TabsContent value="student" className="mt-4">
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
                  {signIn.isPending ? <SkeletonSpinner /> : null}
                  Continue
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="administrator" className="mt-4">
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
                  {adminLogin.isPending ? <SkeletonSpinner /> : null}
                  Send activation link
                </Button>
                <p className="text-xs text-muted-foreground">
                  Teachers and staff only. Your school keeps the administrator allowlist -- entering
                  an address here cannot grant administrator access on its own.
                </p>
              </form>
            </TabsContent>
          </Tabs>

          {message ? (
            <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              {message}
            </p>
          ) : null}

          {signIn.error || adminLogin.error || activationError ? (
            <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {(signIn.error ?? adminLogin.error)?.message ?? activationError}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
