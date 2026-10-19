import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MapPin, ShieldCheck, Users } from "lucide-react";

import { AppShell, PageHeader, RequireAuth } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton, SkeletonSpinner } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useClubContext } from "@/lib/hooks/use-club";
import { useApplyToClub } from "@/lib/queries";
import { isActiveMember, managementSections, quickActions } from "@/lib/auth/permissions";
import { CLUB_STATUS_LABELS, CLUB_TYPE_LABELS, COMMITMENT_LABELS } from "@/lib/domain";
import type { AnnouncementRow, ChatBannerRow, ClubRow } from "@/lib/types/database";

/**
 * PRD 8/9: before joining, a student sees the public welcome page. Once
 * accepted, that public experience is replaced by the internal club page
 * (PRD 8) -- one route serves both, so a shared link works either way.
 */
export const Route = createFileRoute("/clubs/$clubId/")({
  component: ClubPage,
});

function ClubPage() {
  return (
    <RequireAuth>
      <AppShell>
        <ClubContent />
      </AppShell>
    </RequireAuth>
  );
}

function ClubContent() {
  const { clubId } = useParams({ from: "/clubs/$clubId/" });
  const context = useClubContext(clubId);
  const apply = useApplyToClub();
  const [message, setMessage] = useState<string | null>(null);

  if (context.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!context.data) {
    return <p className="text-sm text-muted-foreground">This club is not available.</p>;
  }

  if (!isActiveMember(context.data)) {
    return (
      <PublicWelcomePage
        club={context.data.club}
        pending={context.data.membership?.status === "pending"}
        applying={apply.isPending}
        message={message}
        onApply={async () => {
          try {
            await apply.mutateAsync(clubId);
            setMessage("Request sent. A leader will review it.");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Could not send the request.");
          }
        }}
      />
    );
  }

  return <InternalClubPage />;
}

/** PRD 8: the pre-membership welcome page. */
function PublicWelcomePage({
  club,
  pending,
  applying,
  message,
  onApply,
}: {
  club: ClubRow;
  pending: boolean;
  applying: boolean;
  message: string | null;
  onApply: () => void;
}) {
  return (
    <>
      {club.welcome_banner_url ? (
        <img
          src={club.welcome_banner_url}
          alt=""
          className="mb-6 h-48 w-full rounded-lg object-cover"
        />
      ) : null}

      <PageHeader title={club.name} description={club.description} />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">About this club</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {club.welcome_message ? (
              <p className="rounded-md bg-accent/50 p-3 text-sm">{club.welcome_message}</p>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
              <Badge>{CLUB_TYPE_LABELS[club.type]}</Badge>
              <Badge variant="secondary">{COMMITMENT_LABELS[club.commitment]}</Badge>
              {club.fields.map((field) => (
                <Badge key={field} variant="outline">
                  {field}
                </Badge>
              ))}
            </div>

            <Separator />

            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Meets</dt>
                <dd>
                  {club.meeting_day && club.meeting_time
                    ? `${club.meeting_day}s at ${club.meeting_time.slice(0, 5)}`
                    : "To be decided"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Room</dt>
                <dd className="flex items-center gap-1">
                  {club.room ? (
                    <>
                      <MapPin className="size-3" />
                      {club.room}
                    </>
                  ) : (
                    "To be decided"
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Join this club</CardTitle>
            <CardDescription>
              A club leader reviews every request. You will be added to the group chat automatically
              once you are accepted.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {club.status !== "approved" ? (
              <p className="text-sm text-muted-foreground">
                This club is still being set up ({CLUB_STATUS_LABELS[club.status].toLowerCase()}).
              </p>
            ) : pending ? (
              <p className="text-sm text-muted-foreground">
                Your request is waiting for a leader to review it.
              </p>
            ) : (
              <Button className="w-full" onClick={onApply} disabled={applying}>
                {applying ? <SkeletonSpinner /> : null}
                Apply to join
              </Button>
            )}
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/** PRD 23/45: the internal experience a member sees once accepted. */
function InternalClubPage() {
  const { clubId } = useParams({ from: "/clubs/$clubId/" });
  const context = useClubContext(clubId);

  // The club home page shows a 20-row summary; the announcements page shows the
  // full list. Separate cache entries (same prefix, so invalidating
  // ["club", clubId, "announcements"] still refreshes both) keep one route from
  // rendering the other's row set.
  const announcements = useQuery({
    queryKey: ["club", clubId, "announcements", "recent"],
    queryFn: async (): Promise<AnnouncementRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .eq("club_id", clubId)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(clubId),
  });

  const banners = useQuery({
    queryKey: ["club", clubId, "banners"],
    queryFn: async (): Promise<ChatBannerRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("chat_banners")
        .select("*")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      // Expiry is compared against the client's clock, so it is filtered here
      // rather than pushed into the query.
      const now = Date.now();
      return (data ?? []).filter(
        (banner) => !banner.expires_at || new Date(banner.expires_at).getTime() > now,
      );
    },
    enabled: Boolean(clubId),
  });

  if (!context.data) {
    return <Skeleton className="h-40 w-full" />;
  }

  const club = context.data.club;
  const sections = managementSections(context.data);
  const actions = quickActions(context.data);
  const navSections = sections.filter((section) => section.key !== "home");

  return (
    <>
      <PageHeader
        title={club.name}
        description={club.description}
        actions={
          <Badge variant="outline">
            {CLUB_TYPE_LABELS[club.type]} · {COMMITMENT_LABELS[club.commitment]}
          </Badge>
        }
      />

      {/* PRD 12: leader banners surface across the club experience. */}
      {(banners.data ?? []).length > 0 ? (
        <div className="mb-4 space-y-2">
          {(banners.data ?? []).map((banner) => (
            <div
              key={banner.id}
              className="rounded-md border-l-4 border-primary bg-accent/40 px-3 py-2 text-sm"
            >
              {banner.content}
            </div>
          ))}
        </div>
      ) : null}

      {/* PRD 11: actions first, technical settings last. */}
      {actions.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">What do you want to do?</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {actions.map((action) => (
              <Button
                key={action.key}
                variant="outline"
                className="h-auto justify-start py-3 text-left"
                asChild
              >
                <Link to={action.path}>
                  <span>
                    <span className="block font-medium">{action.label}</span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {action.description}
                    </span>
                  </span>
                </Link>
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <Tabs defaultValue="announcements">
            <TabsList>
              <TabsTrigger value="announcements">
                <ShieldCheck className="size-4" />
                Announcements
              </TabsTrigger>
            </TabsList>
            <TabsContent value="announcements" className="mt-4 space-y-3">
              {(announcements.data ?? []).length === 0 ? (
                <Card>
                  <CardContent className="py-6 text-sm text-muted-foreground">
                    No announcements yet.
                  </CardContent>
                </Card>
              ) : (
                (announcements.data ?? []).map((announcement) => (
                  <Card key={announcement.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{announcement.title}</p>
                        {announcement.pinned ? <Badge>Important</Badge> : null}
                      </div>
                      {announcement.body ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                          {announcement.body}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-muted-foreground">
                        {new Date(announcement.created_at).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* PRD 45: only the sections this member can actually use. */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your club</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-1.5">
              {navSections.map((section) => (
                <li key={section.key}>
                  <Link
                    to={section.path}
                    className="text-sm text-foreground underline-offset-4 hover:underline"
                  >
                    {section.label}
                  </Link>
                </li>
              ))}
            </ul>
            <Separator />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="size-3" />
              {context.data.permissions.length > 0
                ? "You have management access in this club."
                : "You are a member of this club."}
            </p>
            {context.data.isAdministrator || context.data.isLinkedAdministrator ? (
              <p className="text-xs text-muted-foreground">
                You are an administrator for this club.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
