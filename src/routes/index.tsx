import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, MapPin, Search, Sparkles, Users } from "lucide-react";

import { AppShell, PageHeader, RequireAuth } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { FadeIn } from "@/components/ui/motion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth/context";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useClubSearch, useRecommendedClubs, useUpcomingEvents } from "@/lib/queries";
import { staggerStyle } from "@/lib/motion";
import {
  CLUB_TYPE_LABELS,
  COMMITMENT_LABELS,
  EVENT_KIND_LABELS,
  EVENT_PRIORITY_LABELS,
  PRESET_INTERESTS,
} from "@/lib/domain";

/**
 * PRD 20: the Main page is the discovery dashboard -- upcoming meetings,
 * important events, club updates, and recommendations, plus search and filters.
 */
export const Route = createFileRoute("/")({
  component: MainPage,
});

const ALL = "__all__";

function MainPage() {
  return (
    <RequireAuth>
      <AppShell>
        <MainContent />
      </AppShell>
    </RequireAuth>
  );
}

function MainContent() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [searchInput, setSearchInput] = useState("");
  const [type, setType] = useState<string>(ALL);
  const [field, setField] = useState<string>(ALL);
  const [commitment, setCommitment] = useState<string>(ALL);

  // The input updates immediately; the query only follows once typing pauses.
  const search = useDebouncedValue(searchInput);

  const clubSearch = useClubSearch({
    search: search || undefined,
    type: type === ALL ? null : (type as never),
    field: field === ALL ? null : field,
    commitment: commitment === ALL ? null : (commitment as never),
  });

  const recommendations = useRecommendedClubs();
  const upcoming = useUpcomingEvents(5);

  // PRD 21: recommendations are only shown separately when there is a profile
  // to base them on.
  const showRecommendations =
    !searchInput &&
    type === ALL &&
    field === ALL &&
    commitment === ALL &&
    (profile?.interests.length ?? 0) > 0;

  // Both lists are filtered on every render of this page, including while the
  // student is typing, so the join is kept off the keystroke path.
  const recommended = useMemo(() => {
    const discovered = new Set((clubSearch.data ?? []).map((result) => result.id));
    return (recommendations.data ?? []).filter((club) => !discovered.has(club.id));
  }, [recommendations.data, clubSearch.data]);

  return (
    <>
      <PageHeader
        title={`Hi, ${profile?.full_name?.split(" ")[0] ?? "there"}`}
        description="Find clubs, see what is coming up, and keep up with your clubs."
      />

      {/* ---- Welcome stats row ---- */}
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Clubs this week" value={(clubSearch.data ?? []).length} />
        <StatCard label="Upcoming events" value={(upcoming.data ?? []).length} />
        <StatCard label="My clubs" value="-" />
        <StatCard label="Events today" value="0" />
      </div>

      {/* ---- Main content: calendar + events side by side ---- */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left: Upcoming events */}
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Coming up</h2>
            <p className="text-sm text-muted-foreground">Across all your joined clubs.</p>
          </section>

          {upcoming.isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (upcoming.data ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Nothing on your calendar yet. Join a club and its events will show up here
                  automatically.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {(upcoming.data ?? []).map((event, index) => (
                <EventCard
                  key={event.id}
                  event={event}
                  className="animate-in fade-in"
                  style={staggerStyle(index)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: Calendar preview + recommendations */}
        <div className="space-y-6">
          {/* Mini calendar */}
          <Card className="h-[420px]">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">January 2026</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid w-full grid-cols-7 gap-1 text-center text-xs">
                <div className="font-medium text-muted-foreground">Su</div>
                <div className="font-medium text-muted-foreground">Mo</div>
                <div className="font-medium text-muted-foreground">Tu</div>
                <div className="font-medium text-muted-foreground">We</div>
                <div className="font-medium text-muted-foreground">Th</div>
                <div className="font-medium text-muted-foreground">Fr</div>
                <div className="font-medium text-muted-foreground">Sa</div>
              </div>
              <div className="grid w-full grid-cols-7 gap-1 mt-2">
                {[...Array(31)].map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-lg flex items-center justify-center text-sm text-muted-foreground hover:bg-accent/50 cursor-pointer transition-colors"
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recommendations */}
          {showRecommendations && recommended.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                Recommended for you
              </h2>
              <p className="text-sm text-muted-foreground">
                Based on your interests and time availability.
              </p>
              <div className="space-y-3">
                {recommended.slice(0, 3).map((club, index) => (
                  <ClubCard
                    key={club.id}
                    club={club}
                    showReasons
                    className="animate-in fade-in"
                    style={staggerStyle(index)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {/* Start a club button */}
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-sm text-muted-foreground mb-4">Ready to start something new?</p>
              <Button asChild className="w-full">
                <Link to="/clubs/new">Start a new club</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ---- Search & filters (full width below) ---- */}
      <section className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold">Find clubs</h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search clubs"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              aria-label="Search clubs"
            />
          </div>

          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue placeholder="Any type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any type</SelectItem>
              {Object.entries(CLUB_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={field} onValueChange={setField}>
            <SelectTrigger>
              <SelectValue placeholder="Any interest" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any interest</SelectItem>
              {PRESET_INTERESTS.map((interest) => (
                <SelectItem key={interest} value={interest}>
                  {interest}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={commitment} onValueChange={setCommitment}>
            <SelectTrigger>
              <SelectValue placeholder="Any commitment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any commitment</SelectItem>
              {Object.entries(COMMITMENT_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {clubSearch.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-44 w-full" />
          </div>
        ) : (clubSearch.data ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">No clubs match those filters yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(clubSearch.data ?? []).map((club, index) => (
              <ClubCard
                key={club.id}
                club={club}
                onOpen={() => navigate({ to: "/clubs/$clubId", params: { clubId: club.id } })}
                className="animate-in fade-in"
                style={staggerStyle(index)}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/** Small stat card for the dashboard header row. */
function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold">{value}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-accent/50 flex items-center justify-center text-accent-foreground">
            <Users className="size-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Compact event card for the dashboard. */
function EventCard({
  event,
  className,
  style,
}: {
  event: {
    id: string;
    club_name: string;
    title: string;
    kind: string;
    location: string | null;
    starts_at: string;
    priority: string;
    my_rsvp: string | null;
    conflict_count: number;
  };
  className?: string;
  style?: React.CSSProperties;
}) {
  const starts = new Date(event.starts_at);

  return (
    <Card className={cn(className)} style={style}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm text-muted-foreground">{event.club_name}</p>
            <p className="font-medium">{event.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3" />
                {starts.toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
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
          <div className="flex shrink-0 items-end gap-1">
            <Badge variant="outline">
              {EVENT_KIND_LABELS[event.kind as keyof typeof EVENT_KIND_LABELS]}
            </Badge>
            {event.my_rsvp === "going" ? <Badge variant="secondary">Going</Badge> : null}
          </div>
        </div>

        {/* PRD 15/53.15: conflicts are FLAGGED, never auto-resolved. */}
        {event.conflict_count > 0 ? (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            Overlaps with {event.conflict_count} other event
            {event.conflict_count === 1 ? "" : "s"}. You decide which one to attend.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Club card for search results. */
function ClubCard({
  club,
  showReasons = false,
  onOpen,
  className,
  style,
}: {
  club: {
    id: string;
    name: string;
    description: string;
    type: keyof typeof CLUB_TYPE_LABELS;
    commitment: keyof typeof COMMITMENT_LABELS;
    fields: string[];
    room: string;
    meeting_day: string | null;
    meeting_time: string | null;
    member_count: number;
    match_reasons: string[];
  };
  showReasons?: boolean;
  onOpen?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Card
      className={cn(
        onOpen ? "cursor-pointer transition-colors hover:border-primary/40" : undefined,
        className,
      )}
      style={style}
      onClick={onOpen}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">{club.name}</CardTitle>
          <Badge variant="outline">{CLUB_TYPE_LABELS[club.type]}</Badge>
        </div>
        {club.description ? (
          <CardDescription className="line-clamp-2">{club.description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex flex-wrap gap-1.5">
          {club.fields.slice(0, 4).map((item) => (
            <Badge key={item} variant="secondary">
              {item}
            </Badge>
          ))}
        </div>
        <p className="text-muted-foreground">
          {club.meeting_day && club.meeting_time
            ? `${club.meeting_day}s at ${club.meeting_time.slice(0, 5)}`
            : "Meeting time not set"}
          {club.room ? ` · Room ${club.room}` : ""}
        </p>
        <p className="flex items-center gap-1 text-muted-foreground">
          <Users className="size-3" />
          {club.member_count} member{club.member_count === 1 ? "" : "s"}
        </p>
        <p className="text-muted-foreground">{COMMITMENT_LABELS[club.commitment]}</p>

        {/* PRD 21: always explain why a club is recommended. */}
        {showReasons && club.match_reasons.length > 0 ? (
          <ul className="space-y-1 pt-1 text-xs text-primary">
            {club.match_reasons.map((reason) => (
              <li key={reason}>• {reason}</li>
            ))}
          </ul>
        ) : null}

        {!onOpen ? (
          <Button className="mt-2 w-full" size="sm" asChild>
            <Link to="/clubs/$clubId" params={{ clubId: club.id }}>
              View club
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
