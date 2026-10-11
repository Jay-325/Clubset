export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admin_allowlist: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          full_name: string | null
          id: string
          revoked_at: string | null
          school_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          full_name?: string | null
          id?: string
          revoked_at?: string | null
          school_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          full_name?: string | null
          id?: string
          revoked_at?: string | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_allowlist_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_verifications: {
        Row: {
          activated_at: string | null
          allowlist_id: string | null
          created_at: string
          id: string
          school_id: string
          status: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          allowlist_id?: string | null
          created_at?: string
          id?: string
          school_id: string
          status?: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          allowlist_id?: string | null
          created_at?: string
          id?: string
          school_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_verifications_allowlist_id_fkey"
            columns: ["allowlist_id"]
            isOneToOne: false
            referencedRelation: "admin_allowlist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_verifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          author_id: string
          body: string
          club_id: string
          created_at: string
          id: string
          pinned: boolean
          title: string
        }
        Insert: {
          author_id: string
          body?: string
          club_id: string
          created_at?: string
          id?: string
          pinned?: boolean
          title: string
        }
        Update: {
          author_id?: string
          body?: string
          club_id?: string
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_finances"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "announcements_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      application_questions: {
        Row: {
          id: string
          options: string[]
          question: string
          question_type: Database["public"]["Enums"]["question_type"]
          required: boolean
          role_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          options?: string[]
          question: string
          question_type?: Database["public"]["Enums"]["question_type"]
          required?: boolean
          role_id: string
          sort_order?: number
        }
        Update: {
          id?: string
          options?: string[]
          question?: string
          question_type?: Database["public"]["Enums"]["question_type"]
          required?: boolean
          role_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "application_questions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "leadership_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          created_at: string
          event_id: string
          finalized_at: string | null
          finalized_by: string | null
          id: string
          note: string | null
          source: Database["public"]["Enums"]["attendance_source"]
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          note?: string | null
          source: Database["public"]["Enums"]["attendance_source"]
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          note?: string | null
          source?: Database["public"]["Enums"]["attendance_source"]
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_corrections: {
        Row: {
          attendance_id: string
          corrected_by: string | null
          created_at: string
          event_id: string
          id: string
          new_status: Database["public"]["Enums"]["attendance_status"]
          original_status: Database["public"]["Enums"]["attendance_status"]
          reason: string | null
          user_id: string
        }
        Insert: {
          attendance_id: string
          corrected_by?: string | null
          created_at?: string
          event_id: string
          id?: string
          new_status: Database["public"]["Enums"]["attendance_status"]
          original_status: Database["public"]["Enums"]["attendance_status"]
          reason?: string | null
          user_id: string
        }
        Update: {
          attendance_id?: string
          corrected_by?: string | null
          created_at?: string
          event_id?: string
          id?: string
          new_status?: Database["public"]["Enums"]["attendance_status"]
          original_status?: Database["public"]["Enums"]["attendance_status"]
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_corrections_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_corrections_corrected_by_fkey"
            columns: ["corrected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_corrections_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_corrections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: number
          object_id: string | null
          object_type: string
          school_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          object_id?: string | null
          object_type: string
          school_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          object_id?: string | null
          object_type?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          category: string
          club_id: string
          created_at: string
          id: string
          limit_amount: number
          period_end: string
          period_start: string
        }
        Insert: {
          category: string
          club_id: string
          created_at?: string
          id?: string
          limit_amount: number
          period_end?: string
          period_start?: string
        }
        Update: {
          category?: string
          club_id?: string
          created_at?: string
          id?: string
          limit_amount?: number
          period_end?: string
          period_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_finances"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "budgets_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_banners: {
        Row: {
          club_id: string
          content: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
        }
        Insert: {
          club_id: string
          content: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
        }
        Update: {
          club_id?: string
          content?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_banners_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_finances"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "chat_banners_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_banners_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_administrators: {
        Row: {
          administrator_id: string
          club_id: string
          linked_at: string
          linked_by: string | null
        }
        Insert: {
          administrator_id: string
          club_id: string
          linked_at?: string
          linked_by?: string | null
        }
        Update: {
          administrator_id?: string
          club_id?: string
          linked_at?: string
          linked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_administrators_administrator_id_fkey"
            columns: ["administrator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_administrators_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_finances"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "club_administrators_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_administrators_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_verifications: {
        Row: {
          club_id: string
          id: string
          kind: Database["public"]["Enums"]["verification_kind"]
          user_id: string
          verified_at: string
        }
        Insert: {
          club_id: string
          id?: string
          kind: Database["public"]["Enums"]["verification_kind"]
          user_id?: string
          verified_at?: string
        }
        Update: {
          club_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["verification_kind"]
          user_id?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_verifications_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_finances"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "club_verifications_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          commitment: Database["public"]["Enums"]["commitment_level"]
          created_at: string
          description: string
          fields: string[]
          founder_id: string | null
          id: string
          meeting_day: string | null
          meeting_time: string | null
          name: string
          new_members_get_chat_history: boolean
          room: string
          rsvp_enabled_by_default: boolean
          school_id: string
          status: Database["public"]["Enums"]["club_status"]
          type: Database["public"]["Enums"]["club_type"]
          updated_at: string
          welcome_banner_url: string | null
          welcome_message: string | null
        }
        Insert: {
          commitment?: Database["public"]["Enums"]["commitment_level"]
          created_at?: string
          description?: string
          fields?: string[]
          founder_id?: string | null
          id?: string
          meeting_day?: string | null
          meeting_time?: string | null
          name: string
          new_members_get_chat_history?: boolean
          room?: string
          rsvp_enabled_by_default?: boolean
          school_id: string
          status?: Database["public"]["Enums"]["club_status"]
          type: Database["public"]["Enums"]["club_type"]
          updated_at?: string
          welcome_banner_url?: string | null
          welcome_message?: string | null
        }
        Update: {
          commitment?: Database["public"]["Enums"]["commitment_level"]
          created_at?: string
          description?: string
          fields?: string[]
          founder_id?: string | null
          id?: string
          meeting_day?: string | null
          meeting_time?: string | null
          name?: string
          new_members_get_chat_history?: boolean
          room?: string
          rsvp_enabled_by_default?: boolean
          school_id?: string
          status?: Database["public"]["Enums"]["club_status"]
          type?: Database["public"]["Enums"]["club_type"]
          updated_at?: string
          welcome_banner_url?: string | null
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clubs_founder_id_fkey"
            columns: ["founder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      data_table_columns: {
        Row: {
          column_type: string
          id: string
          is_required: boolean
          name: string
          sort_order: number
          table_id: string
        }
        Insert: {
          column_type?: string
          id?: string
          is_required?: boolean
          name: string
          sort_order?: number
          table_id: string
        }
        Update: {
          column_type?: string
          id?: string
          is_required?: boolean
          name?: string
          sort_order?: number
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_table_columns_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "data_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      data_table_rows: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          event_id: string | null
          id: string
          member_id: string | null
          table_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          event_id?: string | null
          id?: string
          member_id?: string | null
          table_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          event_id?: string | null
          id?: string
          member_id?: string | null
          table_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_table_rows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_table_rows_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_table_rows_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_table_rows_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "data_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      data_tables: {
        Row: {
          club_id: string
          created_at: string
          created_by: string
          description: string
          id: string
          name: string
          template_key: string | null
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by: string
          description?: string
          id?: string
          name: string
          template_key?: string | null
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          name?: string
          template_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_tables_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_finances"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "data_tables_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_tables_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dues: {
        Row: {
          amount: number
          club_id: string
          due_date: string | null
          id: string
          marked_paid_by: string | null
          paid_at: string | null
          status: Database["public"]["Enums"]["dues_status"]
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          club_id: string
          due_date?: string | null
          id?: string
          marked_paid_by?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["dues_status"]
          transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          club_id?: string
          due_date?: string | null
          id?: string
          marked_paid_by?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["dues_status"]
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dues_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_finances"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "dues_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dues_marked_paid_by_fkey"
            columns: ["marked_paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dues_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dues_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      eligibility_requirements: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["requirement_kind"]
          role_id: string
          threshold: number
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["requirement_kind"]
          role_id: string
          threshold: number
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["requirement_kind"]
          role_id?: string
          threshold?: number
        }
        Relationships: [
          {
            foreignKeyName: "eligibility_requirements_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "leadership_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_preferences: {
        Row: {
          club_id: string
          is_preferred: boolean
          user_id: string
        }
        Insert: {
          club_id: string
          is_preferred?: boolean
          user_id: string
        }
        Update: {
          club_id?: string
          is_preferred?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_preferences_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_finances"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "event_preferences_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          attendance_finalized: boolean
          club_id: string
          created_at: string
          created_by: string | null
          description: string
          ends_at: string
          id: string
          kind: Database["public"]["Enums"]["event_kind"]
          location: string
          priority: Database["public"]["Enums"]["event_priority"]
          rsvp_enabled: boolean
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          attendance_finalized?: boolean
          club_id: string
          created_at?: string
          created_by?: string | null
          description?: string
          ends_at: string
          id?: string
          kind?: Database["public"]["Enums"]["event_kind"]
          location?: string
          priority?: Database["public"]["Enums"]["event_priority"]
          rsvp_enabled?: boolean
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          attendance_finalized?: boolean
          club_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          ends_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["event_kind"]
          location?: string
          priority?: Database["public"]["Enums"]["event_priority"]
          rsvp_enabled?: boolean
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_finances"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "events_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      form_questions: {
        Row: {
          form_id: string
          id: string
          options: string[]
          question: string
          required: boolean
          sort_order: number
          type: Database["public"]["Enums"]["question_type"]
        }
        Insert: {
          form_id: string
          id?: string
          options?: string[]
          question: string
          required?: boolean
          sort_order?: number
          type: Database["public"]["Enums"]["question_type"]
        }
        Update: {
          form_id?: string
          id?: string
          options?: string[]
          question?: string
          required?: boolean
          sort_order?: number
          type?: Database["public"]["Enums"]["question_type"]
        }
        Relationships: [
          {
            foreignKeyName: "form_questions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_responses: {
        Row: {
          answers: Json
          form_id: string
          id: string
          submitted_at: string
          user_id: string
        }
        Insert: {
          answers?: Json
          form_id: string
          id?: string
          submitted_at?: string
          user_id: string
        }
        Update: {
          answers?: Json
          form_id?: string
          id?: string
          submitted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_responses_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          closes_at: string | null
          club_id: string
          created_at: string
          created_by: string
          description: string
          id: string
          status: Database["public"]["Enums"]["form_status"]
          target_table_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          closes_at?: string | null
          club_id: string
          created_at?: string
          created_by: string
          description?: string
          id?: string
          status?: Database["public"]["Enums"]["form_status"]
          target_table_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          closes_at?: string | null
          club_id?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          status?: Database["public"]["Enums"]["form_status"]
          target_table_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forms_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_finances"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "forms_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_target_table_fk"
            columns: ["target_table_id"]
            isOneToOne: false
            referencedRelation: "data_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      leadership_applications: {
        Row: {
          answers: Json
          applicant_context: Json
          applicant_id: string
          club_id: string
          created_at: string
          id: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          role_id: string
          status: Database["public"]["Enums"]["application_status"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          answers?: Json
          applicant_context?: Json
          applicant_id: string
          club_id: string
          created_at?: string
          id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          role_id: string
          status?: Database["public"]["Enums"]["application_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          answers?: Json
          applicant_context?: Json
          applicant_id?: string
          club_id?: string
          created_at?: string
          id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          role_id?: string
          status?: Database["public"]["Enums"]["application_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leadership_applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leadership_applications_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_finances"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "leadership_applications_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leadership_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leadership_applications_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "leadership_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      leadership_roles: {
        Row: {
          club_id: string
          created_at: string
          description: string
          id: string
          is_review_supervisor: boolean
          name: string
          permissions: Database["public"]["Enums"]["club_permission"][]
          sort_order: number
        }
        Insert: {
          club_id: string
          created_at?: string
          description?: string
          id?: string
          is_review_supervisor?: boolean
          name: string
          permissions?: Database["public"]["Enums"]["club_permission"][]
          sort_order?: number
        }
        Update: {
          club_id?: string
          created_at?: string
          description?: string
          id?: string
          is_review_supervisor?: boolean
          name?: string
          permissions?: Database["public"]["Enums"]["club_permission"][]
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "leadership_roles_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_finances"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "leadership_roles_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          club_id: string
          created_at: string
          id: string
          is_priority: boolean
          joined_at: string | null
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          is_priority?: boolean
          joined_at?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          is_priority?: boolean
          joined_at?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_finances"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "memberships_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          club_id: string
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          sender_id: string
        }
        Insert: {
          club_id: string
          content: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sender_id: string
        }
        Update: {
          club_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_finances"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "messages_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          avatar_url: string | null
          commitment_hours: number | null
          created_at: string
          email: string
          full_name: string
          grade: Database["public"]["Enums"]["grade_level"] | null
          id: string
          interests: string[]
          onboarding_complete: boolean
          school_id: string | null
          updated_at: string
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          avatar_url?: string | null
          commitment_hours?: number | null
          created_at?: string
          email: string
          full_name?: string
          grade?: Database["public"]["Enums"]["grade_level"] | null
          id: string
          interests?: string[]
          onboarding_complete?: boolean
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          avatar_url?: string | null
          commitment_hours?: number | null
          created_at?: string
          email?: string
          full_name?: string
          grade?: Database["public"]["Enums"]["grade_level"] | null
          id?: string
          interests?: string[]
          onboarding_complete?: boolean
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      role_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          club_id: string
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          club_id: string
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          club_id?: string
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_finances"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "role_assignments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "leadership_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_messages: {
        Row: {
          club_id: string
          content: string
          created_at: string
          id: string
          is_read: boolean
          role_id: string
          sender_id: string
        }
        Insert: {
          club_id: string
          content: string
          created_at?: string
          id?: string
          is_read?: boolean
          role_id: string
          sender_id: string
        }
        Update: {
          club_id?: string
          content?: string
          created_at?: string
          id?: string
          is_read?: boolean
          role_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_messages_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_finances"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "role_messages_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_messages_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "leadership_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rsvps: {
        Row: {
          created_at: string
          event_id: string
          id: string
          status: Database["public"]["Enums"]["rsvp_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          status?: Database["public"]["Enums"]["rsvp_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          status?: Database["public"]["Enums"]["rsvp_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          created_at: string
          email_domain: string | null
          id: string
          name: string
          settings: Json
          slug: string
        }
        Insert: {
          created_at?: string
          email_domain?: string | null
          id?: string
          name: string
          settings?: Json
          slug: string
        }
        Update: {
          created_at?: string
          email_domain?: string | null
          id?: string
          name?: string
          settings?: Json
          slug?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          category: string
          club_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          occurred_on: string
          receipt_path: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
        }
        Insert: {
          amount: number
          category?: string
          club_id: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          occurred_on?: string
          receipt_path?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          club_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          occurred_on?: string
          receipt_path?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_finances"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "transactions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      club_finances: {
        Row: {
          balance: number | null
          club_id: string | null
          total_expenses: number | null
          total_income: number | null
        }
        Relationships: []
      }
      finalized_attendance: {
        Row: {
          club_id: string | null
          event_id: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["attendance_status"] | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_finances"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "events_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_administrator: {
        Args: never
        Returns: {
          account_type: Database["public"]["Enums"]["account_type"]
          avatar_url: string | null
          commitment_hours: number | null
          created_at: string
          email: string
          full_name: string
          grade: Database["public"]["Enums"]["grade_level"] | null
          id: string
          interests: string[]
          onboarding_complete: boolean
          school_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_manual_attendance: {
        Args: {
          note?: string
          present?: boolean
          student_id: string
          target_event: string
        }
        Returns: {
          created_at: string
          event_id: string
          finalized_at: string | null
          finalized_by: string | null
          id: string
          note: string | null
          source: Database["public"]["Enums"]["attendance_source"]
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "attendance"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_transaction: {
        Args: {
          amount: number
          category: string
          description?: string
          occurred_on?: string
          receipt_path?: string
          target_club: string
          tx_type: Database["public"]["Enums"]["transaction_type"]
        }
        Returns: {
          amount: number
          category: string
          club_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          occurred_on: string
          receipt_path: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      application_review_packet: {
        Args: { target_application: string }
        Returns: Json
      }
      apply_for_role: {
        Args: { target_role: string }
        Returns: {
          answers: Json
          applicant_context: Json
          applicant_id: string
          club_id: string
          created_at: string
          id: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          role_id: string
          status: Database["public"]["Enums"]["application_status"]
          submitted_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "leadership_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_table_template: {
        Args: { target_table: string; template_key: string }
        Returns: {
          column_type: string
          id: string
          is_required: boolean
          name: string
          sort_order: number
          table_id: string
        }
        SetofOptions: {
          from: "*"
          to: "data_table_columns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      attendance_stats: {
        Args: { student_id: string; target_club: string }
        Returns: Json
      }
      can_read_club: { Args: { target_club: string }; Returns: boolean }
      check_eligibility: {
        Args: { student_id: string; target_role: string }
        Returns: Json
      }
      correct_attendance: {
        Args: {
          correction_reason?: string
          new_status: Database["public"]["Enums"]["attendance_status"]
          target_attendance: string
        }
        Returns: {
          created_at: string
          event_id: string
          finalized_at: string | null
          finalized_by: string | null
          id: string
          note: string | null
          source: Database["public"]["Enums"]["attendance_source"]
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "attendance"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_club: {
        Args: {
          club_commitment: Database["public"]["Enums"]["commitment_level"]
          club_description?: string
          club_fields: string[]
          club_meeting_day: string
          club_meeting_time: string
          club_name: string
          club_room: string
          club_type: Database["public"]["Enums"]["club_type"]
        }
        Returns: {
          commitment: Database["public"]["Enums"]["commitment_level"]
          created_at: string
          description: string
          fields: string[]
          founder_id: string | null
          id: string
          meeting_day: string | null
          meeting_time: string | null
          name: string
          new_members_get_chat_history: boolean
          room: string
          rsvp_enabled_by_default: boolean
          school_id: string
          status: Database["public"]["Enums"]["club_status"]
          type: Database["public"]["Enums"]["club_type"]
          updated_at: string
          welcome_banner_url: string | null
          welcome_message: string | null
        }
        SetofOptions: {
          from: "*"
          to: "clubs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_profile: {
        Args: never
        Returns: {
          account_type: Database["public"]["Enums"]["account_type"]
          avatar_url: string | null
          commitment_hours: number | null
          created_at: string
          email: string
          full_name: string
          grade: Database["public"]["Enums"]["grade_level"] | null
          id: string
          interests: string[]
          onboarding_complete: boolean
          school_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_school_id: { Args: never; Returns: string }
      eligible_roles_for: {
        Args: { student_id: string }
        Returns: {
          club_id: string
          metrics: Json
          role_id: string
          role_name: string
        }[]
      }
      finalize_attendance: { Args: { target_event: string }; Returns: Json }
      find_calendar_conflicts: {
        Args: { from_time: string; to_time: string }
        Returns: {
          club_name: string
          conflicting_club_name: string
          conflicting_event_id: string
          ends_at: string
          event_id: string
          is_preferred: boolean
          starts_at: string
        }[]
      }
      has_club_permission: {
        Args: {
          needed: Database["public"]["Enums"]["club_permission"]
          target_club: string
        }
        Returns: boolean
      }
      is_administrator: { Args: never; Returns: boolean }
      is_club_admin: { Args: { target_club: string }; Returns: boolean }
      is_club_leader: { Args: { target_club: string }; Returns: boolean }
      is_club_member: { Args: { target_club: string }; Returns: boolean }
      mark_dues_paid: {
        Args: { target_dues: string }
        Returns: {
          amount: number
          club_id: string
          due_date: string | null
          id: string
          marked_paid_by: string | null
          paid_at: string | null
          status: Database["public"]["Enums"]["dues_status"]
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "dues"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      propose_table_structure: { Args: { intent_text: string }; Returns: Json }
      publish_form: {
        Args: { target_form: string }
        Returns: {
          closes_at: string | null
          club_id: string
          created_at: string
          created_by: string
          description: string
          id: string
          status: Database["public"]["Enums"]["form_status"]
          target_table_id: string | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "forms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_audit: {
        Args: {
          p_action: string
          p_details?: Json
          p_object_id?: string
          p_object_type: string
        }
        Returns: undefined
      }
      review_application: {
        Args: {
          accept: boolean
          review_notes?: string
          target_application: string
        }
        Returns: {
          answers: Json
          applicant_context: Json
          applicant_id: string
          club_id: string
          created_at: string
          id: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          role_id: string
          status: Database["public"]["Enums"]["application_status"]
          submitted_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "leadership_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_club: {
        Args: { approved: boolean; note?: string; target_club: string }
        Returns: {
          commitment: Database["public"]["Enums"]["commitment_level"]
          created_at: string
          description: string
          fields: string[]
          founder_id: string | null
          id: string
          meeting_day: string | null
          meeting_time: string | null
          name: string
          new_members_get_chat_history: boolean
          room: string
          rsvp_enabled_by_default: boolean
          school_id: string
          status: Database["public"]["Enums"]["club_status"]
          type: Database["public"]["Enums"]["club_type"]
          updated_at: string
          welcome_banner_url: string | null
          welcome_message: string | null
        }
        SetofOptions: {
          from: "*"
          to: "clubs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_membership: {
        Args: { accept: boolean; target_membership: string }
        Returns: {
          club_id: string
          created_at: string
          id: string
          is_priority: boolean
          joined_at: string | null
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_clubs: {
        Args: {
          filter_commitment?: Database["public"]["Enums"]["commitment_level"]
          filter_field?: string
          filter_type?: Database["public"]["Enums"]["club_type"]
          search_text?: string
        }
        Returns: {
          commitment: Database["public"]["Enums"]["commitment_level"]
          description: string
          fields: string[]
          id: string
          is_member: boolean
          match_reasons: string[]
          meeting_day: string
          meeting_time: string
          member_count: number
          name: string
          room: string
          type: Database["public"]["Enums"]["club_type"]
          welcome_message: string
        }[]
      }
      set_rsvp: {
        Args: { going: boolean; target_event: string }
        Returns: {
          created_at: string
          event_id: string
          id: string
          status: Database["public"]["Enums"]["rsvp_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rsvps"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      student_verification_count: {
        Args: { target_club: string }
        Returns: number
      }
      submit_club_for_review: {
        Args: { target_club: string }
        Returns: {
          commitment: Database["public"]["Enums"]["commitment_level"]
          created_at: string
          description: string
          fields: string[]
          founder_id: string | null
          id: string
          meeting_day: string | null
          meeting_time: string | null
          name: string
          new_members_get_chat_history: boolean
          room: string
          rsvp_enabled_by_default: boolean
          school_id: string
          status: Database["public"]["Enums"]["club_status"]
          type: Database["public"]["Enums"]["club_type"]
          updated_at: string
          welcome_banner_url: string | null
          welcome_message: string | null
        }
        SetofOptions: {
          from: "*"
          to: "clubs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_form_response: {
        Args: { response_answers: Json; target_form: string }
        Returns: {
          answers: Json
          form_id: string
          id: string
          submitted_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "form_responses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      veto_rsvp: {
        Args: { correction_reason?: string; target_attendance: string }
        Returns: {
          created_at: string
          event_id: string
          finalized_at: string | null
          finalized_by: string | null
          id: string
          note: string | null
          source: Database["public"]["Enums"]["attendance_source"]
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "attendance"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      account_type: "student" | "administrator"
      application_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "accepted"
        | "rejected"
        | "withdrawn"
      attendance_source: "rsvp" | "manual"
      attendance_status:
        | "attended"
        | "did_not_attend"
        | "rsvp_pending"
        | "not_applicable"
      club_permission:
        | "manage_settings"
        | "manage_membership"
        | "manage_events"
        | "manage_attendance"
        | "manage_finances"
        | "manage_forms"
        | "manage_data_tables"
        | "manage_leadership"
        | "send_announcements"
        | "moderate_chat"
      club_status:
        | "draft"
        | "awaiting_student_verification"
        | "awaiting_administrator_verification"
        | "approved"
        | "rejected"
        | "archived"
      club_type: "volunteer" | "competitive" | "recreational"
      commitment_level: "low" | "medium" | "high"
      dues_status: "paid" | "not_paid" | "unknown"
      event_kind: "meeting" | "event" | "deadline" | "other"
      event_priority: "low" | "normal" | "high"
      form_status: "draft" | "published" | "closed"
      grade_level: "freshman" | "sophomore" | "junior" | "senior" | "other"
      membership_status: "pending" | "active" | "rejected" | "removed"
      question_type:
        | "short_answer"
        | "long_answer"
        | "multiple_choice"
        | "checkbox"
        | "yes_no"
        | "number"
        | "date"
      requirement_kind:
        | "min_days_in_club"
        | "min_attendance_rate"
        | "min_events_attended"
        | "min_volunteer_hours"
      rsvp_status: "going" | "maybe" | "not_going"
      transaction_type: "income" | "expense"
      verification_kind: "founder" | "verifier"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: ["student", "administrator"],
      application_status: [
        "draft",
        "submitted",
        "under_review",
        "accepted",
        "rejected",
        "withdrawn",
      ],
      attendance_source: ["rsvp", "manual"],
      attendance_status: [
        "attended",
        "did_not_attend",
        "rsvp_pending",
        "not_applicable",
      ],
      club_permission: [
        "manage_settings",
        "manage_membership",
        "manage_events",
        "manage_attendance",
        "manage_finances",
        "manage_forms",
        "manage_data_tables",
        "manage_leadership",
        "send_announcements",
        "moderate_chat",
      ],
      club_status: [
        "draft",
        "awaiting_student_verification",
        "awaiting_administrator_verification",
        "approved",
        "rejected",
        "archived",
      ],
      club_type: ["volunteer", "competitive", "recreational"],
      commitment_level: ["low", "medium", "high"],
      dues_status: ["paid", "not_paid", "unknown"],
      event_kind: ["meeting", "event", "deadline", "other"],
      event_priority: ["low", "normal", "high"],
      form_status: ["draft", "published", "closed"],
      grade_level: ["freshman", "sophomore", "junior", "senior", "other"],
      membership_status: ["pending", "active", "rejected", "removed"],
      question_type: [
        "short_answer",
        "long_answer",
        "multiple_choice",
        "checkbox",
        "yes_no",
        "number",
        "date",
      ],
      requirement_kind: [
        "min_days_in_club",
        "min_attendance_rate",
        "min_events_attended",
        "min_volunteer_hours",
      ],
      rsvp_status: ["going", "maybe", "not_going"],
      transaction_type: ["income", "expense"],
      verification_kind: ["founder", "verifier"],
    },
  },
} as const
