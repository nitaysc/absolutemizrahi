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
      battle_cases: {
        Row: {
          battle_id: string
          case_id: string
          id: string
          position: number
          qty: number
        }
        Insert: {
          battle_id: string
          case_id: string
          id?: string
          position: number
          qty?: number
        }
        Update: {
          battle_id?: string
          case_id?: string
          id?: string
          position?: number
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "battle_cases_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "case_battles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battle_cases_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_players: {
        Row: {
          avatar: string
          battle_id: string
          display_name: string
          id: string
          is_bot: boolean
          joined_at: string
          slot: number
          team: number
          total_winnings: number
          user_id: string | null
        }
        Insert: {
          avatar?: string
          battle_id: string
          display_name: string
          id?: string
          is_bot?: boolean
          joined_at?: string
          slot: number
          team?: number
          total_winnings?: number
          user_id?: string | null
        }
        Update: {
          avatar?: string
          battle_id?: string
          display_name?: string
          id?: string
          is_bot?: boolean
          joined_at?: string
          slot?: number
          team?: number
          total_winnings?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "battle_players_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "case_battles"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_rounds: {
        Row: {
          battle_id: string
          case_id: string
          created_at: string
          id: string
          item_id: string
          item_image: string | null
          item_name: string
          item_value: number
          player_slot: number
          rarity: string
          round_index: number
          special_spin: string
        }
        Insert: {
          battle_id: string
          case_id: string
          created_at?: string
          id?: string
          item_id: string
          item_image?: string | null
          item_name: string
          item_value: number
          player_slot: number
          rarity?: string
          round_index: number
          special_spin?: string
        }
        Update: {
          battle_id?: string
          case_id?: string
          created_at?: string
          id?: string
          item_id?: string
          item_image?: string | null
          item_name?: string
          item_value?: number
          player_slot?: number
          rarity?: string
          round_index?: number
          special_spin?: string
        }
        Relationships: [
          {
            foreignKeyName: "battle_rounds_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "case_battles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          avatar: string
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
          avatar?: string
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
          avatar?: string
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
      case_battles: {
        Row: {
          created_at: string
          current_round: number
          fast: boolean
          fill_with_bots: boolean
          finished_at: string | null
          host_id: string
          house_edge_bps: number
          id: string
          is_private: boolean
          mode: string
          per_player_cost: number
          player_slots: number
          pot_payout: number | null
          rounds_total: number
          started_at: string | null
          status: string
          team_size: number
          total_cost: number
          type: string
          winner_team: number | null
          winner_user_id: string | null
        }
        Insert: {
          created_at?: string
          current_round?: number
          fast?: boolean
          fill_with_bots?: boolean
          finished_at?: string | null
          host_id: string
          house_edge_bps?: number
          id?: string
          is_private?: boolean
          mode: string
          per_player_cost: number
          player_slots: number
          pot_payout?: number | null
          rounds_total: number
          started_at?: string | null
          status?: string
          team_size?: number
          total_cost: number
          type?: string
          winner_team?: number | null
          winner_user_id?: string | null
        }
        Update: {
          created_at?: string
          current_round?: number
          fast?: boolean
          fill_with_bots?: boolean
          finished_at?: string | null
          host_id?: string
          house_edge_bps?: number
          id?: string
          is_private?: boolean
          mode?: string
          per_player_cost?: number
          player_slots?: number
          pot_payout?: number | null
          rounds_total?: number
          started_at?: string | null
          status?: string
          team_size?: number
          total_cost?: number
          type?: string
          winner_team?: number | null
          winner_user_id?: string | null
        }
        Relationships: []
      }
      case_items: {
        Row: {
          case_id: string
          created_at: string
          id: string
          image: string | null
          name: string
          rarity: string
          value: number
          weight: number
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          image?: string | null
          name: string
          rarity?: string
          value: number
          weight: number
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          image?: string | null
          name?: string
          rarity?: string
          value?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "case_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          approved_at: string | null
          cover_image: string | null
          created_at: string
          creator_id: string | null
          id: string
          image: string | null
          is_official: boolean
          name: string
          price: number
          rejection_reason: string | null
          status: string
          total_opened: number
          total_wagered: number
        }
        Insert: {
          approved_at?: string | null
          cover_image?: string | null
          created_at?: string
          creator_id?: string | null
          id?: string
          image?: string | null
          is_official?: boolean
          name: string
          price: number
          rejection_reason?: string | null
          status?: string
          total_opened?: number
          total_wagered?: number
        }
        Update: {
          approved_at?: string | null
          cover_image?: string | null
          created_at?: string
          creator_id?: string | null
          id?: string
          image?: string | null
          is_official?: boolean
          name?: string
          price?: number
          rejection_reason?: string | null
          status?: string
          total_opened?: number
          total_wagered?: number
        }
        Relationships: []
      }
      chess_games: {
        Row: {
          ai_color: string | null
          ai_elo: number | null
          bet: number
          black_avatar: string | null
          black_id: string | null
          black_time_ms: number
          black_username: string | null
          created_at: string
          draw_offered_by: string | null
          fen: string
          finished_at: string | null
          id: string
          increment_ms: number
          initial_ms: number
          last_move_at: string | null
          mode: string
          pgn: string
          result: string | null
          result_reason: string | null
          status: string
          time_control: string
          turn: string
          updated_at: string
          white_avatar: string | null
          white_id: string | null
          white_time_ms: number
          white_username: string | null
        }
        Insert: {
          ai_color?: string | null
          ai_elo?: number | null
          bet?: number
          black_avatar?: string | null
          black_id?: string | null
          black_time_ms?: number
          black_username?: string | null
          created_at?: string
          draw_offered_by?: string | null
          fen?: string
          finished_at?: string | null
          id?: string
          increment_ms?: number
          initial_ms?: number
          last_move_at?: string | null
          mode: string
          pgn?: string
          result?: string | null
          result_reason?: string | null
          status?: string
          time_control?: string
          turn?: string
          updated_at?: string
          white_avatar?: string | null
          white_id?: string | null
          white_time_ms?: number
          white_username?: string | null
        }
        Update: {
          ai_color?: string | null
          ai_elo?: number | null
          bet?: number
          black_avatar?: string | null
          black_id?: string | null
          black_time_ms?: number
          black_username?: string | null
          created_at?: string
          draw_offered_by?: string | null
          fen?: string
          finished_at?: string | null
          id?: string
          increment_ms?: number
          initial_ms?: number
          last_move_at?: string | null
          mode?: string
          pgn?: string
          result?: string | null
          result_reason?: string | null
          status?: string
          time_control?: string
          turn?: string
          updated_at?: string
          white_avatar?: string | null
          white_id?: string | null
          white_time_ms?: number
          white_username?: string | null
        }
        Relationships: []
      }
      chess_moves: {
        Row: {
          by_user: string | null
          created_at: string
          fen_after: string
          game_id: string
          id: string
          ply: number
          san: string
          time_left_ms: number
          uci: string
        }
        Insert: {
          by_user?: string | null
          created_at?: string
          fen_after: string
          game_id: string
          id?: string
          ply: number
          san: string
          time_left_ms?: number
          uci: string
        }
        Update: {
          by_user?: string | null
          created_at?: string
          fen_after?: string
          game_id?: string
          id?: string
          ply?: number
          san?: string
          time_left_ms?: number
          uci?: string
        }
        Relationships: [
          {
            foreignKeyName: "chess_moves_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "chess_games"
            referencedColumns: ["id"]
          },
        ]
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
      friendships: {
        Row: {
          addressee: string
          created_at: string
          id: string
          requester: string
          status: string
          updated_at: string
        }
        Insert: {
          addressee: string
          created_at?: string
          id?: string
          requester: string
          status?: string
          updated_at?: string
        }
        Update: {
          addressee?: string
          created_at?: string
          id?: string
          requester?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      poker_seats: {
        Row: {
          avatar: string
          current_bet: number
          has_acted: boolean
          hole: Json
          id: string
          joined_at: string
          seat_index: number
          stack: number
          status: string
          table_id: string
          total_committed: number
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          avatar?: string
          current_bet?: number
          has_acted?: boolean
          hole?: Json
          id?: string
          joined_at?: string
          seat_index: number
          stack?: number
          status?: string
          table_id: string
          total_committed?: number
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          avatar?: string
          current_bet?: number
          has_acted?: boolean
          hole?: Json
          id?: string
          joined_at?: string
          seat_index?: number
          stack?: number
          status?: string
          table_id?: string
          total_committed?: number
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "poker_seats_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "poker_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      poker_tables: {
        Row: {
          big_blind: number
          board: Json
          current_bet: number
          current_seat: number | null
          dealer_button: number | null
          deck: Json
          hand_seq: number
          id: string
          last_raise_size: number
          max_buy_in: number
          min_buy_in: number
          phase_ends_at: string | null
          pot: number
          seats: number
          small_blind: number
          status: string
          updated_at: string
        }
        Insert: {
          big_blind?: number
          board?: Json
          current_bet?: number
          current_seat?: number | null
          dealer_button?: number | null
          deck?: Json
          hand_seq?: number
          id: string
          last_raise_size?: number
          max_buy_in?: number
          min_buy_in?: number
          phase_ends_at?: string | null
          pot?: number
          seats?: number
          small_blind?: number
          status?: string
          updated_at?: string
        }
        Update: {
          big_blind?: number
          board?: Json
          current_bet?: number
          current_seat?: number | null
          dealer_button?: number | null
          deck?: Json
          hand_seq?: number
          id?: string
          last_raise_size?: number
          max_buy_in?: number
          min_buy_in?: number
          phase_ends_at?: string | null
          pot?: number
          seats?: number
          small_blind?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar: string
          blackjack_round: Json | null
          coins: number
          created_at: string | null
          display_name: string | null
          dragontower_round: Json | null
          email: string | null
          id: string
          last_daily_bonus: string | null
          mines_round: Json | null
          pump_round: Json | null
          total_wagered: number
          total_won: number
          updated_at: string | null
          username: string | null
        }
        Insert: {
          avatar?: string
          blackjack_round?: Json | null
          coins?: number
          created_at?: string | null
          display_name?: string | null
          dragontower_round?: Json | null
          email?: string | null
          id: string
          last_daily_bonus?: string | null
          mines_round?: Json | null
          pump_round?: Json | null
          total_wagered?: number
          total_won?: number
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          avatar?: string
          blackjack_round?: Json | null
          coins?: number
          created_at?: string | null
          display_name?: string | null
          dragontower_round?: Json | null
          email?: string | null
          id?: string
          last_daily_bonus?: string | null
          mines_round?: Json | null
          pump_round?: Json | null
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
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _roll_case_item: {
        Args: { _case_id: string }
        Returns: {
          image: string
          item_id: string
          name: string
          rarity: string
          value: number
          weight: number
        }[]
      }
      _slots_for_mode: {
        Args: { _mode: string }
        Returns: {
          slots: number
          team_size: number
        }[]
      }
      admin_grant_coins: {
        Args: { _amount: number; _recipient_username: string }
        Returns: {
          amount: number
          recipient_balance: number
          recipient_username: string
        }[]
      }
      approve_case: { Args: { _case_id: string }; Returns: undefined }
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
      chess_accept_draw: { Args: { _game_id: string }; Returns: undefined }
      chess_ai_move: {
        Args: {
          _fen_after: string
          _game_id: string
          _next_turn: string
          _reason?: string
          _result?: string
          _san: string
          _uci: string
        }
        Returns: undefined
      }
      chess_ai_multiplier: { Args: { _elo: number }; Returns: number }
      chess_claim_timeout: { Args: { _game_id: string }; Returns: undefined }
      chess_create_ai: {
        Args: {
          _bet: number
          _color: string
          _elo: number
          _time_control: string
        }
        Returns: {
          game_id: string
          new_balance: number
        }[]
      }
      chess_create_pvp: {
        Args: { _bet: number; _color_pref: string; _time_control: string }
        Returns: {
          game_id: string
          new_balance: number
        }[]
      }
      chess_join_pvp: {
        Args: { _game_id: string }
        Returns: {
          game_id: string
          new_balance: number
        }[]
      }
      chess_make_move: {
        Args: {
          _fen_after: string
          _game_id: string
          _next_turn: string
          _reason?: string
          _result?: string
          _san: string
          _time_left_ms: number
          _uci: string
        }
        Returns: undefined
      }
      chess_offer_draw: { Args: { _game_id: string }; Returns: undefined }
      chess_quick_match: {
        Args: { _bet: number; _time_control: string }
        Returns: {
          game_id: string
          new_balance: number
        }[]
      }
      chess_resign: { Args: { _game_id: string }; Returns: undefined }
      chess_settle: {
        Args: { _game_id: string; _reason: string; _result: string }
        Returns: undefined
      }
      chess_tc_parse: {
        Args: { _tc: string }
        Returns: Record<string, unknown>
      }
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
      create_case_battle: {
        Args: {
          _case_ids: string[]
          _fast: boolean
          _fill_with_bots: boolean
          _mode: string
          _private: boolean
          _type: string
        }
        Returns: string
      }
      dragontower_abandon: {
        Args: never
        Returns: {
          new_balance: number
        }[]
      }
      dragontower_cashout: {
        Args: never
        Returns: {
          floors: Json
          multiplier: number
          new_balance: number
          payout: number
        }[]
      }
      dragontower_pick: {
        Args: { _tile: number }
        Returns: {
          all_floors: Json
          eggs: Json
          ended: boolean
          hit_egg: boolean
          multiplier: number
          new_balance: number
          payout: number
          progress: number
        }[]
      }
      dragontower_start: {
        Args: { _bet_amount: number; _difficulty: string }
        Returns: {
          new_balance: number
        }[]
      }
      dt_config: {
        Args: { _diff: string }
        Returns: {
          eggs: number
          step: number
          tiles: number
        }[]
      }
      friend_accept: { Args: { _other: string }; Returns: Json }
      friend_decline: { Args: { _other: string }; Returns: Json }
      friend_remove: { Args: { _other: string }; Returns: Json }
      friend_request: { Args: { _target: string }; Returns: Json }
      get_player_profile: {
        Args: { _username: string }
        Returns: {
          avatar: string
          coins: number
          created_at: string
          friendship_status: string
          id: string
          recent_bets: Json
          total_wagered: number
          total_won: number
          username: string
        }[]
      }
      get_user_bet_days: {
        Args: { _limit_per_user?: number; _user_ids: string[] }
        Returns: {
          created_at: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      join_case_battle: { Args: { _battle_id: string }; Returns: undefined }
      leave_case_battle: { Args: { _battle_id: string }; Returns: undefined }
      list_friend_requests: {
        Args: never
        Returns: {
          avatar: string
          created_at: string
          id: string
          requester: string
          username: string
        }[]
      }
      list_friends: {
        Args: never
        Returns: {
          avatar: string
          coins: number
          id: string
          username: string
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
      open_case_solo: {
        Args: { _case_id: string; _count: number }
        Returns: {
          image: string
          item_id: string
          name: string
          rarity: string
          value: number
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
      poker_action: {
        Args: { _action: string; _amount?: number; _table_id: string }
        Returns: Json
      }
      poker_advance: { Args: { _table_id: string }; Returns: undefined }
      poker_buy_in: {
        Args: { _amount: number; _seat_index: number; _table_id: string }
        Returns: Json
      }
      poker_collect_bets: { Args: { _table_id: string }; Returns: undefined }
      poker_draw: { Args: { _deck: Json }; Returns: Record<string, unknown> }
      poker_eval7: { Args: { _cards: Json }; Returns: number }
      poker_fresh_deck: { Args: never; Returns: Json }
      poker_leave: { Args: { _table_id: string }; Returns: Json }
      poker_next_actor: {
        Args: { _from: number; _table_id: string }
        Returns: number
      }
      poker_rank_value: { Args: { _r: string }; Returns: number }
      poker_settle: { Args: { _table_id: string }; Returns: undefined }
      poker_table_state: { Args: { _table_id: string }; Returns: Json }
      poker_try_start_hand: { Args: { _table_id: string }; Returns: undefined }
      pump_cashout: {
        Args: never
        Returns: {
          multiplier: number
          new_balance: number
          payout: number
          pop_at: number
        }[]
      }
      pump_pump: {
        Args: never
        Returns: {
          multiplier: number
          pop_at: number
          popped: boolean
          pumps: number
        }[]
      }
      pump_start: {
        Args: { _bet_amount: number; _difficulty: string }
        Returns: {
          new_balance: number
        }[]
      }
      redeem_code: {
        Args: { _code: string }
        Returns: {
          awarded: number
          new_balance: number
        }[]
      }
      reject_case: {
        Args: { _case_id: string; _reason: string }
        Returns: undefined
      }
      search_players: {
        Args: { _q: string }
        Returns: {
          avatar: string
          coins: number
          id: string
          total_wagered: number
          total_won: number
          username: string
        }[]
      }
      start_case_battle: { Args: { _battle_id: string }; Returns: undefined }
      transfer_coins: {
        Args: { _amount: number; _recipient_username: string }
        Returns: {
          amount: number
          new_balance: number
          recipient_username: string
        }[]
      }
      wordle_win: {
        Args: { _attempts: number; _word: string }
        Returns: {
          awarded: number
          new_balance: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
    },
  },
} as const
