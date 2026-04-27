import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { toast } from "sonner";
import { Bot, Crown, Play, LogOut, Sparkles, Swords } from "lucide-react";

type Battle = {
  id: string;
  host_id: string;
  mode: string;
  type: string;
  status: string;
  total_cost: number;
  per_player_cost: number;
  player_slots: number;
  team_size: number;
  rounds_total: number;
  current_round: number;
  fast: boolean;
  fill_with_bots: boolean;
  winner_team: number | null;
  pot_payout: number | null;
};
type Player = {
  id: string;
  slot: number;
  team: number;
  user_id: string | null;
  is_bot: boolean;
  display_name: string;
  avatar: string;
  total_winnings: number;
};
type BattleCase = { id: string; case_id: string; position: number };
type Round = {
  id: string;
  round_index: number;
  player_slot: number;
  case_id: string;
  item_name: string;
  item_image: string | null;
  item_value: number;
  rarity: string;
  special_spin: string;
};

const RARITY: Record<string, string> = {
  common: "from-slate-500/40 to-slate-700/20 border-slate-500/40",
  uncommon: "from-emerald-500/40 to-emerald-700/20 border-emerald-400/50",
  rare: "from-sky-500/40 to-blue-700/20 border-sky-400/50",
  epic: "from-fuchsia-500/40 to-purple-700/20 border-fuchsia-400/60",
  legendary: "from-amber-500/50 to-orange-700/20 border-amber-400/70",
  mythic: "from-rose-500/60 to-pink-700/20 border-rose-400/80",
};

export default function CaseBattleRoom() {
  const { id } = useParams();
  const { profile, refetch } = useUserProfile();
  const navigate = useNavigate();
  const [battle, setBattle] = useState<Battle | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [bcases, setBcases] = useState<BattleCase[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [caseMeta, setCaseMeta] = useState<Record<string, { name: string; image: string | null }>>({});
  const [revealCount, setRevealCount] = useState(0);
  const [busy, setBusy] = useState(false);

  async function refreshAll() {
    const [{ data: b }, { data: p }, { data: bc }, { data: r }] = await Promise.all([
      supabase.from("case_battles").select("*").eq("id", id!).maybeSingle(),
      supabase.from("battle_players").select("*").eq("battle_id", id!).order("slot"),
      supabase.from("battle_cases").select("*").eq("battle_id", id!).order("position"),
      supabase.from("battle_rounds").select("*").eq("battle_id", id!).order("round_index"),
    ]);
    setBattle(b as Battle | null);
    setPlayers((p ?? []) as Player[]);
    setBcases((bc ?? []) as BattleCase[]);
    setRounds((r ?? []) as Round[]);
    if (bc && bc.length) {
      const ids = Array.from(new Set(bc.map((x) => x.case_id)));
      const { data: cs } = await supabase
        .from("cases")
        .select("id,name,image")
        .in("id", ids);
      const meta: Record<string, { name: string; image: string | null }> = {};
      (cs ?? []).forEach((c) => (meta[c.id] = { name: c.name, image: c.image }));
      setCaseMeta(meta);
    }
  }

  useEffect(() => {
    if (!id) return;
    refreshAll();
    const ch = supabase
      .channel(`battle-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "case_battles", filter: `id=eq.${id}` }, refreshAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "battle_players", filter: `battle_id=eq.${id}` }, refreshAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "battle_rounds", filter: `battle_id=eq.${id}` }, refreshAll)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Reveal rounds one-by-one for animation
  useEffect(() => {
    if (!battle || battle.status !== "finished") {
      setRevealCount(rounds.length > 0 ? rounds.length : 0);
      return;
    }
    setRevealCount(0);
    const stepMs = battle.fast ? 350 : 900;
    let i = 0;
    const total = battle.rounds_total;
    const t = setInterval(() => {
      i++;
      setRevealCount(i);
      if (i >= total) clearInterval(t);
    }, stepMs);
    return () => clearInterval(t);
  }, [battle?.status, battle?.rounds_total, battle?.fast, rounds.length]);

  const isHost = battle?.host_id === profile?.id;
  const inBattle = !!players.find((p) => p.user_id === profile?.id);
  const teams = useMemo(() => {
    if (!battle) return [];
    const t: Player[][] = [];
    const teamCount = battle.player_slots / battle.team_size;
    for (let i = 0; i < teamCount; i++) {
      t.push(players.filter((p) => p.team === i).sort((a, b) => a.slot - b.slot));
    }
    return t;
  }, [battle, players]);

  async function join() {
    setBusy(true);
    const { error } = await supabase.rpc("join_case_battle", { _battle_id: id! });
    setBusy(false);
    if (error) return toast.error(error.message);
    refetch();
  }
  async function leave() {
    setBusy(true);
    const { error } = await supabase.rpc("leave_case_battle", { _battle_id: id! });
    setBusy(false);
    if (error) return toast.error(error.message);
    refetch();
    if (isHost) navigate("/cases/battles");
  }
  async function start() {
    setBusy(true);
    const { error } = await supabase.rpc("start_case_battle", { _battle_id: id! });
    setBusy(false);
    if (error) return toast.error(error.message);
    setTimeout(() => refetch(), 1500);
  }

  if (!battle) return <p className="text-muted-foreground">Loading battle...</p>;

  const currentReveal = Math.min(revealCount, battle.rounds_total);
  const cur = bcases[currentReveal - 1] ?? bcases[0];

  return (
    <div className="space-y-4">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-card/70 p-4">
        <div className="flex items-center gap-2">
          <Swords className="h-5 w-5 text-primary" />
          <span className="font-black">{battle.mode.toUpperCase()}</span>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
            {battle.type}
          </span>
          <span className="text-xs text-muted-foreground">
            Round {Math.min(currentReveal, battle.rounds_total)} / {battle.rounds_total}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 font-black text-primary">
            <MizrahiCoin size={14} /> {formatCoins(battle.total_cost)}
          </span>
          {battle.status === "waiting" && (
            <>
              {!inBattle && players.length < battle.player_slots && (
                <button
                  onClick={join}
                  disabled={busy}
                  className="rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground"
                >
                  Join ({formatCoins(battle.per_player_cost)})
                </button>
              )}
              {inBattle && (
                <button
                  onClick={leave}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm"
                >
                  <LogOut className="h-3 w-3" /> Leave
                </button>
              )}
              {isHost && (
                <button
                  onClick={start}
                  disabled={busy || (!battle.fill_with_bots && players.length < battle.player_slots)}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-bold text-emerald-950 disabled:bg-muted disabled:text-muted-foreground"
                >
                  <Play className="h-3 w-3" /> Start
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {/* Case row */}
      <div className="overflow-x-auto rounded-3xl border border-border bg-card/70 p-4">
        <div className="flex gap-2">
          {bcases.map((bc, i) => {
            const meta = caseMeta[bc.case_id];
            const active = i === currentReveal - 1 && battle.status !== "waiting";
            const done = i < currentReveal - 1 || battle.status === "finished";
            return (
              <div
                key={bc.id}
                className={`flex min-w-[60px] flex-col items-center rounded-xl border p-2 text-center transition ${
                  active
                    ? "border-primary bg-primary/15 shadow-[0_0_15px_hsl(var(--primary)/0.5)]"
                    : done
                    ? "border-border opacity-50"
                    : "border-border"
                }`}
              >
                <div className="text-2xl">{meta?.image ?? "🎁"}</div>
                <div className="text-[10px] font-bold">{i + 1}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Players */}
      <div className={`grid gap-3 ${battle.player_slots === 2 ? "md:grid-cols-2" : battle.player_slots === 3 ? "md:grid-cols-3" : battle.player_slots === 4 ? "md:grid-cols-4" : "md:grid-cols-3 lg:grid-cols-6"}`}>
        {Array.from({ length: battle.player_slots }).map((_, slot) => {
          const p = players.find((pp) => pp.slot === slot);
          const playerRounds = rounds
            .filter((r) => r.player_slot === slot && r.round_index < currentReveal)
            .sort((a, b) => b.round_index - a.round_index);
          const latest = playerRounds[0];
          const isWinnerTeam =
            battle.status === "finished" &&
            currentReveal >= battle.rounds_total &&
            p &&
            battle.winner_team === p.team;
          return (
            <div
              key={slot}
              className={`flex flex-col rounded-2xl border bg-card p-3 ${
                isWinnerTeam ? "border-amber-400 shadow-[0_0_25px_hsl(45,100%,60%,0.5)]" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{p?.avatar ?? "❓"}</span>
                  <div>
                    <div className="flex items-center gap-1 text-sm font-bold">
                      {p?.display_name ?? "Empty slot"}
                      {p?.is_bot && <Bot className="h-3 w-3 text-muted-foreground" />}
                      {isWinnerTeam && <Crown className="h-3 w-3 text-amber-400" />}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Team {(p?.team ?? slot) + 1}</div>
                  </div>
                </div>
                <div className="inline-flex items-center gap-1 text-xs font-black text-primary">
                  <MizrahiCoin size={10} />{" "}
                  {formatCoins(
                    rounds
                      .filter((r) => r.player_slot === slot && r.round_index < currentReveal)
                      .reduce((s, r) => s + r.item_value, 0)
                  )}
                </div>
              </div>

              {/* Reel */}
              <div className="relative mt-3 flex h-32 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
                <AnimatePresence mode="popLayout">
                  {latest ? (
                    <motion.div
                      key={latest.id}
                      initial={{ y: -80, opacity: 0, scale: 0.7 }}
                      animate={{ y: 0, opacity: 1, scale: 1 }}
                      exit={{ y: 80, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 200, damping: 20 }}
                      className={`absolute inset-2 flex flex-col items-center justify-center rounded-lg border-2 bg-gradient-to-b ${
                        RARITY[latest.rarity] ?? RARITY.common
                      }`}
                    >
                      {latest.special_spin !== "none" && (
                        <div className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-fuchsia-500/30 px-2 py-0.5 text-[9px] font-black uppercase text-fuchsia-200">
                          <Sparkles className="h-2.5 w-2.5" />
                          {latest.special_spin === "empire" ? "Empire Spin" : "Duel Spin"}
                        </div>
                      )}
                      <div className="text-4xl">{latest.item_image ?? "🎁"}</div>
                      <div className="text-[10px] font-bold uppercase opacity-80">
                        {latest.rarity}
                      </div>
                      <div className="truncate px-1 text-xs font-bold">{latest.item_name}</div>
                      <div className="inline-flex items-center gap-1 text-[10px] font-black">
                        <MizrahiCoin size={8} /> {formatCoins(latest.item_value)}
                      </div>
                    </motion.div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {battle.status === "waiting" ? "Waiting..." : "Spinning..."}
                    </span>
                  )}
                </AnimatePresence>
              </div>

              {/* Bet bar */}
              {battle.status === "finished" && currentReveal >= battle.rounds_total && isWinnerTeam && (
                <div className="mt-2 rounded-lg bg-amber-500/15 p-2 text-center text-xs font-black text-amber-400">
                  WINNER · +
                  {formatCoins(
                    Math.floor(
                      (battle.pot_payout ?? 0) /
                        Math.max(
                          1,
                          players.filter((pp) => pp.team === p?.team && !pp.is_bot).length
                        )
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}