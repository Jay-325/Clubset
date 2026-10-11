/**
 * Query hooks.
 *
 * Every hook reads through a Postgres RPC or a table governed by RLS, so the
 * data a client can see is the data the database permits. Where the PRD calls
 * for automation ("enter once, reuse everywhere", PRD 25/29/46) the join is
 * done in SQL, not by stitching results together in the browser.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";

import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  AdminClubOverviewRow,
  AttendanceRow,
  ClubRow,
  ClubSearchResult,
  CommitmentLevel,
  ClubType,
  Json,
  MembershipRow,
  NotificationRow,
  ProfileRow,
  UpcomingEventResult,
} from "@/lib/types/database";

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/**
 * PRD 5: the Administrator Login path only ever *requests* a check. The
 * backend compares the email against the allowlist and emails an activation
 * link; the role is never granted by the client.
 */
export function useAdminLogin() {
  return useMutation({
    mutationFn: async (email: string) => {
      const supabase = getSupabaseClient();
      // Sign in first so the caller has a session; activate_administrator() is
      // then called from the authenticated state.
      const { error } = await supabase.auth.signInWithOtp({
        email: email.toLowerCase().trim(),
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      return { email: email.toLowerCase().trim() };
    },
  });
}

export function useAdminActivation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc("activate_administrator");
      if (error) throw error;
      return data as ProfileRow;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile"] }),
  });
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; password?: string }) => {
      const supabase = getSupabaseClient();
      if (input.password) {
        const { error } = await supabase.auth.signInWithPassword({
          email: input.email.toLowerCase().trim(),
          password: input.password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email: input.email.toLowerCase().trim(),
          options: { shouldCreateUser: true },
        });
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["auth"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      void variables;
    },
  });
}

export function useSignUp() {
  return useMutation({
    mutationFn: async (input: { email: string; password: string; fullName: string }) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signUp({
        email: input.email.toLowerCase().trim(),
        password: input.password,
        options: { data: { full_name: input.fullName } },
      });
      if (error) throw error;
    },
  });
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<ProfileRow>) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("profiles")
        .update({ ...patch, onboarding_complete: true })
        .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "");
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile"] }),
  });
}

/** Users whose name contains the term (PRD 26: use profiles as the member picker). */
export function useMemberSearch(clubId: string | null, term: string) {
  return useQuery({
    queryKey: ["club", clubId, "member-search", term],
    queryFn: async (): Promise<ProfileRow[]> => {
      if (!clubId || term.trim().length < 2) return [];
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .ilike("full_name", `%${term.trim()}%`)
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(clubId) && term.trim().length >= 2,
  });
}

// ---------------------------------------------------------------------------
// Discovery (PRD 20/21)
// ---------------------------------------------------------------------------

export interface ClubFilters {
  // `| undefined` is explicit because the route passes `search || undefined`
  // and the project enables exactOptionalPropertyTypes.
  search?: string | undefined;
  type?: ClubType | null;
  field?: string | null;
  commitment?: CommitmentLevel | null;
}

export function useClubSearch(filters: ClubFilters = {}) {
  return useQuery({
    queryKey: ["clubs", "search", filters],
    queryFn: async (): Promise<ClubSearchResult[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc("search_clubs", {
        search_text: filters.search?.trim() || null,
        filter_type: filters.type ?? null,
        filter_field: filters.field ?? null,
        filter_commitment: filters.commitment ?? null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** PRD 21: recommendations carry their reasons so the UI can explain them. */
export function useRecommendedClubs() {
  return useQuery({
    queryKey: ["clubs", "recommended"],
    queryFn: async (): Promise<ClubSearchResult[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc("search_clubs", {});
      if (error) throw error;
      return (data ?? []).filter((club) => club.match_reasons.length > 0);
    },
  });
}

export function useClub(clubId: string) {
  return useQuery({
    queryKey: ["club", clubId],
    queryFn: async (): Promise<ClubRow> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.from("clubs").select("*").eq("id", clubId).single();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(clubId),
  });
}

export function useMyClubs() {
  return useQuery({
    queryKey: ["clubs", "mine"],
    queryFn: async (): Promise<Array<ClubRow & { membership: MembershipRow }>> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("memberships")
        .select("*, clubs(*)")
        .eq("status", "active");
      if (error) throw error;

      return (data ?? [])
        .map((row) => {
          const club = row.clubs as unknown as ClubRow | null;
          return club ? { ...club, membership: row as MembershipRow } : null;
        })
        .filter((entry): entry is ClubRow & { membership: MembershipRow } => entry !== null);
    },
  });
}

export function useSetClubPriority() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { membershipId: string; isPriority: boolean }) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("memberships")
        .update({ is_priority: input.isPriority })
        .eq("id", input.membershipId);
      if (error) throw error;
    },
    // PRD 22: priority is organizational only and changes no permission.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clubs", "mine"] }),
  });
}

// ---------------------------------------------------------------------------
// Club creation (PRD 7)
// ---------------------------------------------------------------------------

export function useCreateClub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      type: ClubType;
      commitment: CommitmentLevel;
      fields: string[];
      room: string;
      meetingDay: string | null;
      meetingTime: string | null;
      description: string;
    }) => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc("create_club", {
        club_name: input.name,
        club_type: input.type,
        club_commitment: input.commitment,
        club_fields: input.fields,
        club_room: input.room,
        club_meeting_day: input.meetingDay,
        club_meeting_time: input.meetingTime,
        club_description: input.description,
      });
      if (error) throw error;
      return data as ClubRow;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clubs"] });
    },
  });
}

export function useClubVerifications(clubId: string) {
  return useQuery({
    queryKey: ["club", clubId, "verifications"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("club_verifications")
        .select("*")
        .eq("club_id", clubId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(clubId),
  });
}

export function useVerifyClub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (clubId: string) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("club_verifications")
        .insert({ club_id: clubId, kind: "verifier" });
      if (error) throw error;
    },
    onSuccess: (_data, clubId) =>
      queryClient.invalidateQueries({ queryKey: ["club", clubId, "verifications"] }),
  });
}

export function useSubmitClubForReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (clubId: string) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc("submit_club_for_review", {
        target_club: clubId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, clubId) => {
      void queryClient.invalidateQueries({ queryKey: ["club", clubId] });
      void queryClient.invalidateQueries({ queryKey: ["clubs"] });
    },
  });
}

export function useReviewClub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { clubId: string; approved: boolean; note?: string }) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc("review_club", {
        target_club: input.clubId,
        approved: input.approved,
        note: input.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
  });
}

// ---------------------------------------------------------------------------
// Membership (PRD 9)
// ---------------------------------------------------------------------------

export function useApplyToClub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (clubId: string) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("memberships").insert({ club_id: clubId });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clubs"] });
      void queryClient.invalidateQueries({ queryKey: ["club"] });
    },
  });
}

export function useJoinRequests(clubId: string) {
  return useQuery({
    queryKey: ["club", clubId, "join-requests"],
    queryFn: async (): Promise<Array<MembershipRow & { profile: ProfileRow }>> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("memberships")
        .select("*, profiles(id, full_name, grade, avatar_url, email)")
        .eq("club_id", clubId)
        .eq("status", "pending");
      if (error) throw error;
      // The Relationships map is empty in our generated types, so PostgREST
      // cannot infer the nested `profiles(...)` join shape. The cast is the
      // one place we assert a join's shape by hand; the RLS policies still
      // decide which rows actually come back.
      return (data ?? []) as unknown as Array<MembershipRow & { profile: ProfileRow }>;
    },
    enabled: Boolean(clubId),
  });
}

export function useClubMembers(clubId: string) {
  return useQuery({
    queryKey: ["club", clubId, "members"],
    queryFn: async (): Promise<Array<MembershipRow & { profile: ProfileRow }>> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("memberships")
        .select("*, profiles(id, full_name, grade, avatar_url, email)")
        .eq("club_id", clubId)
        .eq("status", "active")
        .order("joined_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Array<MembershipRow & { profile: ProfileRow }>;
    },
    enabled: Boolean(clubId),
  });
}

export function useReviewMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { membershipId: string; accept: boolean }) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc("review_membership", {
        target_membership: input.membershipId,
        accept: input.accept,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // Accepting a member unlocks internal club access and the group chat
      // (PRD 9/12/46) -- both are automatic, so no extra work happens here.
      void queryClient.invalidateQueries({ queryKey: ["club"] });
      void queryClient.invalidateQueries({ queryKey: ["clubs"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Calendar, RSVP, attendance (PRD 13-19)
// ---------------------------------------------------------------------------

export function useUpcomingEvents(limit = 20) {
  return useQuery({
    queryKey: ["events", "upcoming", limit],
    queryFn: async (): Promise<UpcomingEventResult[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc("upcoming_events", {
        limit_count: limit,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useClubEvents(clubId: string) {
  return useQuery({
    queryKey: ["club", clubId, "events"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("club_id", clubId)
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(clubId),
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      clubId: string;
      title: string;
      description: string;
      kind: "meeting" | "event" | "deadline" | "other";
      location: string;
      startsAt: string;
      endsAt: string;
      priority: "low" | "normal" | "high";
      rsvpEnabled: boolean;
    }) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("events").insert({
        club_id: input.clubId,
        created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
        title: input.title,
        description: input.description,
        kind: input.kind,
        location: input.location,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        priority: input.priority,
        // PRD 19: leaders can turn RSVP off for an event when attendance
        // planning is not needed.
        rsvp_enabled: input.rsvpEnabled,
      });
      if (error) throw error;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ["club", input.clubId, "events"] });
      void queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useRsvp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { eventId: string; going: boolean }) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc("set_rsvp", {
        target_event: input.eventId,
        going: input.going,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // PRD 46: the RSVP already created the expected-attendance record in
      // the database; both views just need to re-read.
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
  });
}

export function useAttendanceForEvent(eventId: string) {
  return useQuery({
    queryKey: ["attendance", eventId],
    queryFn: async (): Promise<Array<AttendanceRow & { profile: ProfileRow }>> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("attendance")
        .select("*, profiles(id, full_name, grade, avatar_url)")
        .eq("event_id", eventId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Array<AttendanceRow & { profile: ProfileRow }>;
    },
    enabled: Boolean(eventId),
  });
}

export function useVetoRsvp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { attendanceId: string; reason?: string | undefined }) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc("veto_rsvp", {
        target_attendance: input.attendanceId,
        correction_reason: input.reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["attendance"] }),
  });
}

export function useFinalizeAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: string) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc("finalize_attendance", {
        target_event: eventId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attendance"] });
      void queryClient.invalidateQueries({ queryKey: ["club"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Notifications (PRD 36)
// ---------------------------------------------------------------------------

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<NotificationRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notificationId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

// ---------------------------------------------------------------------------
// Administrator (PRD 37)
// ---------------------------------------------------------------------------

export function useAdminClubOverview() {
  return useQuery({
    queryKey: ["admin", "clubs"],
    queryFn: async (): Promise<AdminClubOverviewRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc("admin_club_overview");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Session typing helper
// ---------------------------------------------------------------------------

export type { Session, Json };
