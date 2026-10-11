import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, Undo2, UserX } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell, PageHeader, RequireAuth } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton, SkeletonSpinner } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useClubContext } from "@/lib/hooks/use-club";
import { can } from "@/lib/auth/permissions";
import { useAttendanceForEvent, useFinalizeAttendance, useVetoRsvp } from "@/lib/queries";
import { ATTENDANCE_STATUS_HINTS, ATTENDANCE_STATUS_LABELS } from "@/lib/domain";
import type { AttendanceRow, EventRow, ProfileRow } from "@/lib/types/database";

/**
 * PRD 16-18: the RSVP -> expected attendance -> correction -> finalization
 * loop.
 *
 * The list is generated from RSVPs by a database trigger (PRD 16), so a leader
 * never types in who came. A veto removes only the RSVP-derived credit
 * (PRD 17) and is never a punishment (PRD 53.13).
 */
export const Route = createFileRoute("/clubs/$clubId/attendance")({
  component: AttendancePage,
});

function AttendancePage() {
  return (
    <RequireAuth>
      <AppShell>
        <AttendanceContent />
      </AppShell>
    </RequireAuth>
  );
}

function AttendanceContent() {
  const { clubId } = useParams({ from: "/clubs/$clubId/attendance" });
  const context = useClubContext(clubId);

  const events = useQuery({
    queryKey: ["club", clubId, "events"],
    queryFn: async (): Promise<EventRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("club_id", clubId)
        .order("starts_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(clubId),
  });

  const permissions = context.data?.permissions ?? [];
  const isOverseer =
    (context.data?.isLinkedAdministrator ?? false) || (context.data?.isAdministrator ?? false);

  // PRD 45: members see only their own attendance, never the club roster.
  if (!can(permissions, "manage_attendance") && !isOverseer) {
    return <MemberOwnAttendance clubId={clubId} />;
  }

  if (context.isLoading || events.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  const eventList = events.data ?? [];

  if (eventList.length === 0) {
    return (
      <>
        <PageHeader title="Attendance" description="Pick a meeting to review who came." />
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No events yet. Create an event first, then RSVPs build the attendance list
            automatically.
          </CardContent>
        </Card>
      </>
    );
  }

  return <AttendanceReviewer clubId={clubId} events={eventList} />;
}

function AttendanceReviewer({ clubId, events }: { clubId: string; events: EventRow[] }) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? events[0];

  if (!selectedEvent) {
    return null;
  }

  return (
    <>
      <PageHeader
        title="Attendance"
        description="RSVPs become expected attendance automatically. Review the list after the meeting and correct anything that does not match reality."
      />

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Meetings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {events.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => setSelectedEventId(event.id)}
                className={`w-full rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent ${
                  event.id === selectedEvent.id ? "bg-accent font-medium" : ""
                }`}
              >
                <span className="block truncate">{event.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {new Date(event.starts_at).toLocaleDateString()}
                  {event.attendance_finalized ? " · finalized" : ""}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>

        <AttendanceReview key={selectedEvent.id} event={selectedEvent} clubId={clubId} />
      </div>
    </>
  );
}

function AttendanceReview({ event, clubId }: { event: EventRow; clubId: string }) {
  const roster = useAttendanceForEvent(event.id);
  const veto = useVetoRsvp();
  const finalize = useFinalizeAttendance();
  const queryClient = useQueryClient();

  const [vetoTarget, setVetoTarget] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState("");

  const undo = useMutation({
    mutationFn: async (attendanceId: string) => {
      const supabase = getSupabaseClient();
      // Restores the record to "expected, not yet reviewed". The student's
      // original RSVP is untouched, so undoing a veto loses nothing.
      const { error } = await supabase.rpc("correct_attendance", {
        target_attendance: attendanceId,
        new_status: "rsvp_pending",
        correction_reason: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attendance", event.id] });
    },
  });

  const addManually = useMutation({
    mutationFn: async (studentId: string) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc("add_manual_attendance", {
        target_event: event.id,
        student_id: studentId,
        present: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attendance", event.id] });
    },
  });

  const rows = useMemo(() => roster.data ?? [], [roster.data]);
  const summary = useMemo(
    () => ({
      total: rows.length,
      attended: rows.filter((row) => row.status === "attended").length,
      didNotAttend: rows.filter((row) => row.status === "did_not_attend").length,
      pending: rows.filter((row) => row.status === "rsvp_pending").length,
    }),
    [rows],
  );

  const handleVeto = async () => {
    if (!vetoTarget) return;
    await veto.mutateAsync({ attendanceId: vetoTarget.id, reason: reason || undefined });
    setVetoTarget(null);
    setReason("");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{event.title}</CardTitle>
              <CardDescription>
                {new Date(event.starts_at).toLocaleString(undefined, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
                {event.location ? ` · ${event.location}` : ""}
              </CardDescription>
            </div>
            {event.attendance_finalized ? (
              <Badge variant="secondary">Finalized</Badge>
            ) : (
              <Badge>In review</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="On the list" value={summary.total} />
            <Stat label="Attended" value={summary.attended} tone="text-emerald-600" />
            <Stat label="Did not attend" value={summary.didNotAttend} tone="text-red-600" />
            <Stat label="Awaiting review" value={summary.pending} />
          </div>

          {!event.attendance_finalized ? (
            <Button
              className="mt-4"
              onClick={() => finalize.mutate(event.id)}
              disabled={finalize.isPending}
            >
              {finalize.isPending ? (
                <SkeletonSpinner />
              ) : (
                <Check className="size-4" />
              )}
              Confirm and finalize attendance
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Expected attendance</CardTitle>
          <CardDescription>
            Built from RSVPs. Use Veto when a student RSVPed but did not show up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {roster.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody has RSVPed for this event yet.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((row) => {
                const name = row.profile?.full_name ?? "Unknown student";
                return (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{name}</p>
                      <p className="text-xs text-muted-foreground">
                        {ATTENDANCE_STATUS_LABELS[row.status]}
                        {row.source === "rsvp" ? " · from RSVP" : " · added by a leader"}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {row.status === "did_not_attend" && !event.attendance_finalized ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => undo.mutate(row.id)}
                          disabled={undo.isPending}
                        >
                          <Undo2 className="size-4" />
                          Undo
                        </Button>
                      ) : null}

                      {row.status === "rsvp_pending" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setVetoTarget({ id: row.id, name })}
                        >
                          <UserX className="size-4" />
                          Veto RSVP
                        </Button>
                      ) : null}

                      {row.status === "attended" ? (
                        <Badge variant="secondary" className="gap-1">
                          <Check className="size-3" />
                          Attended
                        </Badge>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <AddManually
            onAdd={(studentId) => addManually.mutate(studentId)}
            pending={addManually.isPending}
          />
          {addManually.error ? (
            <p className="mt-2 text-sm text-destructive">{addManually.error.message}</p>
          ) : null}
        </CardContent>
      </Card>

      {/* PRD 17: the dialog states plainly that this is not a punishment. */}
      <Dialog open={vetoTarget !== null} onOpenChange={(open) => !open && setVetoTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Veto this RSVP for attendance?</DialogTitle>
            <DialogDescription>
              {vetoTarget?.name} will be recorded as not attending. This only changes the attendance
              record — it does not stop them from RSVeping to future events.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="veto-reason">Note (optional)</Label>
            <Input
              id="veto-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Did not attend"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVetoTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleVeto} disabled={veto.isPending}>
              {veto.isPending ? (
                <SkeletonSpinner />
              ) : (
                <UserX className="size-4" />
              )}
              Veto RSVP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

/**
 * PRD 18: a leader may add a student who attended without RSVPing, if the
 * club permits it. This is the only place a name is typed in.
 */
function AddManually({ onAdd, pending }: { onAdd: (studentId: string) => void; pending: boolean }) {
  const [term, setTerm] = useState("");

  const results = useQuery({
    queryKey: ["member-search", term],
    queryFn: async (): Promise<ProfileRow[]> => {
      if (term.trim().length < 2) return [];
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .ilike("full_name", `%${term.trim()}%`)
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
    enabled: term.trim().length >= 2,
  });

  return (
    <div className="mt-4 border-t pt-4">
      <Label htmlFor="manual-add" className="text-xs text-muted-foreground">
        Attended without RSVPing?
      </Label>
      <Input
        id="manual-add"
        className="mt-1"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Search a student"
      />
      {(results.data ?? []).length > 0 ? (
        <ul className="mt-2 divide-y rounded-md border">
          {(results.data ?? []).map((profile) => (
            <li key={profile.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onAdd(profile.id);
                  setTerm("");
                }}
              >
                {profile.full_name}
                {pending ? <SkeletonSpinner /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">{ATTENDANCE_STATUS_HINTS.rsvp_pending}</p>
    </div>
  );
}

/** PRD 45: a member sees only their own finalized attendance. */
function MemberOwnAttendance({ clubId }: { clubId: string }) {
  const stats = useQuery({
    queryKey: ["my-attendance", clubId],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return null;
      const { data, error } = await supabase.rpc("attendance_stats", {
        target_club: clubId,
        student_id: userData.user.id,
      });
      if (error) throw error;
      return data as { attended: number; missed: number; attendance_rate: number | null } | null;
    },
  });

  return (
    <>
      <PageHeader
        title="My attendance"
        description="These numbers come from finalized attendance records, not RSVPs."
      />
      <Card>
        <CardContent className="pt-6">
          {stats.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !stats.data ? (
            <p className="text-sm text-muted-foreground">No finalized attendance yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Attended" value={stats.data.attended} tone="text-emerald-600" />
              <Stat label="Missed" value={stats.data.missed} tone="text-red-600" />
              <Stat
                label="Rate"
                value={
                  stats.data.attendance_rate === null
                    ? 0
                    : Math.round(stats.data.attendance_rate * 100)
                }
              />
            </div>
          )}
          <p className="mt-4 text-sm text-muted-foreground">
            <Link to="/clubs/$clubId" params={{ clubId }}>
              Back to the club
            </Link>
          </p>
        </CardContent>
      </Card>
    </>
  );
}
