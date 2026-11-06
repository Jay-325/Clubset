import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, MapPin, Star, Users } from "lucide-react";

import { AppShell, PageHeader, RequireAuth } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { FadeIn } from "@/components/ui/motion";
import { useMyClubs, useSetClubPriority } from "@/lib/queries";
import { staggerStyle } from "@/lib/motion";
import { toast } from "sonner";
import { CLUB_TYPE_LABELS, COMMITMENT_LABELS } from "@/lib/domain";
import type { ClubRow, MembershipRow } from "@/lib/types/database";
import type { CSSProperties } from "react";

/**
 * PRD 22: My Clubs is the student's own list, ordered by how much the club
 * matters to them.
 *
 * The pin writes memberships.is_priority, which is organizational ONLY -- it
 * never changes a permission or a role (PRD 22, 10). Leadership ordering is
 * resolved by the database, so this page never guesses it client-side.
 */
export const Route = createFileRoute("/my-clubs")({
  component: MyClubsPage,
});

function MyClubsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <MyClubsContent />
      </AppShell>
    </RequireAuth>
  );
}

function MyClubsContent() {
  const myClubs = useMyClubs();
  const setClubPriority = useSetClubPriority();

  // PRD 22: pinned clubs first, then alphabetical so the order never jitters
  // between renders.
  const clubs = [...(myClubs.data ?? [])].sort(
    (a, b) =>
      Number(b.membership.is_priority) - Number(a.membership.is_priority) ||
      a.name.localeCompare(b.name),
  );

  return (
    <>
      <PageHeader
        title="My Clubs"
        description="Every club you have joined. Pin the ones that matter most to keep them at the top."
      />

      {myClubs.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      ) : clubs.length === 0 ? (
        <FadeIn>
          <Card>
            <CardContent className="space-y-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                You have not joined a club yet. Browse the Main page to find one that fits.
              </p>
              <Button asChild>
                <Link to="/">Find clubs</Link>
              </Button>
            </CardContent>
          </Card>
        </FadeIn>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {clubs.map((club, index) => (
            <ClubSummary
              key={club.id}
              club={club}
              onTogglePriority={async (isPriority) => {
                try {
                  await setClubPriority.mutateAsync({
                    membershipId: club.membership.id,
                    isPriority,
                  });
                  toast(isPriority ? "Club pinned" : "Club unpinned");
                } catch {
                  // Surface errors through the mutation's error state instead.
                }
              }}
              isPending={setClubPriority.isPending}
              className="animate-in fade-in"
              style={staggerStyle(index)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ClubSummary({
  club,
  onTogglePriority,
  isPending,
  className,
  style,
}: {
  club: ClubRow & { membership: MembershipRow };
  onTogglePriority: (isPriority: boolean) => void;
  isPending: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const isPriority = club.membership.is_priority;

  return (
    <Card className={cn(isPriority ? "border-primary/40" : undefined, className)} style={style}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">{club.name}</CardTitle>
          <div className="flex shrink-0 items-center gap-1">
            <Badge variant="outline">{CLUB_TYPE_LABELS[club.type]}</Badge>
            {/* PRD 22: pinning is organization only -- it grants nothing. */}
            <Button
              variant="ghost"
              size="icon"
              aria-pressed={isPriority}
              aria-label={isPriority ? `Unpin ${club.name}` : `Pin ${club.name}`}
              disabled={isPending}
              onClick={() => onTogglePriority(!isPriority)}
              className={isPriority ? "text-primary" : "text-muted-foreground"}
            >
              <Star className={isPriority ? "size-4 fill-current" : "size-4"} />
            </Button>
          </div>
        </div>
        {club.description ? (
          <CardDescription className="line-clamp-2">{club.description}</CardDescription>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-2 text-sm">
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="size-3.5 shrink-0" />
          {club.meeting_day && club.meeting_time
            ? `${club.meeting_day}s at ${club.meeting_time.slice(0, 5)}`
            : "Meeting time not set"}
        </p>
        {club.room ? (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            Room {club.room}
          </p>
        ) : null}
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Users className="size-3.5 shrink-0" />
          {COMMITMENT_LABELS[club.commitment]}
        </p>
      </CardContent>
    </Card>
  );
}
