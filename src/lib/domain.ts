/**
 * Product vocabulary and preset values.
 *
 * Everything here is plain-language on purpose (PRD 44). These lists are what
 * the UI offers instead of free-text configuration, so a student never has to
 * invent a category or learn what a "column type" is.
 */

import type {
  AttendanceStatus,
  ClubPermission,
  ClubStatus,
  CommitmentLevel,
  ClubType,
  EventKind,
  EventPriority,
  RequirementKind,
} from "@/lib/types/database";

// ---------------------------------------------------------------------------
// PRD 4: preset interests + student-defined additions
// ---------------------------------------------------------------------------

export const PRESET_INTERESTS = [
  "Business",
  "Art",
  "Environment",
  "Technology",
  "Sports",
  "Volunteering",
  "Music",
  "Academic",
  "Gaming",
  "Media",
  "Health & Wellness",
  "Community Service",
] as const;

// ---------------------------------------------------------------------------
// PRD 7: club types
// ---------------------------------------------------------------------------

export const CLUB_TYPES: ReadonlyArray<{ value: ClubType; label: string; hint: string }> = [
  { value: "volunteer", label: "Volunteer", hint: "Helps the school or community" },
  { value: "competitive", label: "Competitive", hint: "Competes in tournaments or finals" },
  { value: "recreational", label: "Recreational", hint: "Meets for fun and practice" },
];

export const CLUB_TYPE_LABELS: Record<ClubType, string> = {
  volunteer: "Volunteer",
  competitive: "Competitive",
  recreational: "Recreational",
};

// ---------------------------------------------------------------------------
// PRD 7/14: commitment
// ---------------------------------------------------------------------------

export const COMMITMENT_LEVELS: ReadonlyArray<{
  value: CommitmentLevel;
  label: string;
  hours: string;
}> = [
  { value: "low", label: "Low", hours: "Under 1 hour a week" },
  { value: "medium", label: "Medium", hours: "1-2 hours a week" },
  { value: "high", label: "High", hours: "3+ hours a week" },
];

export const COMMITMENT_LABELS: Record<CommitmentLevel, string> = {
  low: "Low commitment",
  medium: "Medium commitment",
  high: "High commitment",
};

export const WEEKLY_HOUR_OPTIONS = [0.5, 1, 2, 3, 4, 5, 8, 10];

// ---------------------------------------------------------------------------
// PRD 7: meeting days/times
// ---------------------------------------------------------------------------

export const MEETING_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const COMMON_MEETING_TIMES = [
  { label: "Before school (7:30 AM)", value: "07:30" },
  { label: "Morning (8:00 AM)", value: "08:00" },
  { label: "Lunch (12:00 PM)", value: "12:00" },
  { label: "After school (3:30 PM)", value: "15:30" },
  { label: "After school (4:00 PM)", value: "16:00" },
  { label: "Evening (6:00 PM)", value: "18:00" },
] as const;

// ---------------------------------------------------------------------------
// PRD 7: club status
// ---------------------------------------------------------------------------

export const CLUB_STATUS_LABELS: Record<ClubStatus, string> = {
  draft: "Draft",
  awaiting_student_verification: "Waiting for student verification",
  awaiting_administrator_verification: "Waiting for administrator approval",
  approved: "Active",
  rejected: "Rejected",
  archived: "Archived",
};

/** Step shown to the founder while the 3-student requirement is unmet (PRD 7). */
export const REQUIRED_STUDENT_VERIFICATIONS = 3;

// ---------------------------------------------------------------------------
// PRD 10: permissions
// ---------------------------------------------------------------------------

export const PERMISSION_LABELS: Record<ClubPermission, string> = {
  manage_settings: "Club settings",
  manage_membership: "Members & join requests",
  manage_events: "Events",
  manage_attendance: "Attendance",
  manage_finances: "Funds",
  manage_forms: "Forms",
  manage_data_tables: "Data tables",
  manage_leadership: "Leadership",
  send_announcements: "Announcements",
  moderate_chat: "Moderate chat",
};

/** Sensible starting sets so a new club is useful immediately (PRD 52). */
export const SUGGESTED_ROLES: ReadonlyArray<{
  name: string;
  description: string;
  permissions: ClubPermission[];
}> = [
  {
    name: "President",
    description: "Runs the club and keeps everything on track",
    permissions: [
      "manage_settings",
      "manage_membership",
      "manage_events",
      "manage_attendance",
      "manage_leadership",
      "send_announcements",
      "moderate_chat",
      "manage_finances",
    ],
  },
  {
    name: "Vice President",
    description: "Supports the president and steps in when needed",
    permissions: ["manage_membership", "manage_events", "send_announcements", "moderate_chat"],
  },
  {
    name: "Treasurer",
    description: "Keeps track of club money",
    permissions: ["manage_finances"],
  },
  {
    name: "Event Coordinator",
    description: "Plans events and keeps track of who came",
    permissions: ["manage_events", "manage_attendance"],
  },
  {
    name: "Marketing Manager",
    description: "Gets the word out and manages sign-up forms",
    permissions: ["send_announcements", "manage_forms", "manage_data_tables"],
  },
  {
    name: "Volunteer Coordinator",
    description: "Organizes volunteers and their hours",
    permissions: ["manage_events", "manage_data_tables", "send_announcements"],
  },
  {
    name: "Social Media Manager",
    description: "Runs the club's online presence",
    permissions: ["send_announcements", "manage_forms"],
  },
];

export const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as ClubPermission[];

// ---------------------------------------------------------------------------
// PRD 13/14: events
// ---------------------------------------------------------------------------

export const EVENT_KINDS: ReadonlyArray<{ value: EventKind; label: string }> = [
  { value: "meeting", label: "Meeting" },
  { value: "event", label: "Event" },
  { value: "deadline", label: "Deadline" },
  { value: "other", label: "Other" },
];

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  meeting: "Meeting",
  event: "Event",
  deadline: "Deadline",
  other: "Other",
};

export const EVENT_PRIORITY_LABELS: Record<EventPriority, string> = {
  low: "Low priority",
  normal: "Normal",
  high: "High priority",
};

/** Used when a club has not set its own default (PRD 14). */
export const DEFAULT_MEETING_DURATION_MINUTES = 60;

// ---------------------------------------------------------------------------
// PRD 16/18: attendance vocabulary
//
// The words differ per club ("No-Show" vs "Absent"); the underlying state is
// always one of these four.
// ---------------------------------------------------------------------------

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  attended: "Attended",
  did_not_attend: "Did not attend",
  rsvp_pending: "RSVP — not reviewed yet",
  not_applicable: "Not applicable",
};

export const ATTENDANCE_STATUS_HINTS: Record<AttendanceStatus, string> = {
  attended: "Counted as attended",
  did_not_attend: "Not counted — the RSVP did not count because the student was absent",
  rsvp_pending: "RSVPed, but a leader has not confirmed this yet",
  not_applicable: "No RSVP and no attendance record",
};

// ---------------------------------------------------------------------------
// PRD 24: finances
// ---------------------------------------------------------------------------

export const INCOME_CATEGORIES = [
  "Dues",
  "Fundraiser",
  "Donation",
  "Sponsorship",
  "Grant",
  "Other",
] as const;

export const EXPENSE_CATEGORIES = [
  "Supplies",
  "Equipment",
  "Food",
  "Transportation",
  "Competition Fees",
  "Venue",
  "Printing",
  "Other",
] as const;

// ---------------------------------------------------------------------------
// PRD 25: forms
// ---------------------------------------------------------------------------

export const QUESTION_TYPE_LABELS = {
  short_answer: "Short answer",
  long_answer: "Long answer",
  multiple_choice: "Multiple choice",
  checkbox: "Checkboxes",
  yes_no: "Yes / No",
  number: "Number",
  date: "Date",
} as const;

// ---------------------------------------------------------------------------
// PRD 26: data-table templates
// ---------------------------------------------------------------------------

export interface TableTemplate {
  key: string;
  name: string;
  description: string;
  /** Shown in the "what are you tracking?" picker (PRD 28). */
  icon: string;
}

export const TABLE_TEMPLATES: readonly TableTemplate[] = [
  {
    key: "attendance",
    name: "Attendance",
    description: "Track who came to each meeting",
    icon: "check",
  },
  {
    key: "event_signups",
    name: "Event Signups",
    description: "Collect signups for an event",
    icon: "users",
  },
  {
    key: "volunteer_hours",
    name: "Volunteer Hours",
    description: "Log hours your members volunteered",
    icon: "clock",
  },
  {
    key: "competition_participants",
    name: "Competition Participants",
    description: "Track your team or roster",
    icon: "trophy",
  },
  {
    key: "fundraiser_tracking",
    name: "Fundraiser Tracking",
    description: "See how much each fundraiser raised",
    icon: "target",
  },
  {
    key: "custom",
    name: "Something else",
    description: "Describe what you want to track and we will propose a structure",
    icon: "table",
  },
] as const;

// ---------------------------------------------------------------------------
// PRD 32: eligibility requirements
// ---------------------------------------------------------------------------

export const REQUIREMENT_LABELS: Record<RequirementKind, string> = {
  min_days_in_club: "Be in the club for at least (days)",
  min_attendance_rate: "Attend at least (% of meetings)",
  min_events_attended: "Attend at least (meetings)",
  min_volunteer_hours: "Log at least (volunteer hours)",
};

/**
 * Attendance-based requirements read from FINALIZED attendance only, so a
 * student cannot qualify by RSVPs they never honoured (PRD 34, 53.14).
 */
export const REQUIREMENTS_USE_FINALIZED_ATTENDANCE: RequirementKind[] = [
  "min_attendance_rate",
  "min_events_attended",
];

// ---------------------------------------------------------------------------
// PRD 4: grade levels
// ---------------------------------------------------------------------------

export const GRADE_LABELS = {
  freshman: "9th grade",
  sophomore: "10th grade",
  junior: "11th grade",
  senior: "12th grade",
  other: "Other",
} as const;
