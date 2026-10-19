import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { AppShell, PageHeader, RequireAuth } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton, SkeletonSpinner } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/context";
import { useAdminClubOverview, useReviewClub } from "@/lib/queries";
import { CLUB_STATUS_LABELS } from "@/lib/domain";
import type { AuditLogRow, ClubStatus } from "@/lib/types/database";

/**
 * PRD 37: administrator oversight.
 *
 * Administrators approve clubs and watch for important changes. They do NOT
 * get blanket access to member conversations (PRD 37) -- nothing on this page
 * reads the chat.
 */
export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

function AdminPage() {
  return (
    <RequireAuth>
      <AppShell>
        <AdminContent />
      </AppShell>
    </RequireAuth>
  );
}

function AdminContent() {
  const { profile } = useAuth();
  // Visitors who are not administrators never reach the review queue, so they
  // should not ask the database for it either.
  const overview = useAdminClubOverview(profile?.account_type === "administrator");

  if (profile?.account_type !== "administrator") {
    return (
      <>
        <PageHeader title="Administrator" />
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            This page is for teachers and staff. Administrator access is granted by your school, not
            from this page.
          </CardContent>
        </Card>
      </>
    );
  }

  const pending = (overview.data ?? []).filter((row) =>
    ["awaiting_administrator_verification", "awaiting_student_verification"].includes(row.status),
  );

  return (
    <>
      <PageHeader
        title="Administrator"
        description="Review new clubs and monitor changes in the clubs you oversee."
      />

      <Tabs defaultValue="clubs">
        <TabsList>
          <TabsTrigger value="clubs">Clubs</TabsTrigger>
          <TabsTrigger value="audit">Activity log</TabsTrigger>
        </TabsList>

        <TabsContent value="clubs" className="mt-4">
          {overview.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="space-y-4">
              {pending.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Waiting for you</CardTitle>
                    <CardDescription>
                      These clubs need a decision before they can go live.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {pending.map((row) => (
                      <PendingClub key={row.club_id} row={row} />
                    ))}
                  </CardContent>
                </Card>
              ) : null}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">All clubs</CardTitle>
                </CardHeader>
                <CardContent>
                  {(overview.data ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No clubs in your school yet.</p>
                  ) : (
                    <ul className="divide-y">
                      {(overview.data ?? []).map((row) => (
                        <li
                          key={row.club_id}
                          className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                        >
                          <div>
                            <Link
                              to="/clubs/$clubId"
                              params={{ clubId: row.club_id }}
                              className="text-sm font-medium underline-offset-4 hover:underline"
                            >
                              {row.name}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              Founded by {row.founder_name ?? "unknown"} · {row.member_count} member
                              {row.member_count === 1 ? "" : "s"} · {row.administrator_count} admin
                              {row.administrator_count === 1 ? "" : "s"}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {CLUB_STATUS_LABELS[row.status as ClubStatus]}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <AuditLog />
        </TabsContent>
      </Tabs>
    </>
  );
}

/** PRD 7 step 3: the administrator approves or rejects a new club. */
function PendingClub({
  row,
}: {
  row: { club_id: string; name: string; status: ClubStatus; founder_name: string | null };
}) {
  const review = useReviewClub();

  const readyForDecision = row.status === "awaiting_administrator_verification";

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{row.name}</p>
          <p className="text-xs text-muted-foreground">
            Founded by {row.founder_name ?? "unknown"}
          </p>
        </div>
        <Badge variant="outline">{CLUB_STATUS_LABELS[row.status]}</Badge>
      </div>

      {readyForDecision ? (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={() => review.mutate({ clubId: row.club_id, approved: true })}
            disabled={review.isPending}
          >
            {review.isPending ? <SkeletonSpinner /> : null}
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => review.mutate({ clubId: row.club_id, approved: false })}
            disabled={review.isPending}
          >
            Reject
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Still collecting student confirmations. You can approve it once all three students have
          signed on.
        </p>
      )}

      {review.error ? (
        <p className="mt-2 text-sm text-destructive">{review.error.message}</p>
      ) : null}
    </div>
  );
}

/** PRD 42: important actions are logged and reviewable. */
function AuditLog() {
  const logs = useQuery({
    queryKey: ["admin", "audit"],
    queryFn: async (): Promise<AuditLogRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent activity</CardTitle>
        <CardDescription>
          Club approvals, permission changes, membership decisions and attendance corrections.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {logs.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (logs.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
        ) : (
          <ul className="divide-y">
            {(logs.data ?? []).map((log) => (
              <li key={log.id} className="py-2.5">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <ShieldCheck className="size-3.5 text-muted-foreground" />
                  {log.action.replace(/[._]/g, " ")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(log.created_at).toLocaleString()} · {log.object_type}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
