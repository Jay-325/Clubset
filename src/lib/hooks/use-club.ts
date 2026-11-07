import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { ClubContext } from "@/lib/auth/permissions";
import type { ClubPermission } from "@/lib/types/database";

/**
 * Loads everything a club page needs in one query: the club, this user's
 * membership, and the permission slugs their roles grant.
 *
 * Permissions are read from the role_assignments rows the database already
 * exposes, so the UI's idea of "what can this person do" comes from the same
 * source of truth the RLS policies use.
 */
export function useClubContext(clubId: string) {
  return useQuery({
    queryKey: ["club-context", clubId],
    queryFn: async (): Promise<ClubContext | null> => {
      const supabase = getSupabaseClient();

      // Two round trips, not five. The club read does not depend on the signed
      // in user, so it runs alongside `getUser()`. The three permission reads
      // do not depend on each other either, so they run together in a second
      // batch. Every club page gates its first paint on this hook, so each
      // removed round trip is removed from the critical path of all of them.
      const [{ data: userData }, clubResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("clubs").select("*").eq("id", clubId).single(),
      ]);

      const userId = userData.user?.id;
      if (!userId) return null;

      const { data: club, error: clubError } = clubResult;
      if (clubError) throw clubError;
      if (!club) return null;

      const [
        { data: membership },
        { data: assignments },
        { data: isAdmin },
        { data: linkedAdmin },
      ] = await Promise.all([
        supabase
          .from("memberships")
          .select("*")
          .eq("club_id", clubId)
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("role_assignments")
          .select("leadership_roles(permissions)")
          .eq("club_id", clubId)
          .eq("user_id", userId),
        supabase.rpc("is_user_administrator", { target_user_id: userId }),
        supabase
          .from("club_administrators")
          .select("administrator_id")
          .eq("club_id", clubId)
          .eq("administrator_id", userId)
          .maybeSingle(),
      ]);

      const permissions: ClubPermission[] = [];
      for (const assignment of assignments ?? []) {
        const role = (
          assignment as unknown as {
            leadership_roles: { permissions: ClubPermission[] } | null;
          }
        ).leadership_roles;
        if (role) permissions.push(...role.permissions);
      }

      return {
        club,
        membership: membership ?? null,
        permissions: [...new Set(permissions)],
        isAdministrator: Boolean(isAdmin),
        isLinkedAdministrator: Boolean(linkedAdmin),
      };
    },
    enabled: Boolean(clubId),
  });
}
