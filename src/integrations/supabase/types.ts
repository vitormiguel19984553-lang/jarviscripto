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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alert_settings: {
        Row: {
          created_at: string
          email_enabled: boolean
          min_pnl: number
          on_risk_halt: boolean
          on_trade: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_enabled?: boolean
          min_pnl?: number
          on_risk_halt?: boolean
          on_trade?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_enabled?: boolean
          min_pnl?: number
          on_risk_halt?: boolean
          on_trade?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      alerts: {
        Row: {
          body: string
          created_at: string
          emailed: boolean
          id: string
          kind: string
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          emailed?: boolean
          id?: string
          kind: string
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          emailed?: boolean
          id?: string
          kind?: string
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      bot_cron_config: {
        Row: {
          endpoint: string
          id: boolean
          token: string
        }
        Insert: {
          endpoint: string
          id?: boolean
          token?: string
        }
        Update: {
          endpoint?: string
          id?: boolean
          token?: string
        }
        Relationships: []
      }
      bot_settings: {
        Row: {
          auto_run: boolean
          day_loss: number
          day_loss_date: string
          duration_hours: number
          last_tick_at: string | null
          max_loss_day: number
          max_loss_trade: number
          min_trade: number
          run_until: string | null
          selected_coins: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_run?: boolean
          day_loss?: number
          day_loss_date?: string
          duration_hours?: number
          last_tick_at?: string | null
          max_loss_day?: number
          max_loss_trade?: number
          min_trade?: number
          run_until?: string | null
          selected_coins?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_run?: boolean
          day_loss?: number
          day_loss_date?: string
          duration_hours?: number
          last_tick_at?: string | null
          max_loss_day?: number
          max_loss_trade?: number
          min_trade?: number
          run_until?: string | null
          selected_coins?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          client_message_id: string | null
          content: string
          created_at: string
          id: string
          role: string
          thread_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_message_id?: string | null
          content: string
          created_at?: string
          id?: string
          role: string
          thread_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_message_id?: string | null
          content?: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          created_at: string
          id: boolean
          max_loss_day: number
          max_loss_trade: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: boolean
          max_loss_day?: number
          max_loss_trade?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: boolean
          max_loss_day?: number
          max_loss_trade?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean
          plan: Database["public"]["Enums"]["plan_tier"]
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          is_active?: boolean
          plan?: Database["public"]["Enums"]["plan_tier"]
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          plan?: Database["public"]["Enums"]["plan_tier"]
        }
        Relationships: []
      }
      strategy_state: {
        Row: {
          created_at: string
          id: string
          last_adjust_at: string | null
          losses: number
          min_confidence: number
          sharpe: number
          total_pnl: number
          trades: number
          updated_at: string
          user_id: string
          wins: number
        }
        Insert: {
          created_at?: string
          id?: string
          last_adjust_at?: string | null
          losses?: number
          min_confidence?: number
          sharpe?: number
          total_pnl?: number
          trades?: number
          updated_at?: string
          user_id: string
          wins?: number
        }
        Update: {
          created_at?: string
          id?: string
          last_adjust_at?: string | null
          losses?: number
          min_confidence?: number
          sharpe?: number
          total_pnl?: number
          trades?: number
          updated_at?: string
          user_id?: string
          wins?: number
        }
        Relationships: []
      }
      strategy_symbol_stats: {
        Row: {
          created_at: string
          id: string
          symbol: string
          total_pnl: number
          trades: number
          updated_at: string
          user_id: string
          weight: number
          wins: number
        }
        Insert: {
          created_at?: string
          id?: string
          symbol: string
          total_pnl?: number
          trades?: number
          updated_at?: string
          user_id: string
          weight?: number
          wins?: number
        }
        Update: {
          created_at?: string
          id?: string
          symbol?: string
          total_pnl?: number
          trades?: number
          updated_at?: string
          user_id?: string
          weight?: number
          wins?: number
        }
        Relationships: []
      }
      trades: {
        Row: {
          action: string
          amount: number
          confidence: number
          created_at: string
          id: string
          pnl: number
          reason: string
          symbol: string
          user_id: string
        }
        Insert: {
          action: string
          amount: number
          confidence: number
          created_at?: string
          id?: string
          pnl: number
          reason: string
          symbol: string
          user_id: string
        }
        Update: {
          action?: string
          amount?: number
          confidence?: number
          created_at?: string
          id?: string
          pnl?: number
          reason?: string
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          available: number
          invested: number
          updated_at: string
          user_id: string
        }
        Insert: {
          available?: number
          invested?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          available?: number
          invested?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      run_bot_tick: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      plan_tier: "normal" | "plus" | "pro_max" | "enterprise"
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
    Enums: {
      app_role: ["admin", "moderator", "user"],
      plan_tier: ["normal", "plus", "pro_max", "enterprise"],
    },
  },
} as const
