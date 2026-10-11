/**
 * Permission helpers for the UI.
 *
 * These decide what to SHOW, never what a user may DO -- every action is
 * re-checked by RLS and RPCs in Postgres (PRD 41, 53.20). A forged request
 * here would fail server-side regardless.
 */

import type { ClubPermission, ClubRow, MembershipRow } from "@/lib/types/database";

export interface ClubContext {
  club: ClubRow;
  membership: MembershipRow | null;
  /** Permission slugs from the roles this user holds in this club. */
  permissions: ClubPermission[];
  isAdministrator: boolean;
  /** Administrator linked directly to this club (PRD 38). */
  isLinkedAdministrator: boolean;
}

/**
 * Progressive complexity (PRD 45): a member sees announcements, chat,
 * calendar, RSVP and funds. Management areas appear only when a permission
 * is actually held, so nobody is shown controls they cannot use.
 */
export function can(permissions: ClubPermission[], needed: ClubPermission): boolean {
  return permissions.includes(needed);
}

export function isLeader(context: ClubContext): boolean {
  return context.permissions.length > 0 || context.isLinkedAdministrator;
}

export function isActiveMember(context: ClubContext): boolean {
  return context.membership?.status === "active";
}

/**
 * PRD 10/23: members see announcements, chat, and permitted funds. Every
 * management surface is permission-gated.
 */
export function managementSections(
  context: ClubContext,
): Array<{ key: string; label: string; path: string; permission: ClubPermission | null }> {
  const base = `${context.club.id}`;
  const sections: Array<{
    key: string;
    label: string;
    path: string;
    permission: ClubPermission | null;
  }> = [
    { key: "home", label: "Home", path: `/clubs/${base}`, permission: null },
    {
      key: "announcements",
      label: "Announcements",
      path: `/clubs/${base}/announcements`,
      permission: null,
    },
    { key: "chat", label: "Chat", path: `/clubs/${base}/chat`, permission: null },
    { key: "calendar", label: "Calendar", path: `/clubs/${base}/calendar`, permission: null },
    { key: "funds", label: "Funds", path: `/clubs/${base}/funds`, permission: null },
    {
      key: "members",
      label: "Members",
      path: `/clubs/${base}/members`,
      permission: "manage_membership",
    },
    { key: "events", label: "Events", path: `/clubs/${base}/events`, permission: "manage_events" },
    {
      key: "attendance",
      label: "Attendance",
      path: `/clubs/${base}/attendance`,
      permission: "manage_attendance",
    },
    { key: "forms", label: "Forms", path: `/clubs/${base}/forms`, permission: "manage_forms" },
    { key: "data", label: "Data", path: `/clubs/${base}/data`, permission: "manage_data_tables" },
    {
      key: "leadership",
      label: "Leadership",
      path: `/clubs/${base}/leadership`,
      permission: "manage_leadership",
    },
    {
      key: "settings",
      label: "Settings",
      path: `/clubs/${base}/settings`,
      permission: "manage_settings",
    },
  ];
  return sections.filter(
    (section) => section.permission === null || can(context.permissions, section.permission),
  );
}

/**
 * PRD 11: the dashboard prioritises actions over technical settings, so the
 * order here is deliberate -- most common first.
 */
export function quickActions(context: ClubContext): Array<{
  key: string;
  label: string;
  description: string;
  path: string;
  permission: ClubPermission;
}> {
  const base = `/clubs/${context.club.id}`;
  const actions: Array<{
    key: string;
    label: string;
    description: string;
    path: string;
    permission: ClubPermission;
  }> = [
    {
      key: "create_event",
      label: "Create Event",
      description: "Add a meeting or activity",
      path: `${base}/events/new`,
      permission: "manage_events",
    },
    {
      key: "announce",
      label: "Send Announcement",
      description: "Tell the whole club something",
      path: `${base}/announcements?new=1`,
      permission: "send_announcements",
    },
    {
      key: "members",
      label: "View Members",
      description: "See who is in the club",
      path: `${base}/members`,
      permission: "manage_membership",
    },
    {
      key: "join_requests",
      label: "Review Join Requests",
      description: "Accept or decline new members",
      path: `${base}/members?tab=requests`,
      permission: "manage_membership",
    },
    {
      key: "attendance",
      label: "Record / Review Attendance",
      description: "Confirm who actually came",
      path: `${base}/attendance`,
      permission: "manage_attendance",
    },
    {
      key: "create_form",
      label: "Create Form",
      description: "Collect information from members",
      path: `${base}/forms/new`,
      permission: "manage_forms",
    },
    {
      key: "funds",
      label: "View Funds",
      description: "See the club balance",
      path: `${base}/funds`,
      permission: "manage_finances",
    },
    {
      key: "add_expense",
      label: "Add Expense",
      description: "Record something the club bought",
      path: `${base}/funds?new=expense`,
      permission: "manage_finances",
    },
    {
      key: "data_table",
      label: "Create Data Table",
      description: "Start from a template",
      path: `${base}/data/new`,
      permission: "manage_data_tables",
    },
    {
      key: "leadership_apps",
      label: "Manage Leadership Applications",
      description: "Review who wants to lead",
      path: `${base}/leadership`,
      permission: "manage_leadership",
    },
  ];
  return actions.filter((action) => can(context.permissions, action.permission));
}
