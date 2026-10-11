import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import { AlertTriangle, CalendarDays, Clock, MapPin } from "lucide-react";

import { AppShell, PageHeader, RequireAuth } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EVENT_KIND_LABELS, EVENT_PRIORITY_LABELS } from "@/lib/domain";
import { useClubContext } from "@/lib/hooks/use-club";
import { useClubEvents } from "@/lib/queries";
import type { EventRow as ClubEventRow } from "@/lib/types/database";

/**
 * PRD 13: the club's own calendar. The app-wide calendar combines every club
 * the student joined; this view stays inside one club so a leader can plan
 * around their own schedule.
 *
 * Overlaps are only flagged, never resolved -- the leader decides (PRD 15).
 */
export const Route = createFileRoute("/clubs/$clubId/calendar")({
  component: CalendarPage,
});

function CalendarPage() {
  return (
    <RequireAuth>
      <AppShell>
        <CalendarContent />
      </AppShell>
    </RequireAuth>
  );
}

function CalendarContent() {
  const { clubId } = useParams({ from: "/clubs/$clubId/calendar" });
  const context = useClubContext(clubId);
  const events = useClubEvents(clubId);

  const upcoming = useMemo(
    () =>
      (events.data ?? [])
        .filter((event) => new Date(event.starts_at).getTime() >= Date.now())
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    [events.data],
  );

  // PRD 15: two half-open intervals overlap when each starts before the other
  // ends. The badge lands on the later-indexed event of the pair so a clash is
  // flagged once, not twice.
  const overlappingIds = useMemo(() => {
    const flagged = new Set<string>();
    for (let i = 0; i < upcoming.length; i += 1) {
      for (let j = i + 1; j < upcoming.length; j += 1) {
        const first = upcoming.at(i);
        const second = upcoming.at(j);
        if (!first || !second) continue;
        if (overlaps(first, second)) flagged.add(second.id);
      }
    }
    return flagged;
  }, [upcoming]);

  const groups = useMemo(() => {
    const byDay = new Map<string, { date: Date; events: ClubEventRow[] }>();
    for (const event of upcoming) {
      const startsAt = new Date(event.starts_at);
      const key = dayKey(startsAt);
      const existing = byDay.get(key);
      if (existing) {
        existing.events.push(event);
      } else {
        byDay.set(key, { date: startsAt, events: [event] });
      }
    }
    return [...byDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [upcoming]);

  return (
    <>
      <PageHeader
        title={`${context.data?.club.name ?? "Club"} calendar`}
        description="Everything this club has planned, day by day."
      />

      {events.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No upcoming events. Anything a leader schedules will show up here automatically.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={dayKey(group.date)}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <CalendarDays className="size-4" />
                {group.date.toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </h2>
              <div className="space-y-2">
                {group.events.map((event) => (
                  <EventRow key={event.id} event={event} overlaps={overlappingIds.has(event.id)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function overlaps(first: ClubEventRow, second: ClubEventRow): boolean {
  const aStart = new Date(first.starts_at).getTime();
  const aEnd = new Date(first.ends_at).getTime();
  const bStart = new Date(second.starts_at).getTime();
  const bEnd = new Date(second.ends_at).getTime();
  return aStart < bEnd && bStart < aEnd;
}

function EventRow({ event, overlaps: hasOverlap }: { event: ClubEventRow; overlaps: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">{event.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" />
                {new Date(event.starts_at).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
                {" – "}
                {new Date(event.ends_at).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              {event.location ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" />
                  {event.location}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Badge variant="outline">{EVENT_KIND_LABELS[event.kind]}</Badge>
            {event.priority === "high" ? (
              <Badge>{EVENT_PRIORITY_LABELS.high}</Badge>
            ) : (
              <span className="text-xs text-muted-foreground">
                {EVENT_PRIORITY_LABELS[event.priority]}
              </span>
            )}
          </div>
        </div>

        {hasOverlap ? (
          <p className="mt-3 flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            Overlaps another event. One of them needs to move -- Joinin will not pick for you.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Local-timezone day key so events group the way the leader experiences them. */
function dayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
