# Chess Gamemode — Implementation Plan

## Dependencies
`bun add chess.js react-chessboard stockfish`

## Backend (migration)

### Tables
- **`chess_games`**: `id uuid pk`, `mode text ('ai'|'pvp')`, `status text ('waiting'|'active'|'finished')`, `white_id uuid`, `black_id uuid` (nullable until joined), `white_username text`, `black_username text`, `white_avatar text`, `black_avatar text`, `bet bigint`, `ai_elo int` (null for pvp), `ai_color text` (null for pvp), `time_control text ('1+0'|'5+3'|'10+5')`, `initial_ms int`, `increment_ms int`, `white_time_ms int`, `black_time_ms int`, `fen text`, `pgn text`, `turn text ('w'|'b')`, `result text` (null|'1-0'|'0-1'|'1/2-1/2')`, `result_reason text`, `last_move_at timestamptz`, `created_at`, `updated_at`, `finished_at`.
- **`chess_moves`**: `id`, `game_id`, `ply int`, `san text`, `uci text`, `fen_after text`, `time_left_ms int`, `by_user uuid`, `created_at`.

### RLS
- Public SELECT on both tables. No client INSERT/UPDATE/DELETE — all via RPCs.
- Realtime: add both tables to `supabase_realtime` publication.

### RPCs (all `SECURITY DEFINER`)
- **`chess_create_ai(_bet, _elo, _color, _time_control)`** — debits bet, creates `active` game with player on chosen color, AI on the other.
- **`chess_create_pvp(_bet, _color_pref, _time_control)`** — debits bet, creates `waiting` seat.
- **`chess_quick_match(_bet, _time_control)`** — finds any `waiting` PvP game with same bet/tc and joins it; otherwise creates one (random color preference).
- **`chess_join_pvp(_game_id)`** — joins a specific waiting seat; debits bet; sets `status='active'`, `last_move_at=now()`.
- **`chess_make_move(_game_id, _san, _uci, _fen_after, _time_left_ms)`** — verifies caller is the side to move (`turn` matches `white_id`/`black_id`); records move; updates `fen`, `pgn`, flips `turn`, applies increment, updates `last_move_at`. If `_fen_after` indicates checkmate/stalemate/draw (passed via optional `_result` arg), calls internal settle.
- **`chess_ai_move(_game_id, _san, _uci, _fen_after, _result)`** — same as above but only allowed when it's AI's turn and caller is the human player of that game. (Trust client; AI games are single-player vs bot, only their coins at risk.)
- **`chess_resign(_game_id)`**, **`chess_offer_draw(_game_id)`**, **`chess_accept_draw(_game_id)`** — standard.
- **`chess_claim_timeout(_game_id)`** — checks `last_move_at + remaining_time(turn) < now()`; flags side-to-move as lost on time.
- **internal `chess_settle(_game_id, _result, _reason)`** — pays out:
  - **AI win** (player wins): payout = `floor(bet * elo_multiplier)` where multiplier table = {400:1.10, 800:1.30, 1200:1.70, 1600:2.20, 2000:3.00, 2400:4.50, 2800:8.00}. AI loss → 0. Draw → refund bet.
  - **PvP**: winner gets `floor(bet * 2 * 0.99)` (1% rake). Draw → refund both.
  - Inserts a `bets` row per human player so it shows in stats.

### `place_bet` whitelist
Not needed — chess uses its own settlement RPCs that write to `bets` directly with `game='chess'`.

## Frontend

### `src/lib/stockfish.ts`
- Loads `stockfish` in a Web Worker.
- API: `init()`, `setElo(elo: number)` (uses `setoption name UCI_LimitStrength value true` + `UCI_Elo`), `bestMove(fen, moveTimeMs): Promise<string>` (uci), `quit()`.

### `src/components/ChessBoardView.tsx`
Wraps `react-chessboard` with `chess.js`; accepts `fen`, `orientation`, `onMove(san, uci, fenAfter, result?)`, `disabled`. Highlights last move and legal moves on piece grab.

### `src/pages/ChessLobby.tsx`
Two panels in tabs (mobile) or side-by-side (desktop):
- **Vs AI**: Elo slider (snaps to 7 tiers, shows multiplier preview), color toggle (white/black/random), time-control select (1+0/5+3/10+5), bet input (`BetControls`-style), **Play** → calls `chess_create_ai`, navigates to `/chess/:gameId`.
- **PvP**: Time control + bet inputs + color preference, **Quick Match** button (calls `chess_quick_match`). Below: live list of `waiting` PvP games via realtime subscription, each row shows host avatar/name/bet/time control + **Join** button.

### `src/pages/Chess.tsx`
- Subscribes to `chess_games` row + `chess_moves` for the game.
- Renders board (oriented to player's color), both clocks (ticking from `last_move_at` for the side to move), move list, eval bar (optional, computed locally with Stockfish at depth 12).
- Buttons: **Resign**, **Offer Draw / Accept Draw**, **Claim on Time** (visible when opponent's clock hits 0).
- After each player move: writes to DB, then if AI game and it's AI's turn → calls `stockfish.bestMove(fen, moveTimeForElo)` → submits via `chess_ai_move`.
- Game-over modal showing result + payout.

### `src/App.tsx`
Add routes:
```tsx
<Route path="/chess" element={<ChessLobby />} />
<Route path="/chess/:gameId" element={<Chess />} />
```

### `src/pages/Lobby.tsx`
Add `{ to: "/chess", key: "chess", title: "CHESS", img: chessImg }` to the games array.

### `src/assets/games/chess.jpg`
Generate Mizrahi Originals-style cover (3D chess king on red podium, black/red palette, "CHESS" + "MIZRAHI ORIGINALS" text).

### `src/hooks/usePresence.tsx`
Add `'chess'` to the tracked game keys.

## Notes / risks
- Stockfish WASM is ~2MB — lazy-load only on `/chess/:gameId` route.
- Clock display is client-rendered from `last_move_at + time_left_ms`; authoritative timeout claim is server-side via `chess_claim_timeout`.
- AI-side cheating is moot (bot vs human, only the human's coins at stake). PvP server enforces turn ownership and game state but does not validate move legality in plpgsql (consistent with how poker/blackjack don't replay-validate either).

Approve and I'll build it all.