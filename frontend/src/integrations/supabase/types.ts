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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      study_block_surveys: {
        Row: {
          block_number: number
          created_at: string
          id: string
          nasa_frustration: number | null
          nasa_mental: number | null
          nasa_time: number | null
          session_id: string
          trust_pulse: number | null
        }
        Insert: {
          block_number: number
          created_at?: string
          id?: string
          nasa_frustration?: number | null
          nasa_mental?: number | null
          nasa_time?: number | null
          session_id: string
          trust_pulse?: number | null
        }
        Update: {
          block_number?: number
          created_at?: string
          id?: string
          nasa_frustration?: number | null
          nasa_mental?: number | null
          nasa_time?: number | null
          session_id?: string
          trust_pulse?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "study_block_surveys_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "study_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      study_email_subscriptions: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      study_sessions: {
        Row: {
          ai_current_use: string[] | null
          ai_usage_general: string | null
          ai_usage_medicine: string | null
          baseline_accuracy: number | null
          completed_at: string | null
          consent: boolean | null
          consent_timestamp: string | null
          created_at: string
          current_block: number | null
          current_case_index: number | null
          current_screen: string | null
          debrief_comments: string | null
          experience_level: string | null
          id: string
          jian_item_order: number[] | null
          n_cases: number | null
          post_trust_items: number[] | null
          pre_trust_items: number[] | null
          semester: string | null
          session_code: string
          session_index: number | null
          time_budget_min: number | null
          updated_at: string
          xray_experience: string | null
        }
        Insert: {
          ai_current_use?: string[] | null
          ai_usage_general?: string | null
          ai_usage_medicine?: string | null
          baseline_accuracy?: number | null
          completed_at?: string | null
          consent?: boolean | null
          consent_timestamp?: string | null
          created_at?: string
          current_block?: number | null
          current_case_index?: number | null
          current_screen?: string | null
          debrief_comments?: string | null
          experience_level?: string | null
          id?: string
          jian_item_order?: number[] | null
          n_cases?: number | null
          post_trust_items?: number[] | null
          pre_trust_items?: number[] | null
          semester?: string | null
          session_code: string
          session_index?: number | null
          time_budget_min?: number | null
          updated_at?: string
          xray_experience?: string | null
        }
        Update: {
          ai_current_use?: string[] | null
          ai_usage_general?: string | null
          ai_usage_medicine?: string | null
          baseline_accuracy?: number | null
          completed_at?: string | null
          consent?: boolean | null
          consent_timestamp?: string | null
          created_at?: string
          current_block?: number | null
          current_case_index?: number | null
          current_screen?: string | null
          debrief_comments?: string | null
          experience_level?: string | null
          id?: string
          jian_item_order?: number[] | null
          n_cases?: number | null
          post_trust_items?: number[] | null
          pre_trust_items?: number[] | null
          semester?: string | null
          session_code?: string
          session_index?: number | null
          time_budget_min?: number | null
          updated_at?: string
          xray_experience?: string | null
        }
        Relationships: []
      }
      study_trials: {
        Row: {
          ai_helpful: number | null
          bias_banner_dismissed: boolean | null
          case_id: string
          category: string | null
          changed_mind: boolean | null
          condition: string | null
          created_at: string
          id: string
          initial_confidence: number | null
          initial_findings: string[] | null
          response_time_post_ms: number | null
          response_time_pre_ms: number | null
          revised_confidence: number | null
          revised_findings: string[] | null
          session_id: string
          time_on_banner_ms: number | null
          trial_type: string
          xai_faithful: string | null
          xai_helpful: string | null
          xai_view_selected: string | null
        }
        Insert: {
          ai_helpful?: number | null
          bias_banner_dismissed?: boolean | null
          case_id: string
          category?: string | null
          changed_mind?: boolean | null
          condition?: string | null
          created_at?: string
          id?: string
          initial_confidence?: number | null
          initial_findings?: string[] | null
          response_time_post_ms?: number | null
          response_time_pre_ms?: number | null
          revised_confidence?: number | null
          revised_findings?: string[] | null
          session_id: string
          time_on_banner_ms?: number | null
          trial_type?: string
          xai_faithful?: string | null
          xai_helpful?: string | null
          xai_view_selected?: string | null
        }
        Update: {
          ai_helpful?: number | null
          bias_banner_dismissed?: boolean | null
          case_id?: string
          category?: string | null
          changed_mind?: boolean | null
          condition?: string | null
          created_at?: string
          id?: string
          initial_confidence?: number | null
          initial_findings?: string[] | null
          response_time_post_ms?: number | null
          response_time_pre_ms?: number | null
          revised_confidence?: number | null
          revised_findings?: string[] | null
          session_id?: string
          time_on_banner_ms?: number | null
          trial_type?: string
          xai_faithful?: string | null
          xai_helpful?: string | null
          xai_view_selected?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "study_trials_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "study_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
