import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GraduationCap, Mail, ShieldCheck, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { FadeIn } from "@/components/ui/motion";
import { useAuth } from "@/lib/auth/context";
import { useAdminLogin, useSignIn } from "@/lib/queries";
import { toast } from "sonner";

type LoginTab = "student" | "admin";

/**
 * PRD 40: two login paths, but the path chosen here grants NOTHING. The
 * backend decides the account type (PRD 5, 40).
 *
 * The page exposes two side-by-side tabs:
 *   * Student      -- email / optional password sign in, plus "Create Student
 *                     Account" for a normal student signup (leads to onboarding)
 *   * Administrator -- activation only, allowlist-only. Visually and
 *                     structurally separate from the student form. The address
 *                     is checked against the allowlist BEFORE any email is
 *                     requested (see useAdminLogin), so an unregistered
 *                     address gets no link and no account -- but the page shows
 *                     the SAME message either way, so it never reveals whether
 *                     an address is on the allowlist.
 *
 * Administrator activation is driven by AuthProvider, which wraps every route:
 * the emailed link can land anywhere because the client sets
 * detectSessionInUrl. Once a session exists, AuthProvider completes the
 * activation handshake and routes the user (onboarding for incomplete student
 * profiles, home otherwise), so this page does not perform its own redirect.
 */
export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { next?: string; tab?: LoginTab } => {
    const result: { next?: string; tab?: LoginTab } = {};

    const n = s["next"];
    if (
      typeof n === "string" &&
      n.startsWith("/") &&
      !n.startsWith("//") &&
      !n.includes("\\") &&
      !n.includes("\r") &&
      !n.includes("\n") &&
      !n.includes(":")
    ) {
      result.next = n;
    }

    // Deep link from the signup page: /login?tab=admin opens the administrator tab.
    if (s["tab"] === "admin" || s["tab"] === "student") {
      result.tab = s["tab"];
    }

    return result;
  },
  component: LoginPage,
});

function LoginPage() {
  const { session, isConfigured } = useAuth();
  const { next, tab } = Route.useSearch();

  // Student tab state.
  const [studentEmail, setStudentEmail] = useState("");
  const [studentPassword, setStudentPassword] = useState("");
  const [studentMessage, setStudentMessage] = useState<string | null>(null);

  // Administrator tab state -- kept separate so switching tabs never leaks an
  // address typed into the other flow.
  const [adminEmail, setAdminEmail] = useState("");
  const [adminNotice, setAdminNotice] = useState<{
    tone: "info" | "error";
    text: string;
  } | null>(null);

  const signIn = useSignIn();
  const adminLogin = useAdminLogin();

  useEffect(() => {
    if (next) sessionStorage.setItem("clubset_next", next);
  }, [next]);

  const handleStudentLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setStudentMessage(null);

    if (!studentPassword) {
      // Passwordless: sends a magic link (PRD 4, email-based authentication).
      await signIn.mutateAsync({ email: studentEmail });
      setStudentMessage("Check your email for a sign-in link.");
      toast("Sign-in link sent");
      return;
    }

    await signIn.mutateAsync({ email: studentEmail, password: studentPassword });
    setStudentMessage("Signed in.");
  };

  const handleAdminLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setAdminNotice(null);

    try {
      // The allowlist is consulted before any email is sent (see useAdminLogin),
      // but the hook deliberately does not report the verdict: the message below
      // is identical whether the address is registered or not, so the page never
      // reveals allowlist membership.
      await adminLogin.mutateAsync(adminEmail);
      setAdminNotice({
        tone: "info",
        text: "If that email is on your school's administrator allowlist, an activation link is on its way. Open it to finish setting up your account.",
      });
    } catch (error) {
      // Only genuine failures surface (network/RPC error, or the auth server
      // refusing the request). These never say anything about the allowlist.
      setAdminNotice({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "We couldn't process that request. Please try again.",
      });
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

        <CardContent>
          <Tabs defaultValue={tab ?? "student"} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="student">
                <GraduationCap className="mr-2 size-4" />
                Student
              </TabsTrigger>
              <TabsTrigger value="admin">
                <ShieldCheck className="mr-2 size-4" />
                Administrator
              </TabsTrigger>
            </TabsList>

            {/* ---------------- Student log in ---------------- */}
            <TabsContent value="student" className="space-y-6">
              <form onSubmit={handleStudentLogin} className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="student-email">Email</Label>
                  <Input
                    id="student-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={studentEmail}
                    onChange={(event) => setStudentEmail(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="student-password">Password (optional)</Label>
                  <Input
                    id="student-password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Leave blank to use a sign-in link"
                    value={studentPassword}
                    onChange={(event) => setStudentPassword(event.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={signIn.isPending}>
                  {signIn.isPending ? <Mail className="mr-2 size-4" /> : null}
                  Continue
                </Button>
              </form>

              {studentMessage ? (
                <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground animate-in fade-in">
                  {studentMessage}
                </p>
              ) : null}

              {signIn.error ? (
                <p className="form-message animate-in fade-in rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive duration-150">
                  {signIn.error.message}
                </p>
              ) : null}

              {/* ---------------- Create Student Account ---------------- */}
              <section className="space-y-2 border-t pt-4">
                <Link
                  to="/signup"
                  className="block"
                  onClick={() => {
                    setStudentMessage(null);
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
                <p className="text-center text-xs text-muted-foreground">
                  New to Clubset? Create your student account, then set up your profile.
                </p>
              </section>
            </TabsContent>

            {/* ---------------- Administrator (activation only) ---------------- */}
            <TabsContent value="admin" className="space-y-4">
              <p className="pt-2 text-sm text-muted-foreground">
                Teachers and staff only. Administrator access is granted by your school via the
                administrator allowlist -- entering an address here cannot grant it on its own.
              </p>

              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="admin-email">Email</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={adminEmail}
                    onChange={(event) => setAdminEmail(event.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={adminLogin.isPending}>
                  {adminLogin.isPending ? <Mail className="mr-2 size-4" /> : null}
                  Send activation link
                </Button>
              </form>

              {adminNotice ? (
                <p
                  role="status"
                  className={cn(
                    adminNotice.tone === "error"
                      ? "form-message animate-in fade-in rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive duration-150"
                      : "rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground animate-in fade-in",
                  )}
                >
                  {adminNotice.text}
                </p>
              ) : null}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
