import { describe, expect, it } from "vitest";

import type { ClubContext } from "@/lib/auth/permissions";
import type { ClubPermission, ClubRow, MembershipRow } from "@/lib/types/database";
import { can, isActiveMember, isLeader, managementSections, quickActions } from "@/lib/auth/permissions";

function makeContext(overrides: Partial<ClubContext> = {}): ClubContext {
  const club: ClubRow = {
    id: "club-1",
    school_id: "school-1",
    name: "Test Club",
    description: "",
    type: "volunteer",
    commitment: "low",
    fields: [],
    room: "",
    meeting_day: null,
    meeting_time: null,
    status: "approved",
    founder_id: "user-1",
    welcome_message: null,
    welcome_banner_url: null,
    new_members_get_chat_history: false,
    rsvp_enabled_by_default: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
  return {
    club,
    membership: null,
    permissions: [],
    isAdministrator: false,
    isLinkedAdministrator: false,
    ...overrides,
  };
}

describe("can", () => {
  it("returns true when the permission is held", () => {
    expect(can(["manage_events"], "manage_events")).toBe(true);
  });
  it("returns false when the permission is not held", () => {
    expect(can(["manage_events"], "manage_membership")).toBe(false);
  });
  it("returns false for an empty permission list", () => {
    expect(can([], "manage_events")).toBe(false);
  });
});

describe("isLeader", () => {
  it("is true when any permission is held", () => {
    expect(isLeader(makeContext({ permissions: ["manage_events"] }))).toBe(true);
  });
  it("is true for a linked administrator even with no permissions", () => {
    expect(isLeader(makeContext({ isLinkedAdministrator: true }))).toBe(true);
  });
  it("is false with no permissions and no linked administrator", () => {
    expect(isLeader(makeContext({}))).toBe(false);
  });
});

describe("isActiveMember", () => {
  it("is true for active membership", () => {
    expect(isActiveMember(makeContext({ membership: { status: "active" } as MembershipRow }))).toBe(true);
  });
  it("is false for pending membership", () => {
    expect(isActiveMember(makeContext({ membership: { status: "pending" } as MembershipRow }))).toBe(false);
  });
  it("is false with no membership", () => {
    expect(isActiveMember(makeContext({}))).toBe(false);
  });
});

describe("managementSections", () => {
  it("excludes permission-gated sections the user cannot access", () => {
    const sections = managementSections(makeContext({ permissions: [] }));
    const keys = sections.map((s) => s.key);
    expect(keys).not.toContain("members");
    expect(keys).not.toContain("events");
    expect(keys).not.toContain("settings");
  });
  it("includes permission-gated sections the user can access", () => {
    const sections = managementSections(
      makeContext({ permissions: ["manage_membership", "manage_events"] }),
    );
    const keys = sections.map((s) => s.key);
    expect(keys).toContain("members");
    expect(keys).toContain("events");
    expect(keys).not.toContain("settings");
  });
  it("always includes ungated sections", () => {
    const sections = managementSections(makeContext({ permissions: [] }));
    const keys = sections.map((s) => s.key);
    expect(keys).toContain("home");
    expect(keys).toContain("announcements");
    expect(keys).toContain("chat");
    expect(keys).toContain("calendar");
    expect(keys).toContain("funds");
  });
});

describe("quickActions", () => {
  it("filters actions by held permission", () => {
    const actions = quickActions(makeContext({ permissions: ["manage_events"] }));
    const keys = actions.map((a) => a.key);
    expect(keys).toContain("create_event");
    expect(keys).not.toContain("members");
    expect(keys).not.toContain("create_form");
  });
  it("returns only actions the user is permitted to see", () => {
    const actions = quickActions(makeContext({ permissions: [] }));
    expect(actions).toHaveLength(0);
  });
});
