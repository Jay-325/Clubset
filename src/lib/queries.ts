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

import { assertPasswordNotBreached } from "@/lib/security/passwords";
import { OAUTH_PROVIDER, oauthRedirectUrl } from "@/lib/auth/oauth";
import {
  enforceAuthRateLimit,
  RATE_LIMITED_MESSAGE,
} from "@/lib/security/auth-rate-limit.functions";
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

/**
 * Normalize an email address the same way the server does:
 * PostgreSQL `lower(btrim(email))` in `check_administrator_allowlist()`
 * and `handle_new_auth_user()`. The database re-normalizes independently,
 * so client normalization is a UX/performance optimization, not a security
 * boundary. Authorization remains solely in `activate_administrator()`.
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/**
 * PRD 5: the Administrator Login path only ever *requests* a check. The
 * backend compares the email against the allowlist and emails an activation
 * link; the role is never granted by the client.
 *
 * The allowlist is consulted FIRST, before any email is sent:
 *
 *   check_administrator_allowlist(email)  -- read-only RPC, anon-callable
 *     false -> return silently; no email, no auth user created
 *     true  -> signInWithOtp(email)       -- the activation link
 *
 * The result is deliberately NOT reported to the caller: this hook resolves the
 * same way whether the address is allowlisted or not, so the page cannot tell
 * the two apart and the response stays anonymous (no email enumeration in the
 * UI). Only genuine failures -- a network/RPC error, or GoTrue refusing the
 * OTP -- reject.
 *
 * The pre-check is a UX gate only. `activate_administrator()` remains the sole
 * authorization step and re-checks the allowlist against the caller's verified
 * auth email, so nothing here can widen access.
 */
export function useAdminLogin() {
  return useMutation({
    mutationFn: async (email: string): Promise<void> => {
      const normalized = normalizeEmail(email);
      const supabase = getSupabaseClient();

      // Rate-limit the allowlist pre-check and the activation email it can
      // trigger. Both are email-address-bound operations.
      const rateLimit = await enforceAuthRateLimit({
        data: { email: normalized, operation: "admin_allowlist" },
      });
      if (!rateLimit.allowed) {
        throw new Error(RATE_LIMITED_MESSAGE);
      }

      // 1. Ask the database. public.admin_allowlist has no client SELECT
      //    policy, so this RPC is the only way the browser can learn the answer.
      const { data: allowlisted, error: checkError } = await supabase.rpc(
        "check_administrator_allowlist",
        { candidate_email: normalized },
      );
      if (checkError) throw checkError;

      // 2. Not on the allowlist: stop here, and stop *silently*. Deliberately
      //    no signInWithOtp() call -- otherwise shouldCreateUser would create an
      //    account (and a profile row) for an address that may not be an
      //    administrator. Deliberately no distinguishable return value either:
      //    the caller must not be able to tell this branch from the success
      //    branch.
      if (!allowlisted) return;

      // 3. Allowlisted: request the activation link. shouldCreateUser stays
      //    true because an allowlisted teacher may not have an account yet.
      const { error } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
    },
  });
}

/**
 * PRD 5: completes the administrator handshake.
 *
 * The whole chain is
 *
 *   Administrator Login -> emailed link -> Supabase confirms the email
 *   -> authenticated session -> activate_administrator() -> profile.account_type
 *
 * This was previously a hook that nothing called, so the role could never
 * actually be granted: an allowlisted teacher could sign in and stay a student
 * forever. It is now a plain async function invoked by AuthProvider, which
 * wraps every route -- the emailed link may land on any URL (the client sets
 * detectSessionInUrl), so activation cannot be tied to a single page.
 *
 * Everything security-relevant happens in the database, not here. The RPC
 * takes no arguments, derives the identity from auth.uid(), and grants nothing
 * unless the caller's *verified* auth email matches an active
 * public.admin_allowlist row. The client cannot choose an email, a target user
 * or an account type; it can only ask "may I activate?".
 *
 * Returns "activated" when the caller is now an administrator, "refused" when
 * the email is simply not allowlisted (the normal outcome for a student), and
 * throws on any other error.
 */
export async function requestAdministratorActivation(): Promise<"activated" | "refused"> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("activate_administrator");
  if (!error) return "activated";
  if (/allowlist/i.test(error.message)) return "refused";
  throw error;
}

/**
 * The signed-in user's id.
 *
 * Three routes used to declare this query and its `getUser()` round trip
 * independently. They share the `["viewer-id"]` key so only one request is in
 * flight, and the long staleTime keeps later route mounts from asking the auth
 * server again -- the id only changes on sign-in/sign-out, and sign-out clears
 * the whole query cache.
 */
export function useViewerId() {
  return useQuery({
    queryKey: ["viewer-id"],
    queryFn: async (): Promise<string | null> => {
      const supabase = getSupabaseClient();
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    },
    staleTime: 5 * 60_000,
  });
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; password?: string }) => {
      const normalizedEmail = normalizeEmail(input.email);
      const supabase = getSupabaseClient();

      if (input.password) {
        // Password login does not trigger an auth email, so no email-rate
        // limit applies. Supabase Auth's own brute-force protections apply.
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: input.password,
        });
        if (error) throw error;
      } else {
        // Magic-link sign-in sends an email: rate-limit it.
        const rateLimit = await enforceAuthRateLimit({
          data: { email: normalizedEmail, operation: "magic_link" },
        });
        if (!rateLimit.allowed) {
          throw new Error(RATE_LIMITED_MESSAGE);
        }

        const { error } = await supabase.auth.signInWithOtp({
          email: normalizedEmail,
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

/**
 * One-click Google sign-in / sign-up (PRD 4).
 *
 * There is no email to rate-limit here and no password to breach-check: Google
 * authenticates the person, and Supabase Auth turns the returned profile into a
 * session. The allowlist is never consulted -- a Google session is still an
 * ordinary student session until `activate_administrator()` says otherwise (see
 * AuthProvider), so this neither grants nor requests administrator access.
 *
 * The call resolves after the browser has been handed to Google; the app is no
 * longer running, so there is no cache to invalidate. If the user cancels,
 * Google/Supabase send them back with an `error` parameter, which the login page
 * reports (see readOAuthError).
 */
export function useGoogleSignIn() {
  return useMutation({
    mutationFn: async (input?: { redirectTo?: string }): Promise<void> => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: OAUTH_PROVIDER,
        options: {
          redirectTo: input?.redirectTo ?? oauthRedirectUrl(),
          // Always show the chooser: a shared school laptop must not silently
          // reuse whoever signed into Google last.
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
    },
  });
}

export function useSignUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; password: string; fullName?: string }) => {
      const normalizedEmail = normalizeEmail(input.email);

      // Rate-limit signup before any Supabase Auth call that sends an email.
      // Server-enforced: the check runs in a server function and hits the
      // database, not in React state or a disabled button.
      const rateLimit = await enforceAuthRateLimit({
        data: { email: normalizedEmail, operation: "signup" },
      });
      if (!rateLimit.allowed) {
        throw new Error(RATE_LIMITED_MESSAGE);
      }

      // Signup is the first point a user chooses a password. The check must
      // finish before Supabase Auth creates the account, so a breached
      // password is never stored.
      await assertPasswordNotBreached(input.password);

      const supabase = getSupabaseClient();
      const signUpOptions = input.fullName ? { data: { full_name: input.fullName } } : {};
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: input.password,
        ...(Object.keys(signUpOptions).length ? { options: signUpOptions } : {}),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["auth"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      void variables;
    },
  });
}

/**
 * Change the signed-in user's password.
 *
 * There is no password in the sign-in path to check: existing credentials are
 * only verified there. Any flow that lets a user choose a new password --
 * including a future recovery flow that establishes a session and calls
 * updateUser -- must go through this guard first.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: async (input: { password: string }) => {
      await assertPasswordNotBreached(input.password);

      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password: input.password });
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

/**
 * Canonical form of the discovery filters.
 *
 * React Query keys are hashed, so two call sites that ask the same question
 * must build the same object or they become two separate requests. The Main
 * page used to call `search_clubs` twice with identical arguments -- once for
 * the discovery list and once for recommendations -- because their keys
 * differed even though their arguments did not. Normalising here keeps those
 * callers on one cache entry, so the RPC runs once.
 */
function normalizeClubFilters(filters: ClubFilters) {
  return {
    search: filters.search?.trim() || null,
    type: filters.type ?? null,
    field: filters.field ?? null,
    commitment: filters.commitment ?? null,
  };
}

type NormalizedClubFilters = ReturnType<typeof normalizeClubFilters>;

/** Stable reference: `select` identity must not change per render. */
function selectRecommended(clubs: ClubSearchResult[]): ClubSearchResult[] {
  return clubs.filter((club) => club.match_reasons.length > 0);
}

async function fetchClubSearch(filters: NormalizedClubFilters): Promise<ClubSearchResult[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("search_clubs", {
    search_text: filters.search,
    filter_type: filters.type,
    filter_field: filters.field,
    filter_commitment: filters.commitment,
  });
  if (error) throw error;
  return data ?? [];
}

export function useClubSearch(filters: ClubFilters = {}) {
  const normalized = normalizeClubFilters(filters);
  return useQuery({
    queryKey: ["clubs", "search", normalized],
    queryFn: () => fetchClubSearch(normalized),
  });
}

/** PRD 21: recommendations carry their reasons so the UI can explain them. */
export function useRecommendedClubs() {
  const normalized = normalizeClubFilters({});
  return useQuery({
    queryKey: ["clubs", "search", normalized],
    queryFn: () => fetchClubSearch(normalized),
    // The recommendation list is the same discovery result, ranked by match
    // reason. Selecting here keeps the shared cache entry untouched.
    select: selectRecommended,
  });
}

export function useMyClubs() {
  return useQuery({
    queryKey: ["clubs", "mine"],
    queryFn: async (): Promise<Array<ClubRow & { membership: MembershipRow }>> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("memberships")
        .select("*, clubs(id, name, description, type, meeting_day, meeting_time, room, commitment)")
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
        .select("*, profiles(id, full_name, grade, avatar_url)")
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
        .select("*, profiles(id, full_name, grade, avatar_url)")
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

/**
 * PRD 13: the club calendar only needs upcoming events. Fetching every
 * historical event and filtering them in React wastes network transfer and
 * client compute on every page load.
 *
 * This hook performs the upcoming-event filter in Postgres using the existing
 * `events_club_time_idx (club_id, starts_at)` index, so only rows the calendar
 * actually displays are transferred. `useClubEvents()` is left untouched so the
 * events page retains its full historical behaviour.
 */
export function useClubUpcomingEvents(clubId: string) {
  return useQuery({
    queryKey: ["club", clubId, "events", "upcoming"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("club_id", clubId)
        .gte("starts_at", new Date().toISOString())
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

/**
 * PRD 36: AppShell only needs the unread count for its header badge, not the
 * full notification records. This count-only query fetches no rows --
 * PostgREST returns just the count via a HEAD request -- and the existing
 * partial index `notifications_user_unread_idx (user_id, created_at desc)
 * where read_at is null` serves it efficiently.
 *
 * RLS (`notifications_select_own: user_id = auth.uid()`) scopes results to the
 * authenticated user, so no client-side user filtering is needed.
 */
export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: async (): Promise<number> => {
      const supabase = getSupabaseClient();
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
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
    onSuccess: () => {
      // `["notifications"]` is a key prefix of `["notifications",
      // "unread-count"]`, so invalidating it already refreshes the count.
      // Invalidate both explicitly so the badge and the full list stay in
      // sync even if the key structure changes later.
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Administrator (PRD 37)
// ---------------------------------------------------------------------------

export function useAdminClubOverview(enabled = true) {
  return useQuery({
    queryKey: ["admin", "clubs"],
    queryFn: async (): Promise<AdminClubOverviewRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc("admin_club_overview");
      if (error) throw error;
      return data ?? [];
    },
    // Only administrators can read this; without the guard every signed-in
    // visitor to /admin fired an RPC that RLS then rejected (and retried).
    enabled,
  });
}

// ---------------------------------------------------------------------------
// Session typing helper
// ---------------------------------------------------------------------------

/**
 * Normalize a Supabase Auth error into a user-safe message.
 *
 * Never echo the upstream error verbatim: messages like "User already
 * registered" or "Invalid login credentials" reveal whether an email address
 * is known to the auth system. Return a generic message instead so the UI
 * cannot be used as an email-enumeration oracle.
 *
 * Legitimate users still get actionable guidance (verify your email, check
 * your password) without confirming or denying the existence of any account.
 */
export function normalizeAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  // Signup: email already has an account (confirmed or not). Do not confirm
  // or deny; tell the user to sign in instead.
  if (
    lower.includes("already registered") ||
    lower.includes("user already exists") ||
    lower.includes("already exists")
  ) {
    return "An account already exists for this email address. Please sign in instead.";
  }

  // Password login: wrong email or wrong password. Same message either way.
  if (
    lower.includes("invalid login") ||
    lower.includes("incorrect password") ||
    lower.includes("invalid credentials")
  ) {
    return "Unable to sign in. Please check your email and password.";
  }

  // Email not yet confirmed: actionable but does not reveal whether another
  // email would behave differently.
  if (lower.includes("email not confirmed") || lower.includes("not confirmed")) {
    return "Please verify your email address before signing in. Check your inbox for the verification link.";
  }

  // Rate limit from Supabase Auth or our own rate limiter.
  if (lower.includes("too many") || lower.includes("rate limit")) {
    return RATE_LIMITED_MESSAGE;
  }

  return "Something went wrong. Please try again.";
}

export type { Session, Json };
