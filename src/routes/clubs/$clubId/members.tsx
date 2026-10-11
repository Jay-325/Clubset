import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { Check, ShieldAlert, X } from "lucide-react";

import { AppShell, PageHeader, RequireAuth } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton, SkeletonSpinner } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { can } from "@/lib/auth/permissions";
import { useClubContext } from "@/lib/hooks/use-club";
import { GRADE_LABELS } from "@/lib/domain";
import { useClubMembers, useJoinRequests, useReviewMembership } from "@/lib/queries";
import type { GradeLevel, ProfileRow } from "@/lib/types/database";

/**
 * PRD 9/11: membership management, split into "who is in the club" and "who
 * wants in" so accepting a request is one tap rather than a settings hunt.
 *
 * The gate here is display-only. review_membership re-checks the permission in
 * Postgres, so a forged accept fails server-side regardless (PRD 41).
 */
export const Route = createFileRoute("/clubs/$clubId/members")({
  component: MembersPage,
});

function MembersPage() {
  return (
    <RequireAuth>
      <AppShell>
        <MembersContent />
      </AppShell>
    </RequireAuth>
  );
}

function MembersContent() {
  const { clubId } = useParams({ from: "/clubs/$clubId/members" });
  const context = useClubContext(clubId);
  const members = useClubMembers(clubId);
  const requests = useJoinRequests(clubId);
  const review = useReviewMembership();

  // PRD 38: an administrator linked to this club manages it even without a
  // leadership role, so they pass the same gate as a president.
  const allowed =
    context.data === null || context.data === undefined
      ? false
      : can(context.data.permissions, "manage_membership") ||
        context.data.isLinkedAdministrator ||
        context.data.isAdministrator;

  if (context.isLoading) {
    return <Skeleton className="h-72 w-full" />;
  }

  if (!allowed) {
    return (
      <>
        <PageHeader title="Members" description="Who is in this club." />
        <Card>
          <CardContent className="py-8 text-center">
            <ShieldAlert className="mx-auto mb-3 size-6 text-muted-foreground" />
            <p className="font-medium">You do not have permission to manage members</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask a club leader to add you to a role with the "Members &amp; join requests"
              permission.
            </p>
          </CardContent>
        </Card>
      </>
    );
  }

  const memberRows = members.data ?? [];
  const requestRows = requests.data ?? [];

  return (
    <>
      <PageHeader
        title={`${context.data?.club.name ?? "Club"} members`}
        description="Review who is in the club and who wants to join."
      />

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="requests">
            Join Requests
            {requestRows.length > 0 ? (
              <Badge variant="secondary" className="ml-2">
                {requestRows.length}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Active members</CardTitle>
              <CardDescription>Everyone who has been accepted into this club.</CardDescription>
            </CardHeader>
            <CardContent>
              {members.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : memberRows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No active members yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {memberRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          {row.profile.full_name || "Unnamed student"}
                        </TableCell>
                        <TableCell>{gradeLabel(row.profile.grade)}</TableCell>
                        <TableCell>{formatDate(row.joined_at ?? row.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pending join requests</CardTitle>
              <CardDescription>
                {/* PRD 9: accepting is all it takes -- chat access and the rest
                    of the club follow automatically in the database. */}
                Accepting someone adds them to the group chat automatically. No further setup is
                needed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {review.isError ? (
                <Alert variant="destructive">
                  <ShieldAlert className="size-4" />
                  <AlertTitle>Could not update that request</AlertTitle>
                  <AlertDescription>{review.error.message}</AlertDescription>
                </Alert>
              ) : null}

              {requests.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : requestRows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No one is waiting to join right now.
                </p>
              ) : (
                <ul className="space-y-2">
                  {requestRows.map((row) => (
                    <RequestRow
                      key={row.id}
                      profile={row.profile}
                      busy={review.isPending}
                      onAccept={() => review.mutate({ membershipId: row.id, accept: true })}
                      onDecline={() => review.mutate({ membershipId: row.id, accept: false })}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function RequestRow({
  profile,
  busy,
  onAccept,
  onDecline,
}: {
  profile: ProfileRow;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{profile.full_name || "Unnamed student"}</p>
        <p className="text-xs text-muted-foreground">{gradeLabel(profile.grade)}</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={onAccept}>
          {busy ? <SkeletonSpinner /> : <Check className="size-4" />}
          Accept
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={onDecline}>
          <X className="size-4" />
          Decline
        </Button>
      </div>
    </li>
  );
}

function gradeLabel(grade: GradeLevel | null): string {
  return grade ? GRADE_LABELS[grade] : "Grade not set";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
