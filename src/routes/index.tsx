import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Clock,
  MapPin,
  Search,
  Sparkles,
  Users,
  ChevronRight,
} from "lucide-react";

import { AppShell, PageHeader, RequireAuth } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { FadeIn, StaggeredList } from "@/components/ui/motion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth/context";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useClubSearch, useMyClubs, useRecommendedClubs, useUpcomingEvents } from "@/lib/queries";
import { staggerStyle } from "@/lib/motion";
import {
  CLUB_TYPE_LABELS,
  COMMITMENT_LABELS,
  EVENT_KIND_LABELS,
  PRESET_INTERESTS,
} from "@/lib/domain";

/**
 * PRD 20: the Main page is the student's personal Clubset home -- upcoming
 * meetings, important updates, joined-club shortcuts, recommendations, plus
 * search and filters. It is an overview, not a second scheduling page (the
 * dedicated calendar lives at /calendar).
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
  const myClubs = useMyClubs();

  // PRD 21: recommendations are only shown separately when there is a profile
  // to base them on.
  const showRecommendations =
    !searchInput &&
    type === ALL &&
    field === ALL &&
    commitment === ALL &&
    (profile?.interests.length ?? 0) > 0;

  const recommended = useMemo(() => {
    const discovered = new Set((clubSearch.data ?? []).map((result) => result.id));
    return (recommendations.data ?? []).filter((club) => !discovered.has(club.id));
  }, [recommendations.data, clubSearch.data]);

  const pinnedClubs = useMemo(
    () =>
      [...(myClubs.data ?? [])]
        .sort((a, b) => Number(b.membership.is_priority) - Number(a.membership.is_priority))
        .slice(0, 5),
    [myClubs.data],
  );

  return (
    <>
      <PageHeader
        title={`Hi, ${profile?.full_name?.split(" ")[0] ?? "there"}`}
        description="Your home for clubs, events, and what's coming up next."
      />

      {/* ===== Overview: two columns on desktop, stacked on mobile ===== */}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6 min-w-0">
          {/* Left: coming up */}
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-4 text-primary" />
                <h2 className="text-lg font-semibold">Coming up</h2>
              </div>
              <Link
                to="/calendar"
                className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
              >
                View all <ChevronRight className="size-3" />
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">Across all your joined clubs.</p>

            {upcoming.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : (upcoming.data ?? []).length === 0 ? (
              <Card className="text-center py-10">
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Nothing on your calendar yet. Join a club and its events will show up here
                    automatically.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <StaggeredList>
                {(upcoming.data ?? []).map((event, index) => (
                  <DashboardEventCard
                    key={event.id}
                    event={event}
                    className="animate-in fade-in"
                    style={staggerStyle(index)}
                  />
                ))}
              </StaggeredList>
            )}
          </section>
        </div>
        <div className="space-y-6 min-w-0">
          {/* Right: your clubs + recommendations */}
          {/* ===== Your clubs: joined-club shortcuts ===== */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Your clubs</h2>
              {myClubs.data && myClubs.data.length > 0 ? (
                <Link
                  to="/my-clubs"
                  className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
                >
                  Manage all <ChevronRight className="size-3" />
                </Link>
              ) : null}
            </div>

            {myClubs.isLoading ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : myClubs.data && myClubs.data.length === 0 ? (
              <Card className="text-center py-10">
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    You have not joined a club yet. Browse clubs below to find one that fits.
                  </p>
                  <Button asChild className="mt-4 w-full">
                    <Link to="/">Find clubs</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pinnedClubs.map((club, index) => (
                  <YourClubCard
                    key={club.id}
                    club={club}
                    className="animate-in fade-in"
                    style={staggerStyle(index)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ===== Recommendations ===== */}
          {showRecommendations && recommended.length > 0 ? (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  Recommended for you
                </h2>
                <p className="text-sm text-muted-foreground">
                  Based on your interests and time availability.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recommended.slice(0, 6).map((club, index) => (
                  <ClubCard
                    key={club.id}
                    club={club}
                    showReasons
                    onOpen={() => navigate({ to: "/clubs/$clubId", params: { clubId: club.id } })}
                    className="animate-in fade-in"
                    style={staggerStyle(index)}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {/* ===== Find clubs: search & filters ===== */}
      <section className="mt-10 space-y-4" id="find-clubs">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Find clubs</h2>
        </div>

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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-44 w-full" />
          </div>
        ) : (clubSearch.data ?? []).length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
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

/** Compact event card for the dashboard overview. */
function DashboardEventCard({
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
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm text-muted-foreground" title={event.club_name}>
              {event.club_name}
            </p>
            <p className="font-medium line-clamp-1" title={event.title}>
              {event.title}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" />
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
          <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            Overlaps with {event.conflict_count} other event
            {event.conflict_count === 1 ? "" : "s"}. You decide which one to attend.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Compact shortcut card for a joined club. */
function YourClubCard({
  club,
  className,
  style,
}: {
  club: {
    id: string;
    name: string;
    description: string;
    type: string;
    meeting_day: string | null;
    meeting_time: string | null;
    room: string | null;
  };
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Card className={cn(className)} style={style}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold line-clamp-1" title={club.name}>
            {club.name}
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {CLUB_TYPE_LABELS[club.type as keyof typeof CLUB_TYPE_LABELS] ?? club.type}
          </Badge>
        </div>
        {club.description ? (
          <CardDescription className="line-clamp-1 text-xs">{club.description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="p-3 space-y-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3 shrink-0" />
          {club.meeting_day && club.meeting_time
            ? `${club.meeting_day}s at ${club.meeting_time.slice(0, 5)}`
            : "Meeting time not set"}
          {club.room ? ` · Room ${club.room}` : ""}
        </p>
      </CardContent>
      <CardFooter className="pt-3">
        <Button size="sm" asChild className="w-full">
          <Link to="/clubs/$clubId" params={{ clubId: club.id }}>
            Open club
          </Link>
        </Button>
      </CardFooter>
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
          <CardTitle className="text-lg line-clamp-1" title={club.name}>
            {club.name}
          </CardTitle>
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
