/**
 * Database types for Clubset.
 *
 * Normally produced by `supabase gen types typescript`. Hand-maintained here so
 * the repo is self-contained, and kept in sync with supabase/migrations/*.
 *
 * Regenerate with:  npx supabase gen types typescript --project-id <ref>
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type AccountType = "student" | "administrator";
export type GradeLevel = "freshman" | "sophomore" | "junior" | "senior" | "other";
export type ClubType = "volunteer" | "competitive" | "recreational";
export type CommitmentLevel = "low" | "medium" | "high";
export type EventPriority = "low" | "normal" | "high";
export type EventKind = "meeting" | "event" | "deadline" | "other";
export type ClubStatus =
  | "draft"
  | "awaiting_student_verification"
  | "awaiting_administrator_verification"
  | "approved"
  | "rejected"
  | "archived";
export type MembershipStatus = "pending" | "active" | "rejected" | "removed";
export type ClubPermission =
  | "manage_settings"
  | "manage_membership"
  | "manage_events"
  | "manage_attendance"
  | "manage_finances"
  | "manage_forms"
  | "manage_data_tables"
  | "manage_leadership"
  | "send_announcements"
  | "moderate_chat";
export type VerificationKind = "founder" | "verifier";
export type RsvpStatus = "going" | "maybe" | "not_going";
export type AttendanceStatus = "attended" | "did_not_attend" | "rsvp_pending" | "not_applicable";
export type AttendanceSource = "rsvp" | "manual";
export type TransactionType = "income" | "expense";
export type DuesStatus = "paid" | "not_paid" | "unknown";
export type FormStatus = "draft" | "published" | "closed";
export type QuestionType =
  "short_answer" | "long_answer" | "multiple_choice" | "checkbox" | "yes_no" | "number" | "date";
export type RequirementKind =
  "min_days_in_club" | "min_attendance_rate" | "min_events_attended" | "min_volunteer_hours";
export type ApplicationStatus =
  "draft" | "submitted" | "under_review" | "accepted" | "rejected" | "withdrawn";
export type NotificationType =
  | "join_request"
  | "join_accepted"
  | "event_reminder"
  | "rsvp"
  | "form_assignment"
  | "leadership_eligible"
  | "leadership_application"
  | "admin_club_change"
  | "announcement"
  | "role_message";

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export type SchoolRow = {
  id: string;
  name: string;
  slug: string;
  email_domain: string | null;
  settings: Json;
  created_at: string;
};

export type ProfileRow = {
  id: string;
  school_id: string | null;
  email: string;
  full_name: string;
  grade: GradeLevel | null;
  account_type: AccountType;
  interests: string[];
  commitment_hours: number | null;
  avatar_url: string | null;
  onboarding_complete: boolean;
  created_at: string;
  updated_at: string;
};

export type ClubRow = {
  id: string;
  school_id: string;
  name: string;
  description: string;
  type: ClubType;
  commitment: CommitmentLevel;
  fields: string[];
  room: string;
  meeting_day: string | null;
  meeting_time: string | null;
  status: ClubStatus;
  founder_id: string | null;
  welcome_message: string | null;
  welcome_banner_url: string | null;
  new_members_get_chat_history: boolean;
  rsvp_enabled_by_default: boolean;
  created_at: string;
  updated_at: string;
};

export type ClubAdministratorRow = {
  club_id: string;
  administrator_id: string;
  linked_by: string | null;
  linked_at: string;
};

export type ClubVerificationRow = {
  id: string;
  club_id: string;
  user_id: string;
  kind: VerificationKind;
  verified_at: string;
};

export type LeadershipRoleRow = {
  id: string;
  club_id: string;
  name: string;
  description: string;
  permissions: ClubPermission[];
  is_review_supervisor: boolean;
  sort_order: number;
  created_at: string;
};

export type RoleAssignmentRow = {
  id: string;
  role_id: string;
  club_id: string;
  user_id: string;
  assigned_by: string | null;
  assigned_at: string;
};

export type MembershipRow = {
  id: string;
  user_id: string;
  club_id: string;
  status: MembershipStatus;
  is_priority: boolean;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AnnouncementRow = {
  id: string;
  club_id: string;
  author_id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
};

export type EventRow = {
  id: string;
  club_id: string;
  created_by: string | null;
  title: string;
  description: string;
  kind: EventKind;
  location: string;
  starts_at: string;
  ends_at: string;
  priority: EventPriority;
  rsvp_enabled: boolean;
  attendance_finalized: boolean;
  created_at: string;
  updated_at: string;
};

export type RsvpRow = {
  id: string;
  event_id: string;
  user_id: string;
  status: RsvpStatus;
  created_at: string;
  updated_at: string;
};

export type AttendanceRow = {
  id: string;
  event_id: string;
  user_id: string;
  source: AttendanceSource;
  status: AttendanceStatus;
  note: string | null;
  finalized_by: string | null;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AttendanceCorrectionRow = {
  id: string;
  attendance_id: string;
  event_id: string;
  user_id: string;
  original_status: AttendanceStatus;
  new_status: AttendanceStatus;
  corrected_by: string | null;
  reason: string | null;
  created_at: string;
};

export type EventPreferenceRow = {
  user_id: string;
  club_id: string;
  is_preferred: boolean;
};

export type MessageRow = {
  id: string;
  club_id: string;
  sender_id: string;
  content: string;
  deleted_at: string | null;
  created_at: string;
};

export type ChatBannerRow = {
  id: string;
  club_id: string;
  content: string;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
};

export type RoleMessageRow = {
  id: string;
  role_id: string;
  club_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
};

export type TransactionRow = {
  id: string;
  club_id: string;
  created_by: string | null;
  type: TransactionType;
  amount: number;
  category: string;
  description: string;
  occurred_on: string;
  receipt_path: string | null;
  created_at: string;
  updated_at: string;
};

export type BudgetRow = {
  id: string;
  club_id: string;
  category: string;
  limit_amount: number;
  period_start: string;
  period_end: string;
  created_at: string;
};

export type DuesRow = {
  id: string;
  club_id: string;
  user_id: string;
  amount: number;
  status: DuesStatus;
  due_date: string | null;
  transaction_id: string | null;
  marked_paid_by: string | null;
  paid_at: string | null;
  updated_at: string;
};

export type FormRow = {
  id: string;
  club_id: string;
  created_by: string;
  title: string;
  description: string;
  status: FormStatus;
  closes_at: string | null;
  target_table_id: string | null;
  created_at: string;
  updated_at: string;
};

export type FormQuestionRow = {
  id: string;
  form_id: string;
  type: QuestionType;
  question: string;
  options: string[];
  required: boolean;
  sort_order: number;
};

export type FormResponseRow = {
  id: string;
  form_id: string;
  user_id: string;
  answers: Json;
  submitted_at: string;
};

export type DataTableRow = {
  id: string;
  club_id: string;
  created_by: string;
  name: string;
  template_key: string | null;
  description: string;
  created_at: string;
  updated_at: string;
};

export type DataTableColumnRow = {
  id: string;
  table_id: string;
  name: string;
  column_type: "text" | "number" | "date" | "boolean" | "member" | "event";
  sort_order: number;
  is_required: boolean;
};

export type DataTableDataRow = {
  id: string;
  table_id: string;
  data: Json;
  member_id: string | null;
  event_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EligibilityRequirementRow = {
  id: string;
  role_id: string;
  kind: RequirementKind;
  threshold: number;
  created_at: string;
};

export type LeadershipApplicationRow = {
  id: string;
  club_id: string;
  role_id: string;
  applicant_id: string;
  status: ApplicationStatus;
  applicant_context: Json;
  answers: Json;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ApplicationQuestionRow = {
  id: string;
  role_id: string;
  question: string;
  question_type: QuestionType;
  options: string[];
  required: boolean;
  sort_order: number;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  school_id: string | null;
  type: NotificationType;
  title: string;
  body: string;
  link_path: string | null;
  read_at: string | null;
  created_at: string;
};

export type AuditLogRow = {
  id: number;
  school_id: string | null;
  actor_id: string | null;
  action: string;
  object_type: string;
  object_id: string | null;
  details: Json;
  created_at: string;
};

// ---------------------------------------------------------------------------
// RPC return shapes
// ---------------------------------------------------------------------------

export type AttendanceStats = {
  attended: number;
  missed: number;
  attendance_rate: number | null;
};

export type EligibilityResult = {
  eligible: boolean;
  metrics: Partial<AttendanceStats> & { volunteer_hours: number; days_in_club: number };
  unmet: Array<{
    kind: string;
    label: string;
    required?: number;
    actual?: number | null;
  }>;
};

export type ClubSearchResult = {
  id: string;
  name: string;
  description: string;
  type: ClubType;
  commitment: CommitmentLevel;
  fields: string[];
  room: string;
  meeting_day: string | null;
  meeting_time: string | null;
  welcome_message: string | null;
  member_count: number;
  is_member: boolean;
  match_reasons: string[];
};

export type UpcomingEventResult = {
  id: string;
  club_id: string;
  club_name: string;
  title: string;
  kind: EventKind;
  location: string;
  starts_at: string;
  ends_at: string;
  priority: EventPriority;
  rsvp_enabled: boolean;
  my_rsvp: RsvpStatus | null;
  conflict_count: number;
};

export type ClubFinancesRow = {
  club_id: string;
  total_income: number;
  total_expenses: number;
  balance: number;
};

export type AdminClubOverviewRow = {
  club_id: string;
  name: string;
  status: ClubStatus;
  founder_name: string | null;
  member_count: number;
  administrator_count: number;
  created_at: string;
};

export type CalendarConflictRow = {
  event_id: string;
  conflicting_event_id: string;
  club_name: string;
  conflicting_club_name: string;
  starts_at: string;
  ends_at: string;
  is_preferred: boolean;
};

// ---------------------------------------------------------------------------
// Supabase Database interface
// ---------------------------------------------------------------------------

type TableDefinition<Row, Insert = Row, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type Database = {
  public: {
    Tables: {
      schools: TableDefinition<SchoolRow>;
      profiles: TableDefinition<
        ProfileRow,
        Optional<ProfileRow, "id" | "account_type" | "interests" | "onboarding_complete">
      >;
      admin_allowlist: TableDefinition<{
        id: string;
        school_id: string;
        email: string;
        full_name: string | null;
        created_by: string | null;
        revoked_at: string | null;
        created_at: string;
      }>;
      admin_verifications: TableDefinition<{
        id: string;
        user_id: string;
        school_id: string;
        allowlist_id: string | null;
        status: string;
        activated_at: string | null;
        created_at: string;
      }>;
      clubs: TableDefinition<
        ClubRow,
        Optional<
          ClubRow,
          | "id"
          | "description"
          | "commitment"
          | "fields"
          | "room"
          | "status"
          | "new_members_get_chat_history"
          | "rsvp_enabled_by_default"
        >
      >;
      club_administrators: TableDefinition<{
        club_id: string;
        administrator_id: string;
        linked_by: string | null;
        linked_at: string;
      }>;
      club_verifications: TableDefinition<
        {
          id: string;
          club_id: string;
          user_id: string;
          kind: VerificationKind;
          verified_at: string;
        },
        Optional<
          {
            id: string;
            club_id: string;
            user_id: string;
            kind: VerificationKind;
            verified_at: string;
          },
          "id" | "verified_at" | "user_id"
        >
      >;
      leadership_roles: TableDefinition<
        LeadershipRoleRow,
        Optional<
          LeadershipRoleRow,
          | "id"
          | "description"
          | "permissions"
          | "is_review_supervisor"
          | "sort_order"
          | "created_at"
        >
      >;
      role_assignments: TableDefinition<
        {
          id: string;
          role_id: string;
          club_id: string;
          user_id: string;
          assigned_by: string | null;
          assigned_at: string;
        },
        Optional<
          {
            id: string;
            role_id: string;
            club_id: string;
            user_id: string;
            assigned_by: string | null;
            assigned_at: string;
          },
          "id" | "assigned_by" | "assigned_at"
        >
      >;
      memberships: TableDefinition<
        MembershipRow,
        Optional<
          MembershipRow,
          "id" | "user_id" | "status" | "is_priority" | "joined_at" | "created_at" | "updated_at"
        >
      >;
      announcements: TableDefinition<
        AnnouncementRow,
        Optional<AnnouncementRow, "id" | "body" | "pinned" | "created_at">
      >;
      events: TableDefinition<
        EventRow,
        Optional<
          EventRow,
          | "id"
          | "description"
          | "kind"
          | "location"
          | "priority"
          | "rsvp_enabled"
          | "attendance_finalized"
          | "created_at"
          | "updated_at"
        >
      >;
      rsvps: TableDefinition<RsvpRow, Optional<RsvpRow, "id" | "status">>;
      attendance: TableDefinition<
        AttendanceRow,
        Optional<AttendanceRow, "id" | "note" | "finalized_by" | "finalized_at">
      >;
      attendance_corrections: TableDefinition<AttendanceCorrectionRow>;
      event_preferences: TableDefinition<EventPreferenceRow>;
      messages: TableDefinition<MessageRow, Optional<MessageRow, "id" | "deleted_at">>;
      chat_banners: TableDefinition<
        ChatBannerRow,
        Optional<ChatBannerRow, "id" | "expires_at" | "created_by">
      >;
      role_messages: TableDefinition<RoleMessageRow, Optional<RoleMessageRow, "id" | "is_read">>;
      transactions: TableDefinition<
        TransactionRow,
        Optional<TransactionRow, "id" | "category" | "description" | "occurred_on" | "receipt_path">
      >;
      budgets: TableDefinition<
        BudgetRow,
        Optional<BudgetRow, "id" | "period_start" | "period_end">
      >;
      dues: TableDefinition<DuesRow, Optional<DuesRow, "id" | "amount" | "status" | "due_date">>;
      forms: TableDefinition<
        FormRow,
        Optional<
          FormRow,
          | "id"
          | "description"
          | "status"
          | "closes_at"
          | "target_table_id"
          | "created_at"
          | "updated_at"
        >
      >;
      form_questions: TableDefinition<
        FormQuestionRow,
        Optional<FormQuestionRow, "id" | "options" | "required" | "sort_order">
      >;
      form_responses: TableDefinition<FormResponseRow, Optional<FormResponseRow, "id" | "answers">>;
      data_tables: TableDefinition<
        DataTableRow,
        Optional<DataTableRow, "id" | "template_key" | "description" | "created_at" | "updated_at">
      >;
      data_table_columns: TableDefinition<
        DataTableColumnRow,
        Optional<DataTableColumnRow, "id" | "column_type" | "sort_order" | "is_required">
      >;
      data_table_rows: TableDefinition<
        DataTableDataRow,
        Optional<DataTableDataRow, "id" | "data" | "member_id" | "event_id">
      >;
      eligibility_requirements: TableDefinition<
        EligibilityRequirementRow,
        Optional<EligibilityRequirementRow, "id" | "threshold">
      >;
      leadership_applications: TableDefinition<
        LeadershipApplicationRow,
        Optional<
          LeadershipApplicationRow,
          "id" | "status" | "applicant_context" | "answers" | "submitted_at"
        >
      >;
      application_questions: TableDefinition<
        ApplicationQuestionRow,
        Optional<ApplicationQuestionRow, "id" | "options" | "required" | "sort_order">
      >;
      notifications: TableDefinition<
        NotificationRow,
        Optional<NotificationRow, "id" | "body" | "link_path" | "read_at">
      >;
      audit_logs: TableDefinition<AuditLogRow>;
    };
    Views: {
      finalized_attendance: {
        Row: {
          user_id: string;
          club_id: string;
          event_id: string;
          status: AttendanceStatus;
          starts_at: string;
        };
        Relationships: [];
      };
      club_finances: { Row: ClubFinancesRow; Relationships: [] };
    };
    Functions: {
      current_profile: { Args: Record<string, never>; Returns: ProfileRow };
      current_school_id: { Args: Record<string, never>; Returns: string };
      is_administrator: { Args: Record<string, never>; Returns: boolean };
      is_user_administrator: { Args: { target_user_id: string }; Returns: boolean };
      is_club_member: { Args: { target_club: string }; Returns: boolean };
      is_club_admin: { Args: { target_club: string }; Returns: boolean };
      is_club_leader: { Args: { target_club: string }; Returns: boolean };
      has_club_permission: {
        Args: { target_club: string; needed: ClubPermission };
        Returns: boolean;
      };
      can_read_club: { Args: { target_club: string }; Returns: boolean };
      student_verification_count: { Args: { target_club: string }; Returns: number };
      activate_administrator: { Args: Record<string, never>; Returns: ProfileRow };
      check_administrator_allowlist: {
        Args: { candidate_email: string };
        Returns: boolean;
      };
      create_club: {
        Args: {
          club_name: string;
          club_type: ClubType;
          club_commitment: CommitmentLevel;
          club_fields: string[];
          club_room: string;
          club_meeting_day: string | null;
          club_meeting_time: string | null;
          club_description?: string;
        };
        Returns: ClubRow;
      };
      submit_club_for_review: { Args: { target_club: string }; Returns: ClubRow };
      review_club: {
        Args: { target_club: string; approved: boolean; note?: string | null };
        Returns: ClubRow;
      };
      review_membership: {
        Args: { target_membership: string; accept: boolean };
        Returns: MembershipRow;
      };
      set_rsvp: { Args: { target_event: string; going: boolean }; Returns: RsvpRow };
      correct_attendance: {
        Args: {
          target_attendance: string;
          new_status: AttendanceStatus;
          correction_reason?: string | null;
        };
        Returns: AttendanceRow;
      };
      veto_rsvp: {
        Args: { target_attendance: string; correction_reason?: string | null };
        Returns: AttendanceRow;
      };
      add_manual_attendance: {
        Args: {
          target_event: string;
          student_id: string;
          present?: boolean;
          note?: string | null;
        };
        Returns: AttendanceRow;
      };
      finalize_attendance: { Args: { target_event: string }; Returns: Json };
      find_calendar_conflicts: {
        Args: { from_time: string; to_time: string };
        Returns: CalendarConflictRow[];
      };
      attendance_stats: {
        Args: { target_club: string; student_id: string };
        Returns: AttendanceStats;
      };
      add_transaction: {
        Args: {
          target_club: string;
          tx_type: TransactionType;
          amount: number;
          category: string;
          description?: string;
          occurred_on?: string;
          receipt_path?: string | null;
        };
        Returns: TransactionRow;
      };
      mark_dues_paid: { Args: { target_dues: string }; Returns: DuesRow };
      publish_form: { Args: { target_form: string }; Returns: FormRow };
      submit_form_response: {
        Args: { target_form: string; response_answers: Json };
        Returns: FormResponseRow;
      };
      apply_table_template: {
        Args: { target_table: string; template_key: string };
        Returns: DataTableColumnRow[];
      };
      propose_table_structure: { Args: { intent_text: string }; Returns: Json };
      check_eligibility: {
        Args: { target_role: string; student_id: string };
        Returns: EligibilityResult;
      };
      eligible_roles_for: {
        Args: { student_id: string };
        Returns: Array<{ role_id: string; club_id: string; role_name: string; metrics: Json }>;
      };
      apply_for_role: { Args: { target_role: string }; Returns: LeadershipApplicationRow };
      review_application: {
        Args: { target_application: string; accept: boolean; review_notes?: string | null };
        Returns: LeadershipApplicationRow;
      };
      application_review_packet: { Args: { target_application: string }; Returns: Json };
      notify_club_leaders: {
        Args: {
          target_club: string;
          note_type: NotificationType;
          title: string;
          body?: string;
          link_path?: string | null;
        };
        Returns: undefined;
      };
      notify_user: {
        Args: {
          target_user: string;
          note_type: NotificationType;
          title: string;
          body?: string;
          link_path?: string | null;
        };
        Returns: undefined;
      };
      record_audit: {
        Args: {
          p_action: string;
          p_object_type: string;
          p_object_id?: string | null;
          p_details?: Json;
        };
        Returns: undefined;
      };
      search_clubs: {
        Args: {
          search_text?: string | null;
          filter_type?: ClubType | null;
          filter_field?: string | null;
          filter_commitment?: CommitmentLevel | null;
        };
        Returns: ClubSearchResult[];
      };
      upcoming_events: { Args: { limit_count?: number }; Returns: UpcomingEventResult[] };
      admin_club_overview: { Args: Record<string, never>; Returns: AdminClubOverviewRow[] };
    };
    Enums: {
      account_type: AccountType;
      grade_level: GradeLevel;
      club_type: ClubType;
      commitment_level: CommitmentLevel;
      event_priority: EventPriority;
      event_kind: EventKind;
      club_status: ClubStatus;
      membership_status: MembershipStatus;
      club_permission: ClubPermission;
      verification_kind: VerificationKind;
      rsvp_status: RsvpStatus;
      attendance_status: AttendanceStatus;
      attendance_source: "rsvp" | "manual";
      transaction_type: TransactionType;
      dues_status: DuesStatus;
      form_status: FormStatus;
      question_type: QuestionType;
      requirement_kind: RequirementKind;
      application_status: ApplicationStatus;
      notification_type: NotificationType;
    };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
