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
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string
          actor_name: string | null
          created_at: string
          id: string
          metadata: Json
          reason: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          actor_name?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          actor_name?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
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
      bot_cron_log: {
        Row: {
          endpoint: string
          error_text: string | null
          id: string
          request_id: number | null
          resolved_at: string | null
          status_code: number | null
          triggered_at: string
        }
        Insert: {
          endpoint: string
          error_text?: string | null
          id?: string
          request_id?: number | null
          resolved_at?: string | null
          status_code?: number | null
          triggered_at?: string
        }
        Update: {
          endpoint?: string
          error_text?: string | null
          id?: string
          request_id?: number | null
          resolved_at?: string | null
          status_code?: number | null
          triggered_at?: string
        }
        Relationships: []
      }
      bot_settings: {
        Row: {
          aggression: string
          auto_run: boolean
          day_loss: number
          day_loss_date: string
          diversification_cap_pct: number
          duration_hours: number
          last_tick_at: string | null
          max_loss_day: number
          max_loss_trade: number
          max_trades_per_hour: number
          min_trade: number
          real_mode: boolean
          run_until: string | null
          sandbox_mode: boolean
          selected_coins: string[]
          stop_loss_pct: number
          strategy: string
          take_profit_pct: number
          trailing_stop_pct: number
          updated_at: string
          use_sentiment: boolean
          user_id: string
        }
        Insert: {
          aggression?: string
          auto_run?: boolean
          day_loss?: number
          day_loss_date?: string
          diversification_cap_pct?: number
          duration_hours?: number
          last_tick_at?: string | null
          max_loss_day?: number
          max_loss_trade?: number
          max_trades_per_hour?: number
          min_trade?: number
          real_mode?: boolean
          run_until?: string | null
          sandbox_mode?: boolean
          selected_coins?: string[]
          stop_loss_pct?: number
          strategy?: string
          take_profit_pct?: number
          trailing_stop_pct?: number
          updated_at?: string
          use_sentiment?: boolean
          user_id: string
        }
        Update: {
          aggression?: string
          auto_run?: boolean
          day_loss?: number
          day_loss_date?: string
          diversification_cap_pct?: number
          duration_hours?: number
          last_tick_at?: string | null
          max_loss_day?: number
          max_loss_trade?: number
          max_trades_per_hour?: number
          min_trade?: number
          real_mode?: boolean
          run_until?: string | null
          sandbox_mode?: boolean
          selected_coins?: string[]
          stop_loss_pct?: number
          strategy?: string
          take_profit_pct?: number
          trailing_stop_pct?: number
          updated_at?: string
          use_sentiment?: boolean
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
      credit_grants: {
        Row: {
          amount: number
          created_at: string
          granted_by: string
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          granted_by: string
          id?: string
          reason: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          granted_by?: string
          id?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_summaries: {
        Row: {
          created_at: string
          day: string
          id: string
          summary: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day?: string
          id?: string
          summary: string
          user_id: string
        }
        Update: {
          created_at?: string
          day?: string
          id?: string
          summary?: string
          user_id?: string
        }
        Relationships: []
      }
      exchange_connections: {
        Row: {
          created_at: string
          exchange: string
          key_masked: string
          last_balance: number | null
          last_verify_error: string | null
          real_trading_enabled: boolean
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          exchange?: string
          key_masked: string
          last_balance?: number | null
          last_verify_error?: string | null
          real_trading_enabled?: boolean
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          exchange?: string
          key_masked?: string
          last_balance?: number | null
          last_verify_error?: string | null
          real_trading_enabled?: boolean
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      exchange_secrets: {
        Row: {
          api_key_cipher: string
          api_secret_cipher: string
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key_cipher: string
          api_secret_cipher: string
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key_cipher?: string
          api_secret_cipher?: string
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      feedback_posts: {
        Row: {
          body: string
          created_at: string
          id: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      feedback_votes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feedback_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_memoria: {
        Row: {
          confidence_penalty: number
          created_at: string
          description: string
          id: string
          last_seen_at: string
          losses: number
          pattern_key: string
          total_pnl: number
          trades: number
          updated_at: string
          user_id: string
          wins: number
        }
        Insert: {
          confidence_penalty?: number
          created_at?: string
          description?: string
          id?: string
          last_seen_at?: string
          losses?: number
          pattern_key: string
          total_pnl?: number
          trades?: number
          updated_at?: string
          user_id: string
          wins?: number
        }
        Update: {
          confidence_penalty?: number
          created_at?: string
          description?: string
          id?: string
          last_seen_at?: string
          losses?: number
          pattern_key?: string
          total_pnl?: number
          trades?: number
          updated_at?: string
          user_id?: string
          wins?: number
        }
        Relationships: []
      }
      ia_memoria_global: {
        Row: {
          confidence_penalty: number
          created_at: string
          description: string
          last_seen_at: string
          losses: number
          pattern_key: string
          total_pnl: number
          trades: number
          updated_at: string
          wins: number
        }
        Insert: {
          confidence_penalty?: number
          created_at?: string
          description?: string
          last_seen_at?: string
          losses?: number
          pattern_key: string
          total_pnl?: number
          trades?: number
          updated_at?: string
          wins?: number
        }
        Update: {
          confidence_penalty?: number
          created_at?: string
          description?: string
          last_seen_at?: string
          losses?: number
          pattern_key?: string
          total_pnl?: number
          trades?: number
          updated_at?: string
          wins?: number
        }
        Relationships: []
      }
      ia_pareceres: {
        Row: {
          confidence_after: number | null
          confidence_before: number | null
          created_at: string
          id: string
          model: string
          rationale: string
          symbol: string
          trade_id: string | null
          user_id: string
          verdict: string
        }
        Insert: {
          confidence_after?: number | null
          confidence_before?: number | null
          created_at?: string
          id?: string
          model: string
          rationale?: string
          symbol: string
          trade_id?: string | null
          user_id: string
          verdict: string
        }
        Update: {
          confidence_after?: number | null
          confidence_before?: number | null
          created_at?: string
          id?: string
          model?: string
          rationale?: string
          symbol?: string
          trade_id?: string | null
          user_id?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "ia_pareceres_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_verifications: {
        Row: {
          attempts: number
          code: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          phone: string
          user_id: string
        }
        Insert: {
          attempts?: number
          code: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          phone: string
          user_id: string
        }
        Update: {
          attempts?: number
          code?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          created_at: string
          emergency_stop: boolean
          id: boolean
          max_loss_day: number
          max_loss_trade: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          emergency_stop?: boolean
          id?: boolean
          max_loss_day?: number
          max_loss_trade?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          emergency_stop?: boolean
          id?: boolean
          max_loss_day?: number
          max_loss_trade?: number
          updated_at?: string
        }
        Relationships: []
      }
      price_alerts: {
        Row: {
          active: boolean
          created_at: string
          direction: string
          id: string
          last_triggered_at: string | null
          symbol: string
          target_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          direction?: string
          id?: string
          last_triggered_at?: string | null
          symbol: string
          target_price: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          direction?: string
          id?: string
          last_triggered_at?: string | null
          symbol?: string
          target_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          explain_simple: boolean
          full_legal_name: string | null
          id: string
          is_active: boolean
          kyc_status: string
          kyc_submitted_at: string | null
          phone: string | null
          phone_verified: boolean
          plan: Database["public"]["Enums"]["plan_tier"]
          plan_expires_at: string | null
          referral_code: string | null
          referred_by: string | null
          risk_accepted_at: string | null
          trial_ends_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          explain_simple?: boolean
          full_legal_name?: string | null
          id: string
          is_active?: boolean
          kyc_status?: string
          kyc_submitted_at?: string | null
          phone?: string | null
          phone_verified?: boolean
          plan?: Database["public"]["Enums"]["plan_tier"]
          plan_expires_at?: string | null
          referral_code?: string | null
          referred_by?: string | null
          risk_accepted_at?: string | null
          trial_ends_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          explain_simple?: boolean
          full_legal_name?: string | null
          id?: string
          is_active?: boolean
          kyc_status?: string
          kyc_submitted_at?: string | null
          phone?: string | null
          phone_verified?: boolean
          plan?: Database["public"]["Enums"]["plan_tier"]
          plan_expires_at?: string | null
          referral_code?: string | null
          referred_by?: string | null
          risk_accepted_at?: string | null
          trial_ends_at?: string | null
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          referred_id: string
          referrer_id: string
          reward_days: number
        }
        Insert: {
          created_at?: string
          id?: string
          referred_id: string
          referrer_id: string
          reward_days?: number
        }
        Update: {
          created_at?: string
          id?: string
          referred_id?: string
          referrer_id?: string
          reward_days?: number
        }
        Relationships: []
      }
      sandbox_portfolios: {
        Row: {
          available: number
          invested: number
          notes: string
          total_pnl: number
          trades: number
          updated_at: string
          user_id: string
        }
        Insert: {
          available?: number
          invested?: number
          notes?: string
          total_pnl?: number
          trades?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          available?: number
          invested?: number
          notes?: string
          total_pnl?: number
          trades?: number
          updated_at?: string
          user_id?: string
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
      strategy_variants: {
        Row: {
          base_strategy: string
          baseline_score: number
          created_at: string
          id: string
          notes: string
          params: Json
          promoted: boolean
          user_id: string
          variant_score: number
        }
        Insert: {
          base_strategy: string
          baseline_score?: number
          created_at?: string
          id?: string
          notes?: string
          params?: Json
          promoted?: boolean
          user_id: string
          variant_score?: number
        }
        Update: {
          base_strategy?: string
          baseline_score?: number
          created_at?: string
          id?: string
          notes?: string
          params?: Json
          promoted?: boolean
          user_id?: string
          variant_score?: number
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
      user_restrictions: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          id: string
          kind: string
          lifted_at: string | null
          lifted_by: string | null
          reason: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          id?: string
          kind: string
          lifted_at?: string | null
          lifted_by?: string | null
          reason: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          lifted_at?: string | null
          lifted_by?: string | null
          reason?: string
          updated_at?: string
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
      watchlist: {
        Row: {
          created_at: string
          id: string
          position: number
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          symbol?: string
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
      has_min_staff_level: {
        Args: { _level: string; _user_id: string }
        Returns: boolean
      }
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
      app_role: "admin" | "moderator" | "user" | "colaborador" | "gerente"
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
      app_role: ["admin", "moderator", "user", "colaborador", "gerente"],
      plan_tier: ["normal", "plus", "pro_max", "enterprise"],
    },
  },
} as const
