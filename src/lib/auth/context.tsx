import { createContext, use, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";

import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { requestAdministratorActivation } from "@/lib/queries";
import type { ProfileRow } from "@/lib/types/database";

// ---------------------------------------------------------------------------
// Auth context
// ---------------------------------------------------------------------------

interface AuthContextValue {
  session: Session | null;
  profile: ProfileRow | null;
  isLoading: boolean;
  isConfigured: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ["auth", "session"],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return null;
      const supabase = getSupabaseClient();
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
    staleTime: 5_000,
  });

  const session = sessionQuery.data ?? null;
  const userId = session?.user.id ?? null;

  // The profile is the app's view of the user. Account type lives in the
  // database, never in local state (PRD 5, 40).
  const profileQuery = useQuery({
    queryKey: ["profile", userId],
    queryFn: async (): Promise<ProfileRow | null> => {
      if (!userId) return null;
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();

      if (error) throw error;
      return data;
    },
    enabled: Boolean(userId),
  });

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    queryClient.clear();
  }, [queryClient]);

  const refreshProfile = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["profile"] });
  }, [queryClient]);

  // --------------------------------------------------------------------------
  // Administrator activation (PRD 5).
  //
  // The whole chain is:
  //
  //   Administrator Login -> emailed link -> Supabase confirms the email
  //   -> authenticated session -> activate_administrator() -> account_type
  //
  // This runs here, in the provider that wraps EVERY route, rather than on the
  // login page alone. The emailed link may land on any URL (the client sets
  // detectSessionInUrl), so a page-local trigger would silently never fire and
  // the teacher would stay a student.
  //
  // It is safe to run on every signed-in session:
  //   * it is skipped entirely once profile.account_type is already
  //     'administrator';
  //   * it only runs for an email-confirmed user (the database independently
  //     refuses unverified callers);
  //   * activate_administrator() takes no arguments, derives identity from
  //     auth.uid(), and grants nothing unless the caller's verified email is on
  //     public.admin_allowlist. A non-allowlisted user gets an error and stays
  //     a student. Nothing here can widen that.
  // --------------------------------------------------------------------------
  const activationAttempted = useRef(false);
  useEffect(() => {
    if (!userId) {
      activationAttempted.current = false;
      return;
    }
    const profile = profileQuery.data;
    if (!profile || profile.account_type === "administrator") return;
    if (activationAttempted.current) return;

    let cancelled = false;
    const attempt = async () => {
      const supabase = getSupabaseClient();
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user || !(user.email_confirmed_at ?? user.confirmed_at)) return;
      if (cancelled) return;

      activationAttempted.current = true;
      try {
        await requestAdministratorActivation();
      } catch (error) {
        // "Not on the allowlist" is the expected result for an ordinary
        // student: requestAdministratorActivation() resolves that case as
        // "refused", so anything reaching here is a genuine failure worth
        // surfacing to the console (never to the student's screen).
        console.warn(
          "administrator activation failed:",
          error instanceof Error ? error.message : String(error),
        );
      }
      if (!cancelled) await queryClient.invalidateQueries({ queryKey: ["profile"] });
    };

    void attempt();
    return () => {
      cancelled = true;
    };
  }, [userId, profileQuery.data, queryClient]);

  // The context value is a fresh object on every render, which would re-render
  // every consumer in the tree (the shell, every page). Memoising on the values
  // that actually change keeps that to auth transitions only.
  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile: profileQuery.data ?? null,
      isLoading: sessionQuery.isLoading || profileQuery.isLoading,
      isConfigured: isSupabaseConfigured(),
      signOut,
      refreshProfile,
    }),
    [
      session,
      profileQuery.data,
      sessionQuery.isLoading,
      profileQuery.isLoading,
      signOut,
      refreshProfile,
    ],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const context = use(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return context;
}

/** True once we know for certain the visitor is not signed in. */
export function useIsSignedOut(): boolean {
  const { session, isLoading } = useAuth();
  return !isLoading && session === null;
}
