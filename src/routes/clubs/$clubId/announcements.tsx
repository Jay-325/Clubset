import { createFileRoute, useParams, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Bell, Megaphone, Pin, Plus, Trash2 } from "lucide-react";

import { AppShell, PageHeader, RequireAuth } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton, SkeletonSpinner } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { FadeIn } from "@/components/ui/motion";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { can } from "@/lib/auth/permissions";
import { staggerStyle } from "@/lib/motion";
import { useClubContext } from "@/lib/hooks/use-club";
import { useViewerId } from "@/lib/queries";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { AnnouncementRow, ProfileRow, TablesInsert } from "@/lib/types/database";
import { toast } from "sonner";

/**
 * PRD 23/36: announcements are how a club reaches everyone at once.
 *
 * Saving one notifies every member from a database trigger, so there is no
 * separate "send" step a leader can forget (PRD 46).
 */
export const Route = createFileRoute("/clubs/$clubId/announcements")({
  // The dashboard's "Send Announcement" quick action links here with ?new=1
  // (PRD 11), so the flag is validated here instead of read off the URL by hand.
  validateSearch: (search: Record<string, unknown>) => ({
    new: search["new"] === "1" ? ("1" as const) : undefined,
  }),
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <AnnouncementsContent />
      </AppShell>
    </RequireAuth>
  );
}

function AnnouncementsContent() {
  const { clubId } = useParams({ from: "/clubs/$clubId/announcements" });
  const search = useSearch({ from: "/clubs/$clubId/announcements" });
  const context = useClubContext(clubId);
  const queryClient = useQueryClient();

  const permissions = context.data?.permissions ?? [];
  const isLinkedAdministrator = context.data?.isLinkedAdministrator ?? false;
  const maySend = can(permissions, "send_announcements") || isLinkedAdministrator;

  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Landing on ?new=1 should land on the composer, not on a read-only list.
  useEffect(() => {
    if (search.new === "1") setComposing(true);
  }, [search.new]);

  const viewer = useViewerId();

  const announcements = useQuery({
    queryKey: ["club", clubId, "announcements"],
    queryFn: async (): Promise<AnnouncementRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .eq("club_id", clubId)
        // Pinned first, then newest: an announcement is either a standing notice
        // or a dated one, and the standing notice should stay at the top.
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AnnouncementRow[];
    },
    enabled: Boolean(clubId),
  });

  const rows = announcements.data ?? [];
  const viewerId = viewer.data ?? null;

  // Part of the cache key: a newly posted announcement adds an author, and the
  // name lookup has to follow it instead of serving the previous id set.
  const authorIds = [...new Set(rows.map((row) => row.author_id))];

  const authors = useQuery({
    queryKey: ["club", clubId, "announcement-authors", authorIds],
    queryFn: async (): Promise<ProfileRow[]> => {
      const supabase = getSupabaseClient();
      if (authorIds.length === 0) return [];
      const { data, error } = await supabase.from("profiles").select("*").in("id", authorIds);
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
    enabled: authorIds.length > 0,
  });

  const nameById = new Map(
    (authors.data ?? []).map((person) => [person.id, person.full_name || person.email] as const),
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["club", clubId, "announcements"] });
  };

  const create = useMutation({
    mutationFn: async (input: { title: string; body: string; pinned: boolean }) => {
      const supabase = getSupabaseClient();
      const { data: userData } = await supabase.auth.getUser();
      const authorId = userData.user?.id;
      if (!authorId) throw new Error("You need to be signed in to post an announcement.");

      const { error } = await insertAnnouncement({
        club_id: clubId,
        author_id: authorId,
        title: input.title,
        body: input.body,
        pinned: input.pinned,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setTitle("");
      setBody("");
      setPinned(false);
      setComposing(false);
      setFormError(null);
      toast("Announcement posted");
    },
  });

  const remove = useMutation({
    mutationFn: async (announcementId: string) => {
      const supabase = getSupabaseClient();
      // RLS allows this only for the author or a sender of announcements, so the
      // button is a convenience, never the gate (PRD 41).
      const { error } = await supabase.from("announcements").delete().eq("id", announcementId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast("Announcement deleted");
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (title.trim() === "") {
      setFormError("Give the announcement a title so it is scannable.");
      return;
    }
    if (body.trim() === "") {
      setFormError("Write the message members should read.");
      return;
    }
    setFormError(null);
    create.mutate({ title: title.trim(), body: body.trim(), pinned });
  };

  if (context.isLoading || announcements.isLoading) {
    return <Skeleton className="h-72 w-full" />;
  }

  return (
    <>
      <PageHeader
        title="Announcements"
        description="Tell the whole club something. Everyone gets a notification when you post."
        actions={
          maySend ? (
            <Button
              variant={composing ? "outline" : "default"}
              onClick={() => setComposing((open) => !open)}
            >
              <Plus className="size-4" />
              {composing ? "Close" : "New announcement"}
            </Button>
          ) : undefined
        }
      />

      {composing && maySend ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">New announcement</CardTitle>
            <CardDescription>
              Plain words work best. Members see this exactly as you type it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="announcement-title">Title</Label>
                <Input
                  id="announcement-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Practice moved to Thursday"
                  maxLength={140}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="announcement-body">Message</Label>
                <Textarea
                  id="announcement-body"
                  rows={5}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Everything the club needs to know."
                />
              </div>

              <div className="flex items-start justify-between gap-4 rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Pin to the top</p>
                  <p className="text-xs text-muted-foreground">
                    Pinned announcements stay above newer ones until you unpin them.
                  </p>
                </div>
                <Switch
                  checked={pinned}
                  onCheckedChange={setPinned}
                  aria-label="Pin this announcement"
                />
              </div>

              {formError ? (
                <p className="form-message animate-in fade-in rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive duration-150">
                  {formError}
                </p>
              ) : null}
              {create.error ? (
                <p className="form-message animate-in fade-in rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive duration-150">
                  {create.error.message}
                </p>
              ) : null}

              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? (
                  <SkeletonSpinner />
                ) : (
                  <Megaphone className="size-4" />
                )}
                Post to the club
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-3">
        {rows.length === 0 ? (
          <FadeIn>
            <Card>
              <CardContent>
                <p className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
                  <Bell className="size-5" />
                  Nothing announced yet.
                  {maySend
                    ? " Post the first one above."
                    : " Leaders will post here when there is news."}
                </p>
              </CardContent>
            </Card>
          </FadeIn>
        ) : (
          rows.map((announcement, index) => {
            const canDelete = maySend || (viewerId !== null && announcement.author_id === viewerId);
            return (
              <Card
                key={announcement.id}
                className="animate-in fade-in"
                style={staggerStyle(index)}
              >
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 text-base">
                        {announcement.pinned ? <Pin className="size-4" /> : null}
                        {announcement.title}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {nameById.get(announcement.author_id) ?? "Club member"} ·{" "}
                        {new Date(announcement.created_at).toLocaleString()}
                        {viewerId !== null && announcement.author_id === viewerId ? " · you" : ""}
                      </CardDescription>
                    </div>
                    {announcement.pinned ? <Badge variant="secondary">Pinned</Badge> : null}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap break-words">{announcement.body}</p>
                  {canDelete ? (
                    <Button
                      className="mt-4"
                      size="sm"
                      variant="ghost"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(announcement.id)}
                    >
                      {remove.isPending ? (
                        <SkeletonSpinner />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                      Delete
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {remove.error ? (
        <p className="form-message animate-in fade-in mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive duration-150">
          {remove.error.message}
        </p>
      ) : null}
    </>
  );
}

/**
 * The hand-maintained Database type carries no relationship metadata, so
 * supabase-js cannot infer a payload from an already-typed object. Casting once
 * here keeps the call site readable; Postgres and RLS remain the enforcement
 * point (PRD 41).
 */
function insertAnnouncement(row: TablesInsert<"announcements">) {
  return getSupabaseClient()
    .from("announcements")
    .insert(row as unknown as never[]);
}
