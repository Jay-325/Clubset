import { createContext, use, useCallback, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";

import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
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
