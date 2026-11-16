import { Link, useRouter, useLocation } from "@tanstack/react-router";
import {
  CalendarDays,
  Compass,
  LayoutGrid,
  Menu,
  Settings,
  Users,
  Bell,
  LogOut,
  PanelLeft,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { OtterBuddy } from "@/components/otter/OtterBuddy";
import { cn } from "@/lib/utils";
import { FadeIn } from "@/components/ui/motion";
import { useAuth } from "@/lib/auth/context";
import { useUnreadNotificationCount } from "@/lib/queries";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";

/**
 * PRD 39: four primary tabs -- Dashboard, Calendar, My Clubs, Settings.
 * Club-specific settings deliberately live inside each club instead.
 */
const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: Compass },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/my-clubs", label: "My Clubs", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

type NavItem = (typeof NAV_ITEMS)[number];

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

/** Returns the nav item matching the current route, or undefined. */
function activeNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.to === pathname);
}

/** Mobile-only hamburger that opens the off-canvas sidebar sheet. */
function MobileNavTrigger() {
  const { openMobile, setOpenMobile } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setOpenMobile(!openMobile)}
      aria-label={openMobile ? "Close navigation" : "Open navigation"}
      className="md:hidden h-11 w-11"
    >
      {openMobile ? <X className="size-5" /> : <Menu className="size-5" />}
    </Button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const router = useRouter();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const active = activeNavItem(location.pathname);

  return (
    <SidebarProvider defaultOpen open={sidebarOpen} onOpenChange={setSidebarOpen}>
      {/* Desktop sidebar: a spacer reserves the column width and the pane is
          fixed on top of it, so main content never slides underneath the
          sidebar. Collapsing the sidebar shrinks the spacer to the icon width,
          and main content expands to fill the remaining space automatically. */}
      <Sidebar>
        <SidebarHeader className="flex h-14 items-center gap-2 px-3 border-b border-sidebar-border">
          <Link to="/" className="flex items-center gap-2 font-semibold text-sidebar-foreground">
            <LayoutGrid className="size-5 text-sidebar-primary" />
            <span className={cn(sidebarOpen ? "block" : "hidden")}>Clubset</span>
          </Link>
        </SidebarHeader>

        <SidebarContent className="flex-1 flex-col min-h-0 overflow-y-auto">
          <SidebarMenu className="gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = active?.to === item.to;
              return (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    className={cn(
                      "text-sm",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-primary-foreground shadow-sm"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
                    )}
                  >
                    <Link to={item.to} activeOptions={{ exact: item.to === "/" }}>
                      <item.icon className="size-4 shrink-0" />
                      <span className={cn(sidebarOpen ? "block" : "hidden")}>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter className="flex-shrink-0 p-3 border-t border-sidebar-border">
          {profile ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-2">
                <span className={cn(sidebarOpen ? "text-sm" : "hidden", "text-sidebar-foreground")}>
                  {profile.full_name || profile.email}
                </span>
                {profile.account_type === "administrator" ? (
                  <Badge variant="secondary" className={cn(sidebarOpen ? "" : "hidden")}>
                    Admin
                  </Badge>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  void signOut().then(() => router.navigate({ to: "/login" }));
                }}
                aria-label="Sign out"
                className={cn(sidebarOpen ? "w-full justify-start" : "mx-auto w-11", "h-11")}
              >
                <LogOut className={cn("size-4", sidebarOpen ? "mr-2" : "mx-auto")} />
                {sidebarOpen && <span className="text-xs text-sidebar-foreground">Sign out</span>}
              </Button>
            </div>
          ) : null}
        </SidebarFooter>
      </Sidebar>

      {/* Main content area: flex-1 fills the remaining width after the sidebar spacer. */}
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
          <div className="flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              {/* Desktop collapse / expand toggle. */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen((prev) => !prev)}
                aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                className="hidden md:flex h-11 w-11"
              >
                {sidebarOpen ? <PanelLeft className="size-5" /> : <LayoutGrid className="size-5" />}
              </Button>
              {/* Mobile off-canvas navigation control. */}
              <MobileNavTrigger />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                asChild
                aria-label="Notifications"
                className="h-11 w-11"
              >
                <Link to="/notifications">
                  <Bell className="size-4" />
                  {unreadCount > 0 ? (
                    <Badge className="absolute -right-0.5 -top-0.5 h-3 min-w-3 px-1 text-[9px]">
                      {unreadCount}
                    </Badge>
                  ) : null}
                </Link>
              </Button>

              {profile ? (
                <div className="flex items-center gap-2 pl-2">
                  <span className="hidden sm:block text-sm text-foreground">
                    {profile.full_name || profile.email}
                  </span>
                  {profile.account_type === "administrator" ? (
                    <Badge variant="secondary" className="hidden sm:block">
                      Admin
                    </Badge>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Sign out"
                    onClick={() => {
                      void signOut().then(() => router.navigate({ to: "/login" }));
                    }}
                    className="h-11 w-11 hidden sm:flex"
                  >
                    <LogOut className="size-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto min-w-0 p-4 sm:p-6 lg:p-8">
          <FadeIn>{children}</FadeIn>
        </main>

        {/* Otter mascot — floating in the back corner on every page. */}
        <OtterBuddy />
      </SidebarInset>
    </SidebarProvider>
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
