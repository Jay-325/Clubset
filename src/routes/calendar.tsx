import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, CalendarDays, Clock, MapPin, Plus, X } from "lucide-react";

import { AppShell, PageHeader, RequireAuth } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton, SkeletonSpinner } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { FadeIn } from "@/components/ui/motion";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { can } from "@/lib/auth/permissions";
import { staggerStyle } from "@/lib/motion";
import { EVENT_KINDS, EVENT_KIND_LABELS, EVENT_PRIORITY_LABELS } from "@/lib/domain";
import { useCreateEvent, useUpcomingEvents, useRsvp } from "@/lib/queries";
import type {
  EventKind,
  EventPriority,
  EventRow as ClubEventRow,
  UpcomingEventResult,
} from "@/lib/types/database";
import { toast } from "sonner";

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
  const [manageableClubs, setManageableClubs] = useState<Array<{ id: string; name: string }>>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);

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
        description="Every event from your clubs, in one place."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedDay(undefined)}
              disabled={!selectedDay}
            >
              Show all days
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowCreateForm(true)}
              disabled={!manageableClubs.length}
            >
              <Plus className="size-4 mr-2" />
              Create Event
            </Button>
          </>
        }
      />

      {/* Create Event Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowCreateForm(false)}
          />
          <div className="relative z-50 w-full max-w-2xl bg-white rounded-2xl border border-slate-200 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-ink">Create Event</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowCreateForm(false)}>
                <X className="size-5" />
              </Button>
            </div>
            <CreateEventForm
              clubs={manageableClubs}
              onClose={() => setShowCreateForm(false)}
              onComplete={() => setShowCreateForm(false)}
            />
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ---- Agenda (the primary view) ---- */}
        <div className="space-y-6">
          {selectedDay ? (
            <h2 className="text-lg font-semibold">
              {selectedDay.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </h2>
          ) : (
            <h2 className="text-lg font-semibold">Agenda</h2>
          )}

          {upcoming.isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : visibleGroups.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {selectedDay
                    ? "Nothing scheduled on this day."
                    : "No upcoming events. Join a club and its events will appear here automatically."}
                </p>
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

        {/* ---- Month picker ---- */}
        <aside className="order-first lg:order-last">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">January 2026</h3>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8 p-0">
                    <span className="sr-only">Previous month</span>
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8 p-0">
                    <span className="sr-only">Next month</span>
                  </Button>
                </div>
              </div>
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
              <p className="mt-3 px-1 text-xs text-muted-foreground text-center">
                Underlined days have events. Amber days have a scheduling conflict.
              </p>
            </CardContent>
          </Card>

          {/* Quick stats for the selected day */}
          {selectedDay && visibleGroups.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Today's summary</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Events today</span>
                    <span className="text-sm font-semibold">
                      {visibleGroups[0]?.events.length ?? 0}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
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
        {events.map((event, index) => (
          <EventRow
            key={event.id}
            event={event}
            className="animate-in fade-in"
            style={staggerStyle(index)}
          />
        ))}
      </div>
    </section>
  );
}

function EventRow({
  event,
  className,
  style,
}: {
  event: UpcomingEventResult;
  className?: string;
  style?: React.CSSProperties;
}) {
  const rsvp = useRsvp();

  return (
    <Card className={cn(className)} style={style}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm text-muted-foreground">{event.club_name}</p>
            <p className="font-medium">{event.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
            {!event.rsvp_enabled ? (
              <span className="text-xs text-muted-foreground">No RSVPs</span>
            ) : null}
          </div>
        </div>

        {/* PRD 15: the overlap is shown, never auto-resolved. */}
        {event.conflict_count > 0 ? (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            Overlaps with {event.conflict_count} other event
            {event.conflict_count === 1 ? "" : "s"}. You decide which one to attend.
          </p>
        ) : null}

        {/* PRD 15: Clubset never RSVPs on the student's behalf -- the buttons
            are the only thing that writes an attendance expectation. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={event.my_rsvp === "going" ? "default" : "outline"}
            disabled={!event.rsvp_enabled || rsvp.isPending}
            onClick={async () => {
              try {
                await rsvp.mutateAsync({ eventId: event.id, going: true });
                toast("RSVP'd going");
              } catch {
                // Error handled by the mutation error state.
              }
            }}
          >
            Going
          </Button>
          <Button
            size="sm"
            variant={event.my_rsvp === "not_going" ? "secondary" : "outline"}
            disabled={!event.rsvp_enabled || rsvp.isPending}
            onClick={async () => {
              try {
                await rsvp.mutateAsync({ eventId: event.id, going: false });
                toast("RSVP'd not going");
              } catch {
                // Error handled by the mutation error state.
              }
            }}
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

/**
 * Create Event Form - reusable form for creating a new event in a club.
 */
function CreateEventForm({
  clubs,
  onClose,
  onComplete,
}: {
  clubs: Array<{ id: string; name: string }>;
  onClose: () => void;
  onComplete: () => void;
}) {
  const createEvent = useCreateEvent();

  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<EventKind>("meeting");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [priority, setPriority] = useState<EventPriority>("normal");
  const [rsvpEnabled, setRsvpEnabled] = useState(true);
  const [rsvpTouched, setRsvpTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (title.trim().length === 0) {
      setFormError("Give the event a title so members know what it is.");
      return;
    }
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setFormError("Add both a start and an end time.");
      return;
    }
    if (end.getTime() <= start.getTime()) {
      setFormError("The end time has to be after the start time.");
      return;
    }

    setFormError(null);
    createEvent.mutate(
      {
        clubId: selectedClubId!,
        title: title.trim(),
        description: description.trim(),
        kind,
        location: location.trim(),
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        priority,
        rsvpEnabled,
      },
      {
        onSuccess: () => {
          setTitle("");
          setDescription("");
          setLocation("");
          setStartsAt("");
          setEndsAt("");
          setFormError(null);
          toast("Event created");
          onComplete();
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="event-club">Club</Label>
        <Select value={selectedClubId ?? ""} onValueChange={(value) => setSelectedClubId(value)}>
          <SelectTrigger>
            <SelectValue placeholder="Select a club" />
          </SelectTrigger>
          <SelectContent>
            {clubs.map((club) => (
              <SelectItem key={club.id} value={club.id}>
                {club.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="event-title">Title</Label>
        <Input
          id="event-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Weekly meeting"
          maxLength={200}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="event-description">Description</Label>
        <Textarea
          id="event-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What are we doing, and what should members bring?"
          rows={3}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="event-kind">Type</Label>
          <Select value={kind} onValueChange={(value) => setKind(value as EventKind)}>
            <SelectTrigger id="event-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVENT_KINDS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="event-priority">Priority</Label>
          <Select value={priority} onValueChange={(value) => setPriority(value as EventPriority)}>
            <SelectTrigger id="event-priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(EVENT_PRIORITY_LABELS) as EventPriority[]).map((option) => (
                <SelectItem key={option} value={option}>
                  {EVENT_PRIORITY_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="event-location">Location</Label>
        <Input
          id="event-location"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          placeholder="Room 204"
          maxLength={200}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="event-starts">Starts</Label>
          <Input
            id="event-starts"
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="event-ends">Ends</Label>
          <Input
            id="event-ends"
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            required
          />
        </div>
      </div>

      {/* PRD 19: RSVP off means no attendance expectation is recorded. */}
      <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
        <div className="min-w-0">
          <Label htmlFor="event-rsvp">Ask members to RSVP</Label>
          <p className="text-xs text-muted-foreground">
            Turn this off when attendance planning is not needed for this event.
          </p>
        </div>
        <Switch
          id="event-rsvp"
          checked={rsvpEnabled}
          onCheckedChange={(checked) => {
            setRsvpTouched(true);
            setRsvpEnabled(checked);
          }}
        />
      </div>

      {formError ? (
        <p className="form-message animate-in fade-in flex items-center gap-1.5 text-sm text-destructive duration-150">
          <AlertTriangle className="size-4" />
          {formError}
        </p>
      ) : null}
      {createEvent.isError ? (
        <p className="form-message animate-in fade-in flex items-center gap-1.5 text-sm text-destructive duration-150">
          <AlertTriangle className="size-4" />
          {createEvent.error.message}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => {
            onClose();
          }}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={createEvent.isPending || !selectedClubId}>
          {createEvent.isPending ? <SkeletonSpinner /> : <Plus className="size-4" />}
          Create Event
        </Button>
      </div>
    </form>
  );
}

function formatRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const day = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = (value: Date) =>
    value.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time(start)} – ${time(end)}`;
}
