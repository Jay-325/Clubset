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
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return null;

      const [{ data: club, error: clubError }, { data: membership }] = await Promise.all([
        supabase.from("clubs").select("*").eq("id", clubId).single(),
        supabase
          .from("memberships")
          .select("*")
          .eq("club_id", clubId)
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      if (clubError) throw clubError;
      if (!club) return null;

      const { data: assignments } = await supabase
        .from("role_assignments")
        .select("leadership_roles(permissions)")
        .eq("club_id", clubId)
        .eq("user_id", userId);

      const permissions: ClubPermission[] = [];
      for (const assignment of assignments ?? []) {
        const role = (
          assignment as unknown as {
            leadership_roles: { permissions: ClubPermission[] } | null;
          }
        ).leadership_roles;
        if (role) permissions.push(...role.permissions);
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("id", userId)
        .single();

      const { data: linkedAdmin } = await supabase
        .from("club_administrators")
        .select("administrator_id")
        .eq("club_id", clubId)
        .eq("administrator_id", userId)
        .maybeSingle();

      return {
        club,
        membership: membership ?? null,
        permissions: [...new Set(permissions)],
        isAdministrator: profile?.account_type === "administrator",
        isLinkedAdministrator: Boolean(linkedAdmin),
      };
    },
    enabled: Boolean(clubId),
  });
}
