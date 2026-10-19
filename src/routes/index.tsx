import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, MapPin, Search, Sparkles, Users } from "lucide-react";

import { AppShell, PageHeader, RequireAuth } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
        title={profile?.full_name ? `Hi, ${profile.full_name.split(" ")[0]}` : "Main"}
        description="Find clubs, see what is coming up, and keep up with your clubs."
      />

      {/* ---- Upcoming across all joined clubs (PRD 13/20) ---- */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Coming up</h2>

        {upcoming.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (upcoming.data ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Nothing on your calendar yet. Join a club and its events will show up here
              automatically.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(upcoming.data ?? []).map((event) => (
              <Card key={event.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-muted-foreground">{event.club_name}</p>
                      <p className="font-medium">{event.title}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="size-3" />
                          {new Date(event.starts_at).toLocaleString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
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
                        <Badge>High priority</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {EVENT_PRIORITY_LABELS[event.priority]}
                        </span>
                      )}
                      {event.my_rsvp === "going" ? <Badge variant="secondary">Going</Badge> : null}
                    </div>
                  </div>

                  {/* PRD 15/53.15: conflicts are FLAGGED, never auto-resolved. */}
                  {event.conflict_count > 0 ? (
                    <p className="mt-3 flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                      Overlaps with {event.conflict_count} other event
                      {event.conflict_count === 1 ? "" : "s"}. You decide which one to attend.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ---- Recommendations with reasons (PRD 21) ---- */}
      {showRecommendations && recommended.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="size-4 text-primary" />
            Recommended for you
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Based on your interests and how much time you have each week.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {recommended.map((club) => (
              <ClubCard key={club.id} club={club} showReasons />
            ))}
          </div>
        </section>
      ) : null}

      {/* ---- Search & filters (PRD 20) ---- */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Find clubs</h2>

        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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

        <div className="mb-4">
          <Button asChild>
            <Link to="/clubs/new">Start a new club</Link>
          </Button>
        </div>

        {clubSearch.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (clubSearch.data ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No clubs match those filters yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(clubSearch.data ?? []).map((club) => (
              <ClubCard
                key={club.id}
                club={club}
                onOpen={() => navigate({ to: "/clubs/$clubId", params: { clubId: club.id } })}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function ClubCard({
  club,
  showReasons = false,
  onOpen,
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
}) {
  return (
    <Card
      className={onOpen ? "cursor-pointer transition-colors hover:border-primary/40" : undefined}
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
          <Button className="mt-2 w-full" asChild>
            <Link to="/clubs/$clubId" params={{ clubId: club.id }}>
              View club
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
