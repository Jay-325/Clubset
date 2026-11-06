import { Link, useRouter } from "@tanstack/react-router";
import { CalendarDays, Compass, LayoutGrid, Settings, Users, Bell, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { OtterBuddy } from "@/components/otter/OtterBuddy";
import { cn } from "@/lib/utils";
import { FadeIn } from "@/components/ui/motion";
import { useAuth } from "@/lib/auth/context";
import { useUnreadNotificationCount } from "@/lib/queries";

/**
 * PRD 39: four primary tabs -- Main, My Clubs, Calendar, Settings.
 * Club-specific settings deliberately live inside each club instead.
 */
const TABS = [
  { to: "/", label: "Main", icon: Compass },
  { to: "/my-clubs", label: "My Clubs", icon: Users },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

/** Redirects to sign-in when there is no session (PRD 40/41). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !session) {
      void router.navigate({ to: "/login" });
    }
  }, [isLoading, session, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="border-b">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
            <Skeleton className="h-5 w-24" />
            <nav className="hidden flex-1 items-center gap-1 sm:flex">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-24" />
            </nav>
            <Skeleton className="ml-auto size-8 rounded-full" />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          <Skeleton className="mb-6 h-8 w-1/3" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </main>
      </div>
    );
  }

  if (!session) return null;
  return <>{children}</>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <LayoutGrid className="size-5 text-primary" />
            Clubset
          </Link>

          <nav className="hidden flex-1 items-center gap-1 sm:flex">
            {TABS.map((tab) => (
              <Button
                key={tab.to}
                variant="ghost"
                size="sm"
                asChild
                className="transition-colors duration-200 [aria-current=page]:bg-accent [aria-current=page]:text-accent-foreground"
              >
                <Link to={tab.to} activeOptions={{ exact: tab.to === "/" }}>
                  <tab.icon className="size-4" />
                  {tab.label}
                </Link>
              </Button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild aria-label="Notifications">
              <Link to="/notifications">
                <Bell className="size-4" />
                {unreadCount > 0 ? (
                  <Badge className="absolute -right-0.5 -top-0.5 h-4 min-w-4 px-1 text-[10px]">
                    {unreadCount}
                  </Badge>
                ) : null}
              </Link>
            </Button>

            {profile ? (
              <div className="flex items-center gap-2">
                {/* PRD 5/3: the account type shown here comes from the database. */}
                <span className="hidden text-sm text-muted-foreground sm:inline">
                  {profile.full_name || profile.email}
                </span>
                {profile.account_type === "administrator" ? (
                  <Badge variant="secondary">Admin</Badge>
                ) : null}
              </div>
            ) : null}

            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={() => {
                void signOut().then(() => router.navigate({ to: "/login" }));
              }}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>

        {/* Bottom bar on small screens so the four tabs stay reachable. */}
        <nav className="flex border-t sm:hidden">
          {TABS.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              activeOptions={{ exact: tab.to === "/" }}
              className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-muted-foreground aria-[current]:text-foreground"
            >
              <tab.icon className="size-4" />
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <FadeIn>{children}</FadeIn>
      </main>

      {/* Otter mascot — floating in the back corner on every page. */}
      <OtterBuddy />
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}
