import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
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
  const router = useRouter();

  // True once the administrator activation handshake (if any) for this session
  // can no longer change the account type: the account is already an
  // administrator, email is not confirmed (activation cannot run), or
  // activate_administrator() has already been attempted (activated or refused).
  // Post-sign-in routing waits for this so a teacher completing activation is
  // never sent to student onboarding mid-handshake.
  const [activationSettled, setActivationSettled] = useState(false);

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

  const profile = profileQuery.data ?? null;

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
      setActivationSettled(false);
      return;
    }
    const profile = profileQuery.data;
    if (!profile) return; // profile still resolving: activation cannot be assessed yet
    if (profile.account_type === "administrator") {
      setActivationSettled(true);
      return;
    }
    if (activationAttempted.current) {
      setActivationSettled(true);
      return;
    }

    let cancelled = false;
    const attempt = async () => {
      const supabase = getSupabaseClient();
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user || !(user.email_confirmed_at ?? user.confirmed_at)) {
        // Email is not confirmed: activation cannot run, so the handshake is
        // settled and post-sign-in routing may proceed.
        if (!cancelled) setActivationSettled(true);
        return;
      }
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
      if (!cancelled) {
        await queryClient.invalidateQueries({ queryKey: ["profile"] });
        setActivationSettled(true);
      }
    };

    void attempt();
    return () => {
      cancelled = true;
    };
  }, [userId, profileQuery.data, queryClient, setActivationSettled]);

  // --------------------------------------------------------------------------
  // Post-sign-in routing (PRD 4).
  //
  // Signed-in students whose profile is not yet complete are routed into
  // onboarding instead of being silently treated as ready. Administrators and
  // completed students continue to their destination (the saved `next` or home).
  // This is the single backstop for every route, so sign-in from /login, a
  // returned verification link, or token refresh all behave the same.
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!session || !profile) return;
    if (!activationSettled) return; // let the activation handshake finish first

    if (profile.account_type === "student" && !profile.onboarding_complete) {
      // Incomplete student profile: onboarding is the required next step.
      if (window.location.pathname !== "/onboarding") {
        void router.navigate({ to: "/onboarding" });
      }
      return;
    }

    // Complete student or administrator: continue to the intended destination.
    const target = sessionStorage.getItem("clubset_next") ?? "/";
    sessionStorage.removeItem("clubset_next");
    if (window.location.pathname !== target) {
      void router.navigate({ to: target });
    }
  }, [session, profile, activationSettled, router]);

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
