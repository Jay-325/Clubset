import { describe, expect, it } from "vitest";

import type { ClubPermission, ClubRow, MembershipRow } from "@/lib/types/database";
import { managementSections, quickActions } from "@/lib/auth/permissions";

function clubContext(permissions: ClubPermission[] = []) {
  return {
    club: { id: "00000000-0000-0000-0000-000000000001" } as unknown as ClubRow,
    membership: null as MembershipRow | null,
    permissions,
    isAdministrator: false,
    isLinkedAdministrator: false,
  };
}

// Every route that exists in src/routes (routeTree.gen.ts). Club-scoped routes
// are a single segment under /clubs/<id>; anything deeper (e.g. /events/new)
// is not a registered route and must not be linked to.
const TOP_ROUTES = new Set([
  "/",
  "/admin",
  "/calendar",
  "/clubs/new",
  "/login",
  "/mcp",
  "/my-clubs",
  "/notifications",
  "/onboarding",
  "/settings",
  "/signup",
]);

const CLUB_SUB_ROUTES = new Set([
  "",
  "announcements",
  "attendance",
  "calendar",
  "chat",
  "data",
  "events",
  "finance",
  "forms",
  "funds",
  "leadership",
  "members",
  "settings",
]);

function basePath(path: string): string {
  return (path.split("?")[0] ?? "").split("#")[0] ?? "";
}

function isValidRoute(path: string): boolean {
  const pathNoQuery = basePath(path);
  if (TOP_ROUTES.has(pathNoQuery)) return true;
  const match = pathNoQuery.match(/^\/clubs\/([^/]+)(\/(.+))?$/);
  if (!match) return false;
  const sub = match[3];
  if (sub === undefined) return true; // /clubs/<id>/ -> club home
  const segments = sub.split("/");
  return segments.length === 1 && CLUB_SUB_ROUTES.has(segments[0] ?? "");
}

const ALL_MANAGE_PERMISSIONS: ClubPermission[] = [
  "manage_settings",
  "manage_membership",
  "manage_events",
  "manage_attendance",
  "manage_finances",
  "manage_forms",
  "manage_data_tables",
  "manage_leadership",
  "send_announcements",
];

describe("permission link targets", () => {
  it("every management section links to a real route", () => {
    const context = clubContext(ALL_MANAGE_PERMISSIONS);
    for (const section of managementSections(context)) {
      expect(isValidRoute(section.path)).toBe(true);
    }
  });

  it("every quick action links to a real route", () => {
    const context = clubContext(ALL_MANAGE_PERMISSIONS);
    for (const action of quickActions(context)) {
      expect(isValidRoute(action.path)).toBe(true);
    }
  });

  it("no quick action carries a search param the target page ignores", () => {
    const context = clubContext(ALL_MANAGE_PERMISSIONS);
    for (const action of quickActions(context)) {
      expect(action.path).not.toContain("?tab=requests");
      expect(action.path).not.toContain("?new=expense");
    }
  });

  it("Finance is gated behind manage_finances and hidden from plain members", () => {
    const member = clubContext([]);
    expect(managementSections(member).find((section) => section.key === "finance")).toBeUndefined();

    const leader = clubContext(["manage_finances"]);
    const finance = managementSections(leader).find((section) => section.key === "finance");
    expect(finance).toBeDefined();
    expect(finance?.permission).toBe("manage_finances");
  });

  it("every quick action carries a leader permission", () => {
    const context = clubContext(ALL_MANAGE_PERMISSIONS);
    for (const action of quickActions(context)) {
      expect(action.permission).toBeDefined();
    }
  });
});
