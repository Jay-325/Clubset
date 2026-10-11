import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Clock, MapPin } from "lucide-react";

import { AppShell, PageHeader, RequireAuth } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRsvp, useUpcomingEvents } from "@/lib/queries";
import { EVENT_KINDS, EVENT_PRIORITY_LABELS } from "@/lib/domain";
import type { EventKind, UpcomingEventResult } from "@/lib/types/database";

/**
 * PRD 13: one calendar that combines every event from the clubs the student
 * has joined -- no per-club subscription, no manual syncing.
 *
 * PRD 15/53.15: overlaps are FLAGGED, never resolved automatically, and an
 * RSVP is always the student's explicit choice. It is disabled when the club
 * leader turned RSVPs off for the event (PRD 19).
 */
export const Route = createFileRoute("/calendar")({
  component: CalendarPage,
});

const KIND_LABELS: Record<EventKind, string> = Object.fromEntries(
  EVENT_KINDS.map((kind) => [kind.value, kind.label]),
) as Record<EventKind, string>;

/** Local-timezone day key so events group the way the student experiences them. */
function dayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

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
  // PRD 13: 100 events is enough to cover a full term of weekly meetings.
  const upcoming = useUpcomingEvents(100);
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(undefined);

  const groups = useMemo(() => {
    const byDay = new Map<string, { date: Date; events: UpcomingEventResult[] }>();
    for (const event of upcoming.data ?? []) {
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
  }, [upcoming.data]);

  const visibleGroups = selectedDay
    ? groups.filter((group) => dayKey(group.date) === dayKey(selectedDay))
    : groups;

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Every event from your clubs, in one place. Overlapping events are flagged so you can choose."
        actions={
          selectedDay ? (
            <Button variant="outline" size="sm" onClick={() => setSelectedDay(undefined)}>
              Show all days
            </Button>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {/* ---- Agenda (the primary view) ---- */}
        <div>
          {selectedDay ? (
            <h2 className="mb-3 text-lg font-semibold">
              {selectedDay.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </h2>
          ) : (
            <h2 className="mb-3 text-lg font-semibold">Agenda</h2>
          )}

          {upcoming.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : visibleGroups.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                {selectedDay
                  ? "Nothing scheduled on this day."
                  : "No upcoming events. Join a club and its events will appear here automatically."}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {visibleGroups.map((group) => (
                <DayGroup key={dayKey(group.date)} date={group.date} events={group.events} />
              ))}
            </div>
          )}
        </div>

        {/* ---- Month picker: narrows the agenda to a single day ---- */}
        <aside className="order-first lg:order-last">
          <Card>
            <CardContent className="p-3">
              <Calendar
                mode="single"
                selected={selectedDay}
                onSelect={setSelectedDay}
                modifiers={{
                  hasEvents: groups.map((group) => group.date),
                  hasConflict: groups
                    .filter((group) => group.events.some((event) => event.conflict_count > 0))
                    .map((group) => group.date),
                }}
                modifiersClassNames={{
                  hasEvents: "font-semibold underline decoration-primary/60 underline-offset-4",
                  hasConflict: "bg-amber-500/15",
                }}
                className="w-full"
              />
              <p className="mt-2 px-1 text-xs text-muted-foreground">
                Underlined days have events. Amber days have a scheduling conflict.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}

function DayGroup({ date, events }: { date: Date; events: UpcomingEventResult[] }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <CalendarDays className="size-4" />
        {date.toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
      </h3>
      <div className="space-y-2">
        {events.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </div>
    </section>
  );
}

function EventRow({ event }: { event: UpcomingEventResult }) {
  const rsvp = useRsvp();

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm text-muted-foreground">{event.club_name}</p>
            <p className="font-medium">{event.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" />
                {new Date(event.starts_at).toLocaleTimeString(undefined, {
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
            <Badge variant="outline">{KIND_LABELS[event.kind]}</Badge>
            {event.priority === "high" ? (
              <Badge>{EVENT_PRIORITY_LABELS.high}</Badge>
            ) : (
              <span className="text-xs text-muted-foreground">
                {EVENT_PRIORITY_LABELS[event.priority]}
              </span>
            )}
          </div>
        </div>

        {/* PRD 15: the overlap is shown, never auto-resolved. */}
        {event.conflict_count > 0 ? (
          <p className="mt-3 flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            Overlaps with {event.conflict_count} other event
            {event.conflict_count === 1 ? "" : "s"}. You decide which one to attend.
          </p>
        ) : null}

        {/* PRD 15: Joinin never RSVPs on the student's behalf -- the buttons
            are the only thing that writes an attendance expectation. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={event.my_rsvp === "going" ? "default" : "outline"}
            disabled={!event.rsvp_enabled || rsvp.isPending}
            onClick={() => rsvp.mutate({ eventId: event.id, going: true })}
          >
            Going
          </Button>
          <Button
            size="sm"
            variant={event.my_rsvp === "not_going" ? "secondary" : "outline"}
            disabled={!event.rsvp_enabled || rsvp.isPending}
            onClick={() => rsvp.mutate({ eventId: event.id, going: false })}
          >
            Not going
          </Button>
          {!event.rsvp_enabled ? (
            <span className="text-xs text-muted-foreground">RSVPs are off for this event.</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
