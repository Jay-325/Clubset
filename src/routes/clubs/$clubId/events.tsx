import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AlertTriangle, Clock, MapPin, Plus } from "lucide-react";

import { AppShell, PageHeader, RequireAuth } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { can } from "@/lib/auth/permissions";
import { EVENT_KINDS, EVENT_KIND_LABELS, EVENT_PRIORITY_LABELS } from "@/lib/domain";
import { useClubContext } from "@/lib/hooks/use-club";
import { useClubEvents, useCreateEvent } from "@/lib/queries";
import type { EventKind, EventPriority, EventRow as ClubEventRow } from "@/lib/types/database";

/**
 * PRD 11/14/19: meetings and events for one club.
 *
 * The club's own default priority seeds the form (PRD 14) and a leader may
 * override it per event; RSVP is on by default and can be switched off when
 * attendance planning is not needed (PRD 19). Neither choice is enforced by
 * this page -- the insert is re-checked in Postgres (PRD 41).
 */
export const Route = createFileRoute("/clubs/$clubId/events")({
  component: EventsPage,
});

function EventsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <EventsContent />
      </AppShell>
    </RequireAuth>
  );
}

function EventsContent() {
  const { clubId } = useParams({ from: "/clubs/$clubId/events" });
  const context = useClubContext(clubId);
  const events = useClubEvents(clubId);

  const mayManage =
    context.data !== null &&
    context.data !== undefined &&
    can(context.data.permissions, "manage_events");

  const allEvents = events.data ?? [];
  const now = Date.now();
  const upcoming = allEvents.filter((event) => new Date(event.starts_at).getTime() >= now);
  const past = allEvents
    .filter((event) => new Date(event.starts_at).getTime() < now)
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());

  return (
    <>
      <PageHeader
        title={`${context.data?.club.name ?? "Club"} events`}
        description="Meetings, deadlines and everything else this club has planned."
      />

      <div className="space-y-6">
        {mayManage ? (
          <CreateEventForm
            clubId={clubId}
            // PRD 19: the club-wide default seeds the RSVP switch; the leader
            // can still turn RSVPs off for a single event.
            defaultRsvp={context.data?.club.rsvp_enabled_by_default ?? true}
          />
        ) : null}

        <EventSection
          title="Upcoming"
          empty="Nothing scheduled yet. Leaders can add the first meeting."
          events={upcoming}
          isLoading={events.isLoading}
        />

        <EventSection title="Past" empty="No past events yet." events={past} />
      </div>
    </>
  );
}

function CreateEventForm({ clubId, defaultRsvp }: { clubId: string; defaultRsvp: boolean }) {
  const createEvent = useCreateEvent();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<EventKind>("meeting");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [priority, setPriority] = useState<EventPriority>("normal");
  const [rsvpEnabled, setRsvpEnabled] = useState(defaultRsvp);
  const [rsvpTouched, setRsvpTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // The club default arrives after the first render; adopt it until the leader
  // touches the switch, so the form still starts from the club's setting.
  useEffect(() => {
    if (!rsvpTouched) setRsvpEnabled(defaultRsvp);
  }, [defaultRsvp, rsvpTouched]);

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
        clubId,
        title: title.trim(),
        description: description.trim(),
        kind,
        location: location.trim(),
        // datetime-local gives local wall-clock time; the column is timestamptz,
        // so the browser resolves the offset before we store it.
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
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Create Event</CardTitle>
        <CardDescription>
          {/* PRD 14: a club's default priority applies to the meetings it
              creates, and a leader can override it for an individual event. */}
          New meetings start at the club&apos;s default priority. You can change the priority for
          this one event if it needs more attention.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
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
              <Select
                value={priority}
                onValueChange={(value) => setPriority(value as EventPriority)}
              >
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
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertTriangle className="size-4" />
              {formError}
            </p>
          ) : null}
          {createEvent.isError ? (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertTriangle className="size-4" />
              {createEvent.error.message}
            </p>
          ) : null}

          <Button type="submit" disabled={createEvent.isPending}>
            {createEvent.isPending ? (
              <SkeletonSpinner />
            ) : (
              <Plus className="size-4" />
            )}
            Create Event
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function EventSection({
  title,
  events,
  empty,
  isLoading = false,
}: {
  title: string;
  events: ClubEventRow[];
  empty: string;
  isLoading?: boolean;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {isLoading ? (
        <Skeleton className="h-28 w-full" />
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">{empty}</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </section>
  );
}

function EventRow({ event }: { event: ClubEventRow }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">{event.title}</p>
            {event.description ? (
              <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
            ) : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" />
                {formatRange(event.starts_at, event.ends_at)}
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
            {!event.rsvp_enabled ? (
              <span className="text-xs text-muted-foreground">No RSVPs</span>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
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
