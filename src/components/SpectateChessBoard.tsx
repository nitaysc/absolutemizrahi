import { useEffect, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Eye, ExternalLink } from "lucide-react";

type GameRow = {
  id: string;
  mode: "ai" | "pvp";
  status: "waiting" | "active" | "finished";
  white_id: string | null;
  black_id: string | null;
  white_username: string | null;
  black_username: string | null;
  white_avatar: string | null;
  black_avatar: string | null;
  bet: number;
  ai_elo: number | null;
  ai_color: "w" | "b" | null;
  fen: string;
  turn: "w" | "b";
  white_time_ms: number;
  black_time_ms: number;
  result: string | null;
};

function fmtClock(ms: number) {
  ms = Math.max(0, ms);
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Live, read-only chess board for spectating a friend's current game (vs AI or
 * vs another player). Finds the friend's most recent active game and subscribes
 * to realtime updates of `chess_games`.
 */
export function SpectateChessBoard({ friendId, friendUsername }: { friendId: string; friendUsername: string | null }) {
  const [game, setGame] = useState<GameRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const findActiveGame = async () => {
      // Prefer an in-progress game; if none, fall back to the most recently
      // updated game (so a just-finished game still shows briefly, but a
      // newly created game replaces it as soon as it appears).
      const live = await supabase
        .from("chess_games")
        .select("*")
        .or(`white_id.eq.${friendId},black_id.eq.${friendId}`)
        .in("status", ["waiting", "active"])
        .order("updated_at", { ascending: false })
        .limit(1);
      let row = (live.data?.[0] as unknown as GameRow) ?? null;
      if (!row) {
        const recent = await supabase
          .from("chess_games")
          .select("*")
          .or(`white_id.eq.${friendId},black_id.eq.${friendId}`)
          .order("updated_at", { ascending: false })
          .limit(1);
        row = (recent.data?.[0] as unknown as GameRow) ?? null;
      }
      if (cancelled) return;
      setGame((prev) => {
        // Always swap when the id changes (new game started).
        if (!prev || !row || prev.id !== row.id) return row;
        // Same id: keep newer data.
        return row;
      });
      setLoading(false);
    };
    findActiveGame();
    const poll = setInterval(findActiveGame, 2000);

    // Realtime: any insert/update on chess_games triggers a quick refetch so
    // newly created games (vs AI or vs another player) show up instantly.
    const ch = supabase
      .channel(`spectate-friend-chess-${friendId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chess_games" },
        (payload) => {
          const row = payload.new as Partial<GameRow>;
          if (row?.white_id === friendId || row?.black_id === friendId) {
            findActiveGame();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chess_games" },
        (payload) => {
          const row = payload.new as Partial<GameRow>;
          if (row?.white_id === friendId || row?.black_id === friendId) {
            findActiveGame();
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(poll);
      supabase.removeChannel(ch);
    };
  }, [friendId]);

  // Subscribe to realtime updates for the active game
  useEffect(() => {
    if (!game?.id) return;
    const ch = supabase
      .channel(`spectate-chess-${game.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chess_games", filter: `id=eq.${game.id}` },
        (payload) => {
          const row = payload.new as unknown as GameRow;
          if (row?.id) setGame(row);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [game?.id]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
        Looking for {friendUsername ?? "this player"}'s chess game…
      </div>
    );
  }

  if (!game) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
        {friendUsername ?? "This player"} isn't in an active chess game right now.
      </div>
    );
  }

  // Determine board orientation: from the friend's perspective if possible.
  const friendIsWhite = game.white_id === friendId;
  const orientation: "white" | "black" = friendIsWhite ? "white" : "black";

  // Validate the FEN; if invalid, fall back to start position.
  let safeFen = game.fen;
  try {
    new Chess(safeFen);
  } catch {
    safeFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  }

  const whiteName =
    game.white_username ?? (game.mode === "ai" && game.ai_color === "w" ? `AI ${game.ai_elo ?? ""}` : "White");
  const blackName =
    game.black_username ?? (game.mode === "ai" && game.ai_color === "b" ? `AI ${game.ai_elo ?? ""}` : "Black");

  const topName = orientation === "white" ? blackName : whiteName;
  const topAvatar = orientation === "white" ? game.black_avatar : game.white_avatar;
  const topClock = orientation === "white" ? game.black_time_ms : game.white_time_ms;
  const topActive = (orientation === "white" ? "b" : "w") === game.turn && game.status === "active";

  const botName = orientation === "white" ? whiteName : blackName;
  const botAvatar = orientation === "white" ? game.white_avatar : game.black_avatar;
  const botClock = orientation === "white" ? game.white_time_ms : game.black_time_ms;
  const botActive = (orientation === "white" ? "w" : "b") === game.turn && game.status === "active";

  return (
    <div className="space-y-3 rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/5 via-card/70 to-transparent p-3 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-primary">
          <Eye className="h-3.5 w-3.5" /> Live chess board
          {game.status === "finished" && (
            <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">Finished</span>
          )}
        </p>
        <Link
          to={`/chess/${game.id}`}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
        >
          Open <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      <PlayerStrip name={topName} avatar={topAvatar} clockMs={topClock} active={topActive} />

      <div className="overflow-hidden rounded-2xl">
        <Chessboard
          id={`spectate-${game.id}`}
          position={safeFen}
          boardOrientation={orientation}
          arePiecesDraggable={false}
          customBoardStyle={{ borderRadius: 12 }}
          animationDuration={250}
        />
      </div>

      <PlayerStrip name={botName} avatar={botAvatar} clockMs={botClock} active={botActive} />

      <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-muted-foreground">
        <span className="uppercase tracking-widest">{game.mode === "ai" ? "vs AI" : "vs Player"}</span>
        <span className="font-bold tabular-nums">{game.turn === "w" ? "White to move" : "Black to move"}</span>
      </div>
    </div>
  );
}

function PlayerStrip({
  name,
  avatar,
  clockMs,
  active,
}: {
  name: string;
  avatar: string | null;
  clockMs: number;
  active: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition ${
        active ? "border-primary/50 bg-primary/10" : "border-border bg-card/40"
      }`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-base">
        {avatar ?? "🎰"}
      </span>
      <span className="flex-1 truncate text-sm font-bold">{name}</span>
      <span
        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-black tabular-nums ${
          active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
        }`}
      >
        <Clock className="h-3 w-3" />
        {fmtClock(clockMs)}
      </span>
    </div>
  );
}