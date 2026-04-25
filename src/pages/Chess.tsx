import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Chess, type Move } from "chess.js";
import { Chessboard } from "react-chessboard";
import { ArrowLeft, Flag, Handshake, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { StockfishEngine, moveTimeForElo } from "@/lib/stockfish";
import { formatCoins } from "@/lib/format";
import { MizrahiCoin } from "@/components/MizrahiCoin";

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
  time_control: string;
  initial_ms: number;
  increment_ms: number;
  white_time_ms: number;
  black_time_ms: number;
  fen: string;
  pgn: string;
  turn: "w" | "b";
  result: string | null;
  result_reason: string | null;
  draw_offered_by: string | null;
  last_move_at: string | null;
};

function fmtClock(ms: number) {
  ms = Math.max(0, ms);
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function detectResult(c: Chess): { result: string; reason: string } | null {
  if (c.isCheckmate()) {
    // Side to move was just mated → opposite side won
    return { result: c.turn() === "w" ? "0-1" : "1-0", reason: "checkmate" };
  }
  if (c.isStalemate()) return { result: "1/2-1/2", reason: "stalemate" };
  if (c.isThreefoldRepetition()) return { result: "1/2-1/2", reason: "repetition" };
  if (c.isInsufficientMaterial()) return { result: "1/2-1/2", reason: "insufficient_material" };
  if (c.isDraw()) return { result: "1/2-1/2", reason: "fifty_move" };
  return null;
}

export default function ChessGame() {
  useTrackGame("chess");
  const { gameId } = useParams<{ gameId: string }>();
  const { user } = useAuth();
  const { refetch } = useUserProfile();
  const navigate = useNavigate();

  const [game, setGame] = useState<GameRow | null>(null);
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [, force] = useState(0);
  const [now, setNow] = useState(Date.now());
  const engineRef = useRef<StockfishEngine | null>(null);
  const aiThinkingRef = useRef(false);
  const settledRef = useRef(false);
  const [engineReady, setEngineReady] = useState(false);

  // Tick clock every 200ms
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  // Load + subscribe
  useEffect(() => {
    if (!gameId) return;
    let mounted = true;

    const load = async () => {
      const { data, error } = await supabase.from("chess_games").select("*").eq("id", gameId).maybeSingle();
      if (!mounted) return;
      if (error || !data) return;
      const row = data as unknown as GameRow;
      setGame(row);
      try {
        chess.load(row.fen);
        setFen(row.fen);
      } catch {
        // ignore parse errors
      }
      force((x) => x + 1);
    };
    load();

    const ch = supabase
      .channel(`chess-${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chess_games", filter: `id=eq.${gameId}` },
        (payload) => {
          const row = payload.new as unknown as GameRow;
          if (!row?.id) return;
          setGame(row);
          if (chess.fen() !== row.fen) {
            try {
              chess.load(row.fen);
              setFen(row.fen);
              force((x) => x + 1);
            } catch {
              // ignore
            }
          }
          if (row.status === "finished") refetch();
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  // Init Stockfish for AI games
  useEffect(() => {
    if (!game || game.mode !== "ai") return;
    let cancelled = false;
    (async () => {
      try {
        setEngineReady(false);
        const eng = new StockfishEngine();
        await eng.init();
        if (cancelled) {
          eng.quit();
          return;
        }
        await eng.setElo(game.ai_elo ?? 1600);
        engineRef.current = eng;
        setEngineReady(true);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load Stockfish");
      }
    })();
    return () => {
      cancelled = true;
      engineRef.current?.quit();
      engineRef.current = null;
      setEngineReady(false);
    };
  }, [game?.mode, game?.ai_elo]);

  const myColor: "w" | "b" | null = useMemo(() => {
    if (!game || !user) return null;
    if (game.white_id === user.id) return "w";
    if (game.black_id === user.id) return "b";
    return null;
  }, [game, user]);

  const orientation = myColor === "b" ? "black" : "white";

  // Trigger AI move when it's AI's turn
  useEffect(() => {
    if (!game || game.mode !== "ai" || game.status !== "active") return;
    if (game.turn !== game.ai_color) return;
    if (aiThinkingRef.current) return;
    if (!engineReady || !engineRef.current) return;
    const eng = engineRef.current;
    const elo = game.ai_elo ?? 1600;
    aiThinkingRef.current = true;
    (async () => {
      try {
        const uci = await eng.bestMove(game.fen, moveTimeForElo(elo));
        // Apply move locally to derive SAN + new FEN
        const local = new Chess(game.fen);
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
        const mv = local.move({ from, to, promotion: promotion as never });
        if (!mv) throw new Error("Invalid AI move: " + uci);
        const after = local.fen();
        const next = local.turn();
        const det = detectResult(local);
        await supabase.rpc("chess_ai_move", {
          _game_id: game.id,
          _san: mv.san,
          _uci: uci,
          _fen_after: after,
          _next_turn: next,
          _result: det?.result ?? null,
          _reason: det?.reason ?? null,
        });
      } catch (e) {
        console.error("AI move failed", e);
      } finally {
        aiThinkingRef.current = false;
      }
    })();
  }, [engineReady, game?.fen, game?.turn, game?.status, game?.mode, game?.ai_color, game?.id, game?.ai_elo]);

  // Claim opponent timeout
  useEffect(() => {
    if (!game || game.status !== "active" || !game.last_move_at) return;
    if (settledRef.current) return;
    const elapsedMs = now - new Date(game.last_move_at).getTime();
    const remaining = game.turn === "w" ? game.white_time_ms : game.black_time_ms;
    if (elapsedMs > remaining + 500 && myColor && myColor !== game.turn) {
      settledRef.current = true;
      supabase.rpc("chess_claim_timeout", { _game_id: game.id }).then(({ error }) => {
        if (error) settledRef.current = false;
      });
    }
  }, [now, game, myColor]);

  function clocks() {
    if (!game) return { w: 0, b: 0 };
    if (game.status !== "active" || !game.last_move_at) {
      return { w: game.white_time_ms, b: game.black_time_ms };
    }
    const elapsed = now - new Date(game.last_move_at).getTime();
    if (game.turn === "w") {
      return { w: Math.max(0, game.white_time_ms - elapsed), b: game.black_time_ms };
    }
    return { w: game.white_time_ms, b: Math.max(0, game.black_time_ms - elapsed) };
  }

  function makeMove(sourceSquare: string, targetSquare: string | null, promotion = "q"): boolean {
    if (!game || !myColor || game.status !== "active") return false;
    if (game.turn !== myColor) return false;
    if (!targetSquare) return false;

    const local = new Chess(game.fen);
    const movingPiece = local.get(sourceSquare as never);
    const targetPiece = local.get(targetSquare as never);
    if (!movingPiece || movingPiece.color !== myColor) return false;
    if (targetPiece?.color === myColor) return false;

    let mv: Move | null;
    try {
      mv = local.move({ from: sourceSquare, to: targetSquare, promotion: promotion as never });
    } catch {
      return false;
    }
    if (!mv) return false;

    const before = game.fen;
    const after = local.fen();
    chess.load(after);
    setFen(after);
    force((x) => x + 1);
    const next = local.turn();
    const det = detectResult(local);
    const uci = mv.from + mv.to + (mv.promotion ?? "");

    supabase.rpc("chess_make_move", {
      _game_id: game.id,
      _san: mv.san,
      _uci: uci,
      _fen_after: after,
      _time_left_ms: 0,
      _next_turn: next,
      _result: det?.result ?? null,
      _reason: det?.reason ?? null,
    }).then(({ error }) => {
      if (!error) return;
      try {
        chess.load(before);
        setFen(before);
        force((x) => x + 1);
      } catch {
        // ignore rollback parse errors
      }
      toast.error(error.message);
    });

    return true;
  }

  async function resign() {
    if (!game) return;
    if (!confirm("Resign the game?")) return;
    const { error } = await supabase.rpc("chess_resign", { _game_id: game.id });
    if (error) toast.error(error.message);
  }

  async function offerDraw() {
    if (!game) return;
    const { error } = await supabase.rpc("chess_offer_draw", { _game_id: game.id });
    if (error) toast.error(error.message);
    else toast.success("Draw offered");
  }

  async function acceptDraw() {
    if (!game) return;
    const { error } = await supabase.rpc("chess_accept_draw", { _game_id: game.id });
    if (error) toast.error(error.message);
  }

  if (!game) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">Loading…</div>
    );
  }

  const c = clocks();
  const top = orientation === "white" ? "b" : "w";
  const bottom = orientation === "white" ? "w" : "b";
  const topName = top === "w" ? game.white_username : game.black_username;
  const topAvatar = top === "w" ? game.white_avatar : game.black_avatar;
  const bottomName = bottom === "w" ? game.white_username : game.black_username;
  const bottomAvatar = bottom === "w" ? game.white_avatar : game.black_avatar;
  const topClock = top === "w" ? c.w : c.b;
  const bottomClock = bottom === "w" ? c.w : c.b;
  const topActive = game.status === "active" && game.turn === top;
  const bottomActive = game.status === "active" && game.turn === bottom;
  const drawOfferToMe = game.status === "active" && !!game.draw_offered_by && game.draw_offered_by !== user?.id;

  let resultBanner: string | null = null;
  if (game.status === "finished" && game.result) {
    if (game.result === "1/2-1/2") resultBanner = `Draw — ${game.result_reason}`;
    else if (myColor) {
      const won = (game.result === "1-0" && myColor === "w") || (game.result === "0-1" && myColor === "b");
      resultBanner = won ? `You won by ${game.result_reason}!` : `You lost by ${game.result_reason}`;
    } else {
      resultBanner = `${game.result === "1-0" ? "White" : "Black"} won`;
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Link to="/chess" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Lobby
        </Link>
        <div className="flex items-center gap-2 text-sm font-bold">
          <MizrahiCoin size={16} />
          {game.bet > 0 ? formatCoins(game.bet) : "Free"}
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{game.time_control}</span>
        </div>
      </div>

      {/* Top player */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{topAvatar ?? "🎰"}</span>
          <span className="text-sm font-bold">{topName ?? "waiting…"}</span>
        </div>
        <div className={`flex items-center gap-1 rounded-md px-3 py-1 font-mono text-lg font-black tabular-nums ${topActive ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
          <Clock className="h-4 w-4" />
          {fmtClock(topClock)}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl">
        <Chessboard
          id={"chess-" + game.id}
          position={fen}
          boardOrientation={orientation === "white" ? "white" : "black"}
          onPieceDrop={(sourceSquare, targetSquare) => {
            void onDrop({ sourceSquare, targetSquare });
            return true;
          }}
          arePiecesDraggable={game.status === "active" && game.turn === myColor}
          animationDuration={200}
        />
      </div>

      {/* Bottom player */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{bottomAvatar ?? "🎰"}</span>
          <span className="text-sm font-bold">{bottomName ?? "you"}</span>
        </div>
        <div className={`flex items-center gap-1 rounded-md px-3 py-1 font-mono text-lg font-black tabular-nums ${bottomActive ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
          <Clock className="h-4 w-4" />
          {fmtClock(bottomClock)}
        </div>
      </div>

      {game.status === "waiting" && (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-4 text-center text-sm text-muted-foreground">
          Waiting for an opponent… share this URL: <span className="font-mono">{window.location.href}</span>
        </div>
      )}

      {drawOfferToMe && (
        <div className="flex items-center justify-between rounded-xl border-2 border-primary bg-primary/10 p-3">
          <span className="text-sm font-bold">Opponent offers a draw</span>
          <Button size="sm" onClick={acceptDraw}>Accept</Button>
        </div>
      )}

      {game.status === "active" && myColor && (
        <div className="flex gap-2">
          <Button variant="destructive" className="flex-1" onClick={resign}>
            <Flag className="mr-2 h-4 w-4" /> Resign
          </Button>
          <Button variant="outline" className="flex-1" onClick={offerDraw}>
            <Handshake className="mr-2 h-4 w-4" /> Offer Draw
          </Button>
        </div>
      )}

      {resultBanner && (
        <div className="rounded-xl border-2 border-primary bg-primary/15 p-4 text-center">
          <p className="text-lg font-black">{resultBanner}</p>
          <Button className="mt-3" onClick={() => navigate("/chess")}>
            New Game
          </Button>
        </div>
      )}

      {game.pgn && (
        <div className="rounded-xl border border-border bg-card/50 p-3">
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Moves</p>
          <p className="break-words font-mono text-xs">{game.pgn}</p>
        </div>
      )}
    </div>
  );
}