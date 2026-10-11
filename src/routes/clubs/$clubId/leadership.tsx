import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Check, Crown, ShieldCheck, Sparkles, UserCheck, X } from "lucide-react";

import { AppShell, PageHeader, RequireAuth } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton, SkeletonSpinner } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { can } from "@/lib/auth/permissions";
import {
  ALL_PERMISSIONS,
  PERMISSION_LABELS,
  REQUIREMENT_LABELS,
  SUGGESTED_ROLES,
} from "@/lib/domain";
import { useClubContext } from "@/lib/hooks/use-club";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  ApplicationStatus,
  ClubPermission,
  EligibilityRequirementRow,
  Json,
  LeadershipApplicationRow,
  LeadershipRoleRow,
  ProfileRow,
  RequirementKind,
  TablesInsert,
} from "@/lib/types/database";

/**
 * PRD 10/32-34: the positions a club offers, the permissions each one carries,
 * and who may apply for them.
 *
 * Eligibility is decided in Postgres from FINALIZED attendance, never from RSVP
 * counts, so the helper text on the applications tab matters (PRD 34, 53.14).
 */
export const Route = createFileRoute("/clubs/$clubId/leadership")({
  component: LeadershipPage,
});

function LeadershipPage() {
  return (
    <RequireAuth>
      <AppShell>
        <LeadershipContent />
      </AppShell>
    </RequireAuth>
  );
}

const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Being reviewed",
  accepted: "Accepted",
  rejected: "Not chosen",
  withdrawn: "Withdrawn",
};

interface EligibleRole {
  role_id: string;
  club_id: string;
  role_name: string;
  metrics: Json;
}

function LeadershipContent() {
  const { clubId } = useParams({ from: "/clubs/$clubId/leadership" });
  const context = useClubContext(clubId);
  const queryClient = useQueryClient();

  const permissions = context.data?.permissions ?? [];
  const isLinkedAdministrator = context.data?.isLinkedAdministrator ?? false;
  const mayManage = can(permissions, "manage_leadership") || isLinkedAdministrator;

  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [rolePermissions, setRolePermissions] = useState<ClubPermission[]>([]);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const viewer = useQuery({
    queryKey: ["viewer-id"],
    queryFn: async (): Promise<string | null> => {
      const supabase = getSupabaseClient();
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    },
  });

  const roles = useQuery({
    queryKey: ["club", clubId, "leadership-roles"],
    queryFn: async (): Promise<LeadershipRoleRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("leadership_roles")
        .select("*")
        .eq("club_id", clubId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LeadershipRoleRow[];
    },
    enabled: Boolean(clubId),
  });

  const roleRows = useMemo(() => roles.data ?? [], [roles.data]);
  const roleIds = useMemo(() => roleRows.map((role) => role.id), [roleRows]);

  // Requirements are system rules attached to a position (PRD 32); they are read
  // per role so a leader can see exactly what a candidate has to clear.
  const requirements = useQuery({
    queryKey: ["club", clubId, "eligibility-requirements", roleIds],
    queryFn: async (): Promise<EligibilityRequirementRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("eligibility_requirements")
        .select("*")
        .in("role_id", roleIds);
      if (error) throw error;
      return (data ?? []) as EligibilityRequirementRow[];
    },
    enabled: roleIds.length > 0,
  });

  const applications = useQuery({
    queryKey: ["club", clubId, "leadership-applications"],
    queryFn: async (): Promise<LeadershipApplicationRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("leadership_applications")
        .select("*")
        .eq("club_id", clubId)
        .order("submitted_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as LeadershipApplicationRow[];
    },
    enabled: Boolean(clubId),
  });

  const applicationRows = useMemo(() => applications.data ?? [], [applications.data]);
  const applicantIds = useMemo(
    () => [...new Set(applicationRows.map((application) => application.applicant_id))],
    [applicationRows],
  );

  const applicants = useQuery({
    queryKey: ["club", clubId, "applicant-names", applicantIds],
    queryFn: async (): Promise<ProfileRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.from("profiles").select("*").in("id", applicantIds);
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
    enabled: applicantIds.length > 0,
  });

  const nameById = useMemo(
    () =>
      new Map(
        (applicants.data ?? []).map(
          (person) => [person.id, person.full_name || person.email] as const,
        ),
      ),
    [applicants.data],
  );

  const roleNameById = useMemo(
    () => new Map(roleRows.map((role) => [role.id, role.name] as const)),
    [roleRows],
  );

  // PRD 33 steps 2-4: the database answers "which positions am I open for?" so
  // an ineligible student is never shown a button that would fail.
  const eligible = useQuery({
    queryKey: ["club", clubId, "eligible-roles", viewer.data],
    queryFn: async (): Promise<EligibleRole[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc("eligible_roles_for", {
        student_id: viewer.data ?? "",
      });
      if (error) throw error;
      const rows = (data ?? []) as EligibleRole[];
      return rows.filter((row) => row.club_id === clubId);
    },
    enabled: Boolean(clubId) && Boolean(viewer.data),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["club", clubId, "leadership"] });
    void queryClient.invalidateQueries({ queryKey: ["club", clubId, "eligible-roles"] });
  };

  const createRole = useMutation({
    mutationFn: async (input: {
      name: string;
      description: string;
      permissions: ClubPermission[];
    }) => {
      const supabase = getSupabaseClient();
      const { error } = await insertRole({
        club_id: clubId,
        name: input.name,
        description: input.description,
        // The permission slugs are stored as an array on the role, which is
        // exactly what has_club_permission() reads (PRD 10).
        permissions: input.permissions,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setRoleName("");
      setRoleDescription("");
      setRolePermissions([]);
      setRoleError(null);
    },
  });

  const review = useMutation({
    mutationFn: async (input: { applicationId: string; accept: boolean; notes: string }) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc("review_application", {
        target_application: input.applicationId,
        accept: input.accept,
        review_notes: input.notes.trim() === "" ? null : input.notes.trim(),
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const applyForRole = useMutation({
    mutationFn: async (roleId: string) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc("apply_for_role", { target_role: roleId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const handleCreateRole = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (roleName.trim() === "") {
      setRoleError("Give the position a name members will recognise.");
      return;
    }
    if (rolePermissions.length === 0) {
      setRoleError("Pick at least one permission, otherwise the position grants nothing.");
      return;
    }
    setRoleError(null);
    createRole.mutate({
      name: roleName.trim(),
      description: roleDescription.trim(),
      permissions: rolePermissions,
    });
  };

  if (context.isLoading || roles.isLoading) {
    return <Skeleton className="h-72 w-full" />;
  }

  const pendingApplications = applicationRows.filter(
    (application) => application.status === "submitted" || application.status === "under_review",
  );

  return (
    <>
      <PageHeader
        title="Leadership"
        description="The positions in this club, who holds them, and who wants them next."
      />

      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="applications">
            Applications
            {pendingApplications.length > 0 ? (
              <Badge className="ml-2">{pendingApplications.length}</Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="mt-4 space-y-4">
          {mayManage ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Create a position</CardTitle>
                <CardDescription>
                  Permissions decide what the holder can do. Start from a suggestion and adjust it.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Start from a suggested role
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTED_ROLES.map((suggestion) => (
                      <Button
                        key={suggestion.name}
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRoleName(suggestion.name);
                          setRoleDescription(suggestion.description);
                          setRolePermissions([...suggestion.permissions]);
                        }}
                      >
                        <Sparkles className="size-4" />
                        {suggestion.name}
                      </Button>
                    ))}
                  </div>
                </div>

                <form onSubmit={handleCreateRole} className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="role-name">Name</Label>
                      <Input
                        id="role-name"
                        value={roleName}
                        onChange={(event) => setRoleName(event.target.value)}
                        placeholder="Treasurer"
                        maxLength={80}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="role-description">What they do</Label>
                      <Input
                        id="role-description"
                        value={roleDescription}
                        onChange={(event) => setRoleDescription(event.target.value)}
                        placeholder="Keeps track of club money"
                        maxLength={160}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">What can they do?</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {ALL_PERMISSIONS.map((permission) => (
                        <label key={permission} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={rolePermissions.includes(permission)}
                            onCheckedChange={(checked) =>
                              setRolePermissions((current) =>
                                checked === true
                                  ? [...current, permission]
                                  : current.filter((entry) => entry !== permission),
                              )
                            }
                            aria-label={PERMISSION_LABELS[permission]}
                          />
                          {PERMISSION_LABELS[permission]}
                        </label>
                      ))}
                    </div>
                  </div>

                  {roleError ? (
                    <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {roleError}
                    </p>
                  ) : null}
                  {createRole.error ? (
                    <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {createRole.error.message}
                    </p>
                  ) : null}

                  <Button type="submit" disabled={createRole.isPending}>
                    {createRole.isPending ? (
                      <SkeletonSpinner />
                    ) : (
                      <Crown className="size-4" />
                    )}
                    Create position
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Positions</CardTitle>
              <CardDescription>
                Each position carries its own permissions, so nobody has to be given everything.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {roleRows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No positions yet.
                  {mayManage
                    ? " Create one above, or start from a suggested role."
                    : " A leader will add them soon."}
                </p>
              ) : (
                <ul className="divide-y">
                  {roleRows.map((role) => {
                    const roleRequirements = (requirements.data ?? []).filter(
                      (requirement) => requirement.role_id === role.id,
                    );
                    return (
                      <li key={role.id} className="py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{role.name}</p>
                          {role.is_review_supervisor ? (
                            <Badge variant="outline">Reviews applications</Badge>
                          ) : null}
                        </div>
                        {role.description ? (
                          <p className="text-sm text-muted-foreground">{role.description}</p>
                        ) : null}

                        <div className="mt-2 flex flex-wrap gap-1">
                          {role.permissions.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              Grants no permissions
                            </span>
                          ) : (
                            role.permissions.map((permission) => (
                              <Badge key={permission} variant="secondary">
                                <ShieldCheck className="size-3" />
                                {PERMISSION_LABELS[permission]}
                              </Badge>
                            ))
                          )}
                        </div>

                        {roleRequirements.length > 0 ? (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-muted-foreground">
                              Requirements
                            </p>
                            <ul className="text-xs text-muted-foreground">
                              {roleRequirements.map((requirement) => (
                                <li key={requirement.id}>
                                  {requirementText(requirement.kind, requirement.threshold)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="applications" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Positions you can apply for</CardTitle>
              <CardDescription>
                Eligibility is measured from finalized attendance that a leader confirmed, not from
                RSVPs -- so saying yes and not turning up cannot help anyone qualify (PRD 34,
                53.14). Anything you do not meet yet is simply not listed here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {eligible.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (eligible.data ?? []).length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  You are not eligible for an open position in this club yet. Requirements are
                  checked against attendance a leader has confirmed, so keep showing up and they
                  will update automatically.
                </p>
              ) : (
                <ul className="divide-y">
                  {(eligible.data ?? []).map((role) => (
                    <li
                      key={role.role_id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3"
                    >
                      <div>
                        <p className="font-medium">{role.role_name}</p>
                        <p className="text-xs text-muted-foreground">{metricsText(role.metrics)}</p>
                      </div>
                      <Button
                        size="sm"
                        disabled={applyForRole.isPending}
                        onClick={() => applyForRole.mutate(role.role_id)}
                      >
                        {applyForRole.isPending ? (
                          <SkeletonSpinner />
                        ) : (
                          <UserCheck className="size-4" />
                        )}
                        Apply
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {applyForRole.error ? (
                <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {applyForRole.error.message}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Applications</CardTitle>
                  <CardDescription>
                    Profile information is attached automatically when someone applies -- nobody
                    re-types it (PRD 33).
                  </CardDescription>
                </div>
                {mayManage ? <Badge variant="outline">You can review</Badge> : null}
              </div>
            </CardHeader>
            <CardContent>
              {applications.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : applicationRows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No applications yet.
                </p>
              ) : (
                <ul className="divide-y">
                  {applicationRows.map((application) => {
                    const decided =
                      application.status === "accepted" ||
                      application.status === "rejected" ||
                      application.status === "withdrawn";
                    const notes = reviewNotes[application.id] ?? "";
                    return (
                      <li key={application.id} className="space-y-2 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {nameById.get(application.applicant_id) ?? "Club member"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Applied for {roleNameById.get(application.role_id) ?? "a position"}
                              {application.submitted_at
                                ? ` · ${new Date(application.submitted_at).toLocaleDateString()}`
                                : ""}
                            </p>
                          </div>
                          <Badge variant={decided ? "outline" : "default"}>
                            {APPLICATION_STATUS_LABELS[application.status]}
                          </Badge>
                        </div>

                        {application.review_notes ? (
                          <p className="text-xs text-muted-foreground">
                            Reviewer note: {application.review_notes}
                          </p>
                        ) : null}

                        {mayManage && !decided ? (
                          <>
                            <div className="space-y-1.5">
                              <Label htmlFor={`review-note-${application.id}`} className="text-xs">
                                Note for the applicant (optional)
                              </Label>
                              <Textarea
                                id={`review-note-${application.id}`}
                                rows={2}
                                value={notes}
                                onChange={(event) =>
                                  setReviewNotes((current) => ({
                                    ...current,
                                    [application.id]: event.target.value,
                                  }))
                                }
                                placeholder="Why you went this way"
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                disabled={review.isPending}
                                onClick={() =>
                                  review.mutate({
                                    applicationId: application.id,
                                    accept: true,
                                    notes,
                                  })
                                }
                              >
                                {review.isPending ? (
                                  <SkeletonSpinner />
                                ) : (
                                  <Check className="size-4" />
                                )}
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={review.isPending}
                                onClick={() =>
                                  review.mutate({
                                    applicationId: application.id,
                                    accept: false,
                                    notes,
                                  })
                                }
                              >
                                <X className="size-4" />
                                Reject
                              </Button>
                            </div>
                          </>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}

              {review.error ? (
                <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {review.error.message}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function requirementText(kind: RequirementKind, threshold: number): string {
  const unit: Record<RequirementKind, string> = {
    min_days_in_club: "days",
    min_attendance_rate: "% of meetings",
    min_events_attended: "meetings",
    min_volunteer_hours: "volunteer hours",
  };
  return `${REQUIREMENT_LABELS[kind]}: ${threshold} ${unit[kind]}`;
}

/** A short, plain-language echo of the finalized metrics behind eligibility. */
function metricsText(metrics: Json): string {
  const map = jsonMap(metrics);
  const attendance = numberOf(map["attendance_rate"]);
  const days = numberOf(map["days_in_club"]);
  const hours = numberOf(map["volunteer_hours"]);
  const parts: string[] = [];
  if (attendance !== null) parts.push(`${attendance}% of meetings attended (confirmed)`);
  if (days !== null) parts.push(`${days} days in the club`);
  if (hours !== null) parts.push(`${hours} volunteer hours`);
  return parts.length > 0 ? parts.join(" · ") : "Requirements met";
}

function numberOf(value: Json | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function jsonMap(data: Json): Record<string, Json | undefined> {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
  return data as Record<string, Json | undefined>;
}

/**
 * The hand-maintained Database type carries no relationship metadata, so
 * supabase-js cannot infer a payload from an already-typed object. Casting once
 * here keeps the call site readable; Postgres and RLS remain the enforcement
 * point (PRD 41).
 */
function insertRole(row: TablesInsert<"leadership_roles">) {
  return getSupabaseClient()
    .from("leadership_roles")
    .insert(row as unknown as never[]);
}
