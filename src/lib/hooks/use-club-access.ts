import { useClubContext } from "@/lib/hooks/use-club";
import { can } from "@/lib/auth/permissions";
import type { ClubPermission } from "@/lib/types/database";
import type { LeadershipRoleRow } from "@/lib/types/database";

/**
 * Hook for club pages that need access control.
 *
 * Returns the club context and a boolean indicating whether the viewer
 * has the given permission (or is an administrator).
 */
export function useClubAccess(clubId: string, permission?: ClubPermission) {
  const context = useClubContext(clubId);

  if (!context.data) {
    return {
      club: null,
      membership: null,
      permissions: [],
      isAdministrator: false,
      isLinkedAdministrator: false,
      mayManage: false,
      canManage: false,
    };
  }

  const { club, membership, permissions, isAdministrator, isLinkedAdministrator } =
    context.data;
  const canManage =
    (permission ? can(permissions, permission) : false) ||
    isLinkedAdministrator ||
    isAdministrator;

  return {
    club,
    membership,
    permissions,
    isAdministrator,
    isLinkedAdministrator,
    mayManage: canManage,
    canManage,
  };
}
