import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { ELO_TIERS, eloMultiplier } from "@/lib/stockfish";

type TC = "1+0" | "5+3" | "10+5";
const TC_OPTIONS: { v: TC; label: string }[] = [
  { v: "1+0", label: "Bullet 1+0" },
  { v: "5+3", label: "Blitz 5+3" },
  { v: "10+5", label: "Rapid 10+5" },
];

type WaitingGame = {
  id: string;
  bet: number;
  time_control: string;
  white_id: string | null;
  black_id: string | null;
  white_username: string | null;
  black_username: string | null;
  white_avatar: string | null;
  black_avatar: string | null;
  created_at: string;
};

export default function ChessLobby() {
  useTrackGame("chess");
  const navigate = useNavigate();
  const { profile } = useUserProfile();

  // AI form state
  const [eloIdx, setEloIdx] = useState(3); // 1600
  const [aiColor, setAiColor] = useState<"w" | "b" | "random">("w");
  const [aiTC, setAiTC] = useState<TC>("5+3");
  const [aiBet, setAiBet] = useState(0);
  const [creatingAI, setCreatingAI] = useState(false);

  // PvP form state
  const [pvpColor, setPvpColor] = useState<"w" | "b" | "random">("random");
  const [pvpTC, setPvpTC] = useState<TC>("5+3");
  const [pvpBet, setPvpBet] = useState(0);
  const [pvpBusy, setPvpBusy] = useState(false);

  const [waiting, setWaiting] = useState<WaitingGame[]>([]);

  const elo = ELO_TIERS[eloIdx];
  const mult = eloMultiplier(elo);

  // Subscribe to waiting PvP games
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase
        .from("chess_games")
        .select("id,bet,time_control,white_id,black_id,white_username,black_username,white_avatar,black_avatar,created_at")
        .eq("status", "waiting")
        .eq("mode", "pvp")
        .order("created_at", { ascending: false })
        .limit(50);
      if (mounted && data) setWaiting(data as WaitingGame[]);
    };
    load();
    const ch = supabase
      .channel("chess-lobby")
      .on("postgres_changes", { event: "*", schema: "public", table: "chess_games" }, load)
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, []);

  async function createAI() {
    if (creatingAI) return;
    if ((profile?.coins ?? 0) < aiBet) return toast.error("Insufficient coins");
    setCreatingAI(true);
    const { data, error } = await supabase.rpc("chess_create_ai", {
      _bet: aiBet,
      _elo: elo,
      _color: aiColor,
      _time_control: aiTC,
    });
    setCreatingAI(false);
    if (error) return toast.error(error.message);
    const id = data?.[0]?.game_id;
    if (id) navigate(`/chess/${id}`);
  }

  async function quickMatch() {
    if (pvpBusy) return;
    if ((profile?.coins ?? 0) < pvpBet) return toast.error("Insufficient coins");
    setPvpBusy(true);
    const { data, error } = await supabase.rpc("chess_quick_match", {
      _bet: pvpBet,
      _time_control: pvpTC,
    });
    setPvpBusy(false);
    if (error) return toast.error(error.message);
    const id = data?.[0]?.game_id;
    if (id) navigate(`/chess/${id}`);
  }

  async function createSeat() {
    if (pvpBusy) return;
    if ((profile?.coins ?? 0) < pvpBet) return toast.error("Insufficient coins");
    setPvpBusy(true);
    const { data, error } = await supabase.rpc("chess_create_pvp", {
      _bet: pvpBet,
      _color_pref: pvpColor,
      _time_control: pvpTC,
    });
    setPvpBusy(false);
    if (error) return toast.error(error.message);
    const id = data?.[0]?.game_id;
    if (id) navigate(`/chess/${id}`);
  }

  async function joinSeat(id: string) {
    setPvpBusy(true);
    const { error } = await supabase.rpc("chess_join_pvp", { _game_id: id });
    setPvpBusy(false);
    if (error) return toast.error(error.message);
    navigate(`/chess/${id}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Lobby
        </Link>
        <div className="flex items-center gap-2 text-sm font-bold">
          <MizrahiCoin size={18} />
          <span className="tabular-nums">{formatCoins(profile?.coins ?? 0)}</span>
        </div>
      </div>

      <h1 className="text-3xl font-black">
        <span className="text-gradient">CHESS</span>
      </h1>

      <Tabs defaultValue="ai" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="ai">Vs Stockfish</TabsTrigger>
          <TabsTrigger value="pvp">Vs Player</TabsTrigger>
        </TabsList>

        <TabsContent value="ai" className="space-y-5 rounded-2xl border border-border bg-card/60 p-5 backdrop-blur">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Stockfish Elo</span>
              <span className="text-2xl font-black tabular-nums">{elo}</span>
            </div>
            <Slider
              value={[eloIdx]}
              min={0}
              max={ELO_TIERS.length - 1}
              step={1}
              onValueChange={(v) => setEloIdx(v[0])}
            />
            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
              {ELO_TIERS.map((e) => (
                <span key={e}>{e}</span>
              ))}
            </div>
            <p className="mt-3 rounded-lg bg-primary/10 p-2 text-center text-sm">
              Win pays <span className="font-black text-primary">{mult.toFixed(2)}×</span> your bet
            </p>
          </div>

          <div>
            <span className="mb-2 block text-sm font-bold uppercase tracking-wider text-muted-foreground">Play as</span>
            <div className="grid grid-cols-3 gap-2">
              {(["w", "random", "b"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setAiColor(c)}
                  className={`rounded-lg border-2 px-3 py-2 text-sm font-bold transition ${
                    aiColor === c ? "border-primary bg-primary/15" : "border-border bg-card"
                  }`}
                >
                  {c === "w" ? "♔ White" : c === "b" ? "♚ Black" : "Random"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-sm font-bold uppercase tracking-wider text-muted-foreground">Time control</span>
            <div className="grid grid-cols-3 gap-2">
              {TC_OPTIONS.map((o) => (
                <button
                  key={o.v}
                  onClick={() => setAiTC(o.v)}
                  className={`rounded-lg border-2 px-2 py-2 text-xs font-bold transition ${
                    aiTC === o.v ? "border-primary bg-primary/15" : "border-border bg-card"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-sm font-bold uppercase tracking-wider text-muted-foreground">Bet</span>
            <input
              type="number"
              min={0}
              value={aiBet}
              onChange={(e) => setAiBet(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              className="w-full rounded-lg border-2 border-border bg-card px-3 py-2 text-lg font-bold tabular-nums"
            />
            <div className="mt-2 flex gap-2">
              {[0, 100, 500, 1000, 5000].map((v) => (
                <button
                  key={v}
                  onClick={() => setAiBet(v)}
                  className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-bold hover:border-primary"
                >
                  {v === 0 ? "Free" : formatCoins(v)}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={createAI} disabled={creatingAI} className="w-full text-base font-black" size="lg">
            {creatingAI ? "Starting..." : aiBet > 0 ? `Play (${formatCoins(aiBet)})` : "Play"}
          </Button>
        </TabsContent>

        <TabsContent value="pvp" className="space-y-5 rounded-2xl border border-border bg-card/60 p-5 backdrop-blur">
          <div>
            <span className="mb-2 block text-sm font-bold uppercase tracking-wider text-muted-foreground">Time control</span>
            <div className="grid grid-cols-3 gap-2">
              {TC_OPTIONS.map((o) => (
                <button
                  key={o.v}
                  onClick={() => setPvpTC(o.v)}
                  className={`rounded-lg border-2 px-2 py-2 text-xs font-bold transition ${
                    pvpTC === o.v ? "border-primary bg-primary/15" : "border-border bg-card"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-sm font-bold uppercase tracking-wider text-muted-foreground">Bet</span>
            <input
              type="number"
              min={0}
              value={pvpBet}
              onChange={(e) => setPvpBet(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              className="w-full rounded-lg border-2 border-border bg-card px-3 py-2 text-lg font-bold tabular-nums"
            />
          </div>

          <div>
            <span className="mb-2 block text-sm font-bold uppercase tracking-wider text-muted-foreground">Color preference</span>
            <div className="grid grid-cols-3 gap-2">
              {(["w", "random", "b"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setPvpColor(c)}
                  className={`rounded-lg border-2 px-3 py-2 text-sm font-bold transition ${
                    pvpColor === c ? "border-primary bg-primary/15" : "border-border bg-card"
                  }`}
                >
                  {c === "w" ? "♔ White" : c === "b" ? "♚ Black" : "Random"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={quickMatch} disabled={pvpBusy} className="font-black" size="lg">
              Quick Match
            </Button>
            <Button onClick={createSeat} disabled={pvpBusy} variant="outline" className="font-black" size="lg">
              Create Seat
            </Button>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Open seats</h3>
            <div className="space-y-2">
              {waiting.length === 0 && (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  No open seats. Create one or quick-match.
                </p>
              )}
              {waiting.map((g) => {
                const host = g.white_id ? { name: g.white_username, avatar: g.white_avatar, color: "♔" } : { name: g.black_username, avatar: g.black_avatar, color: "♚" };
                return (
                  <div key={g.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{host.avatar ?? "🎰"}</span>
                      <div>
                        <p className="text-sm font-bold">{host.name ?? "player"} <span className="text-muted-foreground">{host.color}</span></p>
                        <p className="text-xs text-muted-foreground">{g.time_control} · {g.bet > 0 ? formatCoins(g.bet) : "Free"}</p>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => joinSeat(g.id)} disabled={pvpBusy}>
                      Join
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}