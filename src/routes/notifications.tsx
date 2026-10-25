import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";

import { AppShell, PageHeader, RequireAuth } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarkNotificationRead, useNotifications } from "@/lib/queries";

/**
 * PRD 36: Clubset centralizes important notifications in one place so students
 * do not have to check five different screens.
 */
export const Route = createFileRoute("/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <NotificationsContent />
      </AppShell>
    </RequireAuth>
  );
}

function NotificationsContent() {
  const { data: notifications = [], isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const navigate = useNavigate();

  const open = (id: string, linkPath: string | null) => {
    if (!linkPath) return;
    void markRead.mutateAsync(id);
    void navigate({ to: linkPath });
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Club requests, RSVPs, announcements and leadership updates."
      />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Bell className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nothing new. Updates about your clubs will show up here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <Card
                className={`cursor-pointer transition-colors hover:border-primary/40 ${
                  notification.read_at ? "opacity-70" : ""
                }`}
                onClick={() => open(notification.id, notification.link_path)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{notification.title}</p>
                      {notification.body ? (
                        <p className="mt-0.5 text-sm text-muted-foreground">{notification.body}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(notification.created_at).toLocaleString()}
                      </p>
                    </div>
                    {!notification.read_at ? <Badge>New</Badge> : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
