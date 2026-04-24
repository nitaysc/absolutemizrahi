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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      bets: {
        Row: {
          bet_amount: number
          created_at: string
          details: Json | null
          game: string
          id: string
          multiplier: number
          payout: number
          user_id: string
          won: boolean
        }
        Insert: {
          bet_amount: number
          created_at?: string
          details?: Json | null
          game: string
          id?: string
          multiplier?: number
          payout?: number
          user_id: string
          won: boolean
        }
        Update: {
          bet_amount?: number
          created_at?: string
          details?: Json | null
          game?: string
          id?: string
          multiplier?: number
          payout?: number
          user_id?: string
          won?: boolean
        }
        Relationships: []
      }
      bj_seats: {
        Row: {
          bet: number
          current_hand: number
          hands: Json
          id: string
          joined_at: string
          round_seq: number
          seat_index: number
          settled: boolean
          table_id: string
          total_payout: number
          user_id: string
          username: string
        }
        Insert: {
          bet: number
          current_hand?: number
          hands?: Json
          id?: string
          joined_at?: string
          round_seq: number
          seat_index: number
          settled?: boolean
          table_id: string
          total_payout?: number
          user_id: string
          username: string
        }
        Update: {
          bet?: number
          current_hand?: number
          hands?: Json
          id?: string
          joined_at?: string
          round_seq?: number
          seat_index?: number
          settled?: boolean
          table_id?: string
          total_payout?: number
          user_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "bj_seats_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "bj_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      bj_tables: {
        Row: {
          current_hand: number | null
          current_seat: number | null
          dealer: Json
          deck: Json
          id: string
          min_bet: number
          phase_ends_at: string | null
          round_seq: number
          seats: number
          status: string
          updated_at: string
        }
        Insert: {
          current_hand?: number | null
          current_seat?: number | null
          dealer?: Json
          deck?: Json
          id: string
          min_bet?: number
          phase_ends_at?: string | null
          round_seq?: number
          seats?: number
          status?: string
          updated_at?: string
        }
        Update: {
          current_hand?: number | null
          current_seat?: number | null
          dealer?: Json
          deck?: Json
          id?: string
          min_bet?: number
          phase_ends_at?: string | null
          round_seq?: number
          seats?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      coin_transfers: {
        Row: {
          amount: number
          created_at: string
          id: string
          note: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          note?: string | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      crash_bets: {
        Row: {
          auto_cashout: number | null
          bet_amount: number
          cashed_out_at: number | null
          created_at: string
          id: string
          payout: number
          round_id: string
          user_id: string
          username: string
        }
        Insert: {
          auto_cashout?: number | null
          bet_amount: number
          cashed_out_at?: number | null
          created_at?: string
          id?: string
          payout?: number
          round_id: string
          user_id: string
          username: string
        }
        Update: {
          auto_cashout?: number | null
          bet_amount?: number
          cashed_out_at?: number | null
          created_at?: string
          id?: string
          payout?: number
          round_id?: string
          user_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "crash_bets_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "crash_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      crash_rounds: {
        Row: {
          crash_at: number
          created_at: string
          ended_at: string | null
          id: string
          seq: number
          start_at: string | null
          status: string
        }
        Insert: {
          crash_at: number
          created_at?: string
          ended_at?: string | null
          id?: string
          seq?: number
          start_at?: string | null
          status?: string
        }
        Update: {
          crash_at?: number
          created_at?: string
          ended_at?: string | null
          id?: string
          seq?: number
          start_at?: string | null
          status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          blackjack_round: Json | null
          coins: number
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string
          last_daily_bonus: string | null
          mines_round: Json | null
          total_wagered: number
          total_won: number
          updated_at: string | null
          username: string | null
        }
        Insert: {
          blackjack_round?: Json | null
          coins?: number
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id: string
          last_daily_bonus?: string | null
          mines_round?: Json | null
          total_wagered?: number
          total_won?: number
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          blackjack_round?: Json | null
          coins?: number
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          last_daily_bonus?: string | null
          mines_round?: Json | null
          total_wagered?: number
          total_won?: number
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      redeemed_codes: {
        Row: {
          amount: number
          code: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          amount: number
          code: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          amount?: number
          code?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bj_action: { Args: { _action: string; _table_id: string }; Returns: Json }
      bj_advance: { Args: { _table_id: string }; Returns: undefined }
      bj_double: {
        Args: never
        Returns: {
          dealer: Json
          multiplier: number
          new_balance: number
          payout: number
          player: Json
          status: string
        }[]
      }
      bj_draw: { Args: { _deck: Json }; Returns: Record<string, unknown> }
      bj_fresh_deck: { Args: never; Returns: Json }
      bj_hand_value: { Args: { _hand: Json }; Returns: number }
      bj_hand_value_arr: { Args: { _cards: Json }; Returns: number }
      bj_hit: {
        Args: never
        Returns: {
          dealer: Json
          multiplier: number
          new_balance: number
          payout: number
          player: Json
          status: string
        }[]
      }
      bj_join_seat: { Args: { _bet: number; _table_id: string }; Returns: Json }
      bj_next_seat: { Args: { _table_id: string }; Returns: undefined }
      bj_stand: {
        Args: never
        Returns: {
          dealer: Json
          multiplier: number
          new_balance: number
          payout: number
          player: Json
          status: string
        }[]
      }
      bj_start: {
        Args: { _bet_amount: number }
        Returns: {
          dealer: Json
          multiplier: number
          new_balance: number
          payout: number
          player: Json
          status: string
        }[]
      }
      bj_table_state: { Args: { _table_id: string }; Returns: Json }
      claim_daily_bonus: {
        Args: never
        Returns: {
          awarded: number
          new_balance: number
        }[]
      }
      crash_cashout: {
        Args: never
        Returns: {
          busted: boolean
          multiplier: number
          new_balance: number
          payout: number
        }[]
      }
      crash_current_round: {
        Args: never
        Returns: {
          crash_at: number
          ended_at: string
          id: string
          seq: number
          start_at: string
          status: string
        }[]
      }
      crash_pick_multiplier: { Args: never; Returns: number }
      crash_place_bet: {
        Args: { _auto_cashout?: number; _bet_amount: number }
        Returns: {
          new_balance: number
          round_id: string
        }[]
      }
      crash_process_autos: { Args: never; Returns: undefined }
      crash_settle: {
        Args: never
        Returns: {
          crash_at: number
          round_id: string
        }[]
      }
      crash_start: {
        Args: never
        Returns: {
          round_id: string
          start_at: string
        }[]
      }
      mines_abandon: {
        Args: never
        Returns: {
          new_balance: number
        }[]
      }
      mines_cashout: {
        Args: never
        Returns: {
          bombs: Json
          multiplier: number
          new_balance: number
          payout: number
        }[]
      }
      mines_reveal: {
        Args: { _tile: number }
        Returns: {
          bombs: Json
          ended: boolean
          hit_bomb: boolean
          multiplier: number
          revealed: Json
        }[]
      }
      mines_start: {
        Args: { _bet_amount: number; _mines: number }
        Returns: {
          new_balance: number
        }[]
      }
      place_bet: {
        Args: {
          _bet_amount: number
          _details?: Json
          _game: string
          _multiplier: number
          _won: boolean
        }
        Returns: {
          bet_id: string
          new_balance: number
          payout: number
        }[]
      }
      redeem_code: {
        Args: { _code: string }
        Returns: {
          awarded: number
          new_balance: number
        }[]
      }
      send_coins: {
        Args: { _amount: number; _note?: string; _recipient_username: string }
        Returns: {
          amount: number
          new_balance: number
          recipient_username: string
        }[]
      }
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
