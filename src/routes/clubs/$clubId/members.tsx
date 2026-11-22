import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { Check, ShieldAlert, X } from "lucide-react";

import { ClubShell } from "@/components/club/ClubShell";
import { PageHeader } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  useClubMembers,
  useJoinRequests,
  useReviewMembership,
  useDues,
  useRoleAssignments,
  useAssignMemberRole,
  useRemoveMemberRole,
  useRemoveMember,
} from "@/lib/queries";
import type {
  DuesRow,
  GradeLevel,
  LeadershipRoleRow,
  MembershipRow,
  ProfileRow,
} from "@/lib/types/database";
import { toast } from "sonner";

export const Route = createFileRoute("/clubs/$clubId/members")({
  component: MembersPage,
});

function MembersPage() {
  return (
    <ClubShell>
      <MembersContent />
    </ClubShell>
  );
}

function MembersContent() {
  const { clubId } = useParams({ from: "/clubs/$clubId/members" });
  const context = useClubContext(clubId);
  const members = useClubMembers(clubId);
  const requests = useJoinRequests(clubId);
  const review = useReviewMembership();
  const dues = useDues(clubId);
  const roleAssignments = useRoleAssignments(clubId);
  const assignRole = useAssignMemberRole(clubId);
  const removeRole = useRemoveMemberRole(clubId);
  const removeMember = useRemoveMember(clubId);

  const allowed =
    context.data === null || context.data === undefined
      ? false
      : can(context.data.permissions, "manage_membership") ||
        context.data.isLinkedAdministrator ||
        context.data.isAdministrator;

  if (context.isLoading || members.isLoading || dues.isLoading || roleAssignments.isLoading) {
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
  const duesRows = dues.data ?? [];
  const assignments = roleAssignments.data ?? [];

  const memberRoleMap = new Map(assignments.map((a) => [a.user_id, a.leadership_roles]));
  const memberDuesMap = new Map(duesRows.map((d) => [d.user_id, d]));

  return (
    <>
      <PageHeader
        title={`${context.data?.club.name ?? "Club"} members`}
        description="Review who is in this club, their roles, and dues status."
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
              {memberRows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No active members yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Dues</TableHead>
                      <TableHead className="text-right">Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {memberRows.map((row) => (
                      <MemberRow
                        key={row.id}
                        row={row}
                        role={memberRoleMap.get(row.user_id) ?? null}
                        dues={memberDuesMap.get(row.user_id) ?? null}
                        allRoles={assignments.map((a) => a.leadership_roles).filter(Boolean)}
                        onRoleChange={(newRoleId) =>
                          assignRole.mutate({ userId: row.user_id, roleId: newRoleId })
                        }
                        onRemoveRole={() => removeRole.mutate({ userId: row.user_id })}
                        onRemoveMember={() => removeMember.mutate({ userId: row.user_id })}
                      />
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
                      onAccept={() =>
                        review.mutate({ membershipId: row.id, accept: true, clubId: row.club_id })
                      }
                      onDecline={() =>
                        review.mutate({ membershipId: row.id, accept: false, clubId: row.club_id })
                      }
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

function MemberRow({
  row,
  role,
  dues,
  allRoles,
  onRoleChange,
  onRemoveRole,
  onRemoveMember,
}: {
  row: MembershipRow & { profile: ProfileRow };
  role: LeadershipRoleRow | null;
  dues: DuesRow | null;
  allRoles: LeadershipRoleRow[];
  onRoleChange: (roleId: string) => void;
  onRemoveRole: () => void;
  onRemoveMember: () => void;
}) {
  const [isRemoving, setIsRemoving] = useState(false);
  const [newRoleId, setNewRoleId] = useState<string | null>(role?.id ?? null);

  const handleRemove = async () => {
    if (window.confirm("Remove this member from the club?")) {
      setIsRemoving(true);
      try {
        await onRemoveMember();
      } finally {
        setIsRemoving(false);
      }
    }
  };

  return (
    <TableRow key={row.id} className="animate-in fade-in">
      <TableCell className="font-medium">{row.profile.full_name || "Unnamed student"}</TableCell>
      <TableCell>{gradeLabel(row.profile.grade)}</TableCell>
      <TableCell>
        {role ? (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{role.name}</Badge>
            <Select
              value={newRoleId ?? ""}
              onValueChange={(value) => {
                setNewRoleId(value);
                if (value) onRoleChange(value);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Choose role" />
              </SelectTrigger>
              <SelectContent>
                {allRoles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <Badge variant="outline">Member</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        {dues ? (
          <Badge
            variant={
              dues.status === "paid"
                ? "secondary"
                : dues.status === "not_paid"
                  ? "destructive"
                  : "outline"
            }
          >
            {dues.status === "paid" ? "Paid" : dues.status === "not_paid" ? "Due" : "Unknown"}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right text-xs text-muted-foreground">
        {new Date(row.joined_at ?? row.created_at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex gap-1">
          {role ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRemoveRole()}
              disabled={isRemoving}
            >
              Remove role
            </Button>
          ) : null}
          <Button size="sm" variant="destructive" onClick={handleRemove} disabled={isRemoving}>
            {isRemoving ? <SkeletonSpinner /> : <X className="size-4" />}
            Remove
          </Button>
        </div>
      </TableCell>
    </TableRow>
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
