import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Send, ShieldAlert } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell, PageHeader, RequireAuth } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton, SkeletonSpinner } from "@/components/ui/skeleton";
import { useClubContext } from "@/lib/hooks/use-club";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ChatBannerRow, MessageRow, TablesInsert } from "@/lib/types/database";

/**
 * PRD 12: one plain group chat per club -- banners, a message list, and an
 * input. Nothing here decides who may read or write; RLS does that, so a
 * non-member cannot load these rows no matter what this page renders.
 */
export const Route = createFileRoute("/clubs/$clubId/chat")({
  component: ChatPage,
});

function ChatPage() {
  return (
    <RequireAuth>
      <AppShell>
        <ChatContent />
      </AppShell>
    </RequireAuth>
  );
}

function ChatContent() {
  const { clubId } = useParams({ from: "/clubs/$clubId/chat" });
  const context = useClubContext(clubId);
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const messages = useQuery({
    queryKey: ["club", clubId, "messages"],
    queryFn: async (): Promise<MessageRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("club_id", clubId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as MessageRow[];
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
      // Expiry is compared against the browser clock rather than in SQL, so an
      // expired banner disappears without a cleanup job (PRD 12).
      const now = Date.now();
      return ((data ?? []) as ChatBannerRow[]).filter(
        (banner) => !banner.expires_at || new Date(banner.expires_at).getTime() > now,
      );
    },
    enabled: Boolean(clubId),
  });

  // Sender names live on profiles, which RLS opens to fellow club members, so
  // the lookup list is read once and keyed by user id. The profile join is done
  // in the same request; it used to be a second round trip on every club page.
  const senders = useQuery({
    queryKey: ["club", clubId, "sender-names"],
    queryFn: async (): Promise<Array<{ id: string; full_name: string }>> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("memberships")
        .select("user_id, profiles(id, full_name)")
        .eq("club_id", clubId)
        .eq("status", "active");
      if (error) throw error;

      // The generated Relationships map is empty, so PostgREST cannot infer the
      // embedded shape; the cast is scoped to this join and RLS still decides
      // which profile rows are returned.
      return (data ?? [])
        .map(
          (row) =>
            (row as unknown as { profiles: { id: string; full_name: string } | null }).profiles,
        )
        .filter((person): person is { id: string; full_name: string } => person !== null);
    },
    enabled: Boolean(clubId),
  });

  const send = useMutation({
    mutationFn: async (content: string) => {
      const supabase = getSupabaseClient();
      const { data: userData } = await supabase.auth.getUser();
      const senderId = userData.user?.id;
      if (!senderId) throw new Error("You need to be signed in to send a message.");

      const row: TablesInsert<"messages"> = {
        club_id: clubId,
        sender_id: senderId,
        content,
        created_at: new Date().toISOString(),
      };
      const { error } = await insertMessage(row);
      if (error) throw error;
    },
    onSuccess: () => {
      // Clearing only on success keeps a failed send recoverable -- the student
      // does not lose what they typed.
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: ["club", clubId, "messages"] });
    },
  });

  const nameById = useMemo(
    () => new Map((senders.data ?? []).map((person) => [person.id, person.full_name] as const)),
    [senders.data],
  );

  const messageRows = messages.data ?? [];
  const bannerRows = banners.data ?? [];
  const club = context.data?.club ?? null;
  const currentUserId = context.data?.membership?.user_id ?? null;

  // Follow the conversation as it grows instead of pinning the student to the top.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messageRows.length]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (content.length === 0 || send.isPending) return;
    send.mutate(content);
  };

  if (context.isLoading || messages.isLoading) {
    return <Skeleton className="h-72 w-full" />;
  }

  return (
    <>
      <PageHeader
        title={`${club?.name ?? "Club"} chat`}
        description="Everyone in this club can read and reply here."
      />

      {/* PRD 12: leader banners sit above the conversation. */}
      {bannerRows.length > 0 ? (
        <div className="mb-4 space-y-2">
          {bannerRows.map((banner) => (
            <div
              key={banner.id}
              className="rounded-md border-l-4 border-primary bg-accent/40 px-3 py-2 text-sm"
            >
              {banner.content}
            </div>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Group chat</CardTitle>
          <CardDescription>
            Messages are visible to active members only. If a leader removes one, it is replaced
            with a note here instead of disappearing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {messageRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No messages yet. Say hello to get things started.
            </p>
          ) : (
            <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {messageRows.map((message, index) => {
                const previous = messageRows.at(index - 1);
                const startsNewDay =
                  !previous || dayKey(previous.created_at) !== dayKey(message.created_at);
                const mine = currentUserId !== null && message.sender_id === currentUserId;

                return (
                  <div key={message.id} className="space-y-3">
                    {startsNewDay ? (
                      <div className="flex items-center gap-3">
                        <Separator className="flex-1" />
                        <span className="text-xs text-muted-foreground">
                          {dayKey(message.created_at)}
                        </span>
                        <Separator className="flex-1" />
                      </div>
                    ) : null}

                    <div className={mine ? "flex justify-end" : "flex justify-start"}>
                      <div
                        className={
                          mine
                            ? "max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                            : "max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm"
                        }
                      >
                        <p className={mine ? "text-xs opacity-80" : "text-xs font-medium"}>
                          {mine ? "You" : (nameById.get(message.sender_id) ?? "Club member")}
                        </p>
                        {message.deleted_at ? (
                          <p className="italic opacity-70">This message was removed by a leader.</p>
                        ) : (
                          <p className="whitespace-pre-wrap break-words">{message.content}</p>
                        )}
                        <p className="mt-1 text-[10px] opacity-70">
                          {new Date(message.created_at).toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Message the club"
              aria-label="Message"
              maxLength={2000}
              disabled={send.isPending}
            />
            <Button type="submit" disabled={send.isPending || draft.trim().length === 0}>
              {send.isPending ? <SkeletonSpinner /> : <Send className="size-4" />}
              Send
            </Button>
          </form>

          {/* Insert failures show in place so the typed message survives (PRD 41). */}
          {send.isError ? (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <ShieldAlert className="size-4" />
              {send.error.message}
            </p>
          ) : null}

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Badge variant="outline">{messageRows.length} shown</Badge>
            Only active members can read this conversation.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

function dayKey(value: string): string {
  return new Date(value).toLocaleDateString();
}

/**
 * The hand-maintained Database type carries no relationship metadata, so
 * supabase-js cannot infer the insert payload and types it as `never`. The row
 * is cast once here instead of at every call site; Postgres and RLS remain the
 * enforcement point (PRD 41).
 */
function insertMessage(row: TablesInsert<"messages">) {
  return getSupabaseClient()
    .from("messages")
    .insert(row as unknown as never[]);
}
