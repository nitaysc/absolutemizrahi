import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { formatCoins } from "@/lib/format";
import { toast } from "sonner";
import { Bot, Crown, Play, LogOut, Swords } from "lucide-react";
import { CaseReel, type ReelItem } from "@/components/CaseReel";

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

const RARITY_TEXT: Record<string, string> = {
  common: "text-slate-300",
  uncommon: "text-emerald-400",
  rare: "text-sky-400",
  epic: "text-fuchsia-400",
  legendary: "text-amber-400",
  mythic: "text-rose-400",
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
  const [itemPools, setItemPools] = useState<Record<string, ReelItem[]>>({});
  // Index of round currently spinning across all lanes (-1 = idle)
  const [currentSpin, setCurrentSpin] = useState(-1);
  // True after the last round's reels have all visually landed
  const [revealComplete, setRevealComplete] = useState(false);
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
      const [{ data: cs }, { data: items }] = await Promise.all([
        supabase.from("cases").select("id,name,image").in("id", ids),
        supabase.from("case_items").select("case_id,name,image,value,rarity").in("case_id", ids),
      ]);
      const meta: Record<string, { name: string; image: string | null }> = {};
      (cs ?? []).forEach((c: any) => (meta[c.id] = { name: c.name, image: c.image }));
      setCaseMeta(meta);
      const pools: Record<string, ReelItem[]> = {};
      (items ?? []).forEach((it: any) => {
        if (!pools[it.case_id]) pools[it.case_id] = [];
        pools[it.case_id].push({ name: it.name, image: it.image, value: it.value, rarity: it.rarity });
      });
      setItemPools(pools);
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

  // Drive synchronized round-by-round reveal
  useEffect(() => {
    if (!battle) return;
    if (battle.status === "waiting") {
      setCurrentSpin(-1);
      setRevealComplete(false);
      return;
    }
    if (battle.status !== "finished") return;
    if (!rounds.length || !battle.rounds_total) return;

    setRevealComplete(false);
    setCurrentSpin(-1);
    const stepMs = battle.fast ? 2400 : 6200; // match reel duration + small pad
    const total = battle.rounds_total;
    let i = 0;
    setCurrentSpin(0);
    const t = setInterval(() => {
      i++;
      if (i >= total) {
        clearInterval(t);
        // After last spin lands, flip revealComplete
        setTimeout(() => setRevealComplete(true), battle.fast ? 1900 : 5400);
        return;
      }
      setCurrentSpin(i);
    }, stepMs);
    return () => clearInterval(t);
  }, [battle?.status, battle?.rounds_total, battle?.fast, rounds.length]);

  const isHost = battle?.host_id === profile?.id;
  const inBattle = !!players.find((p) => p.user_id === profile?.id);

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

  const showFinishedUI = battle.status === "finished" && revealComplete;
  const visibleSpinIdx = currentSpin; // round currently spinning across all lanes
  const visibleCase = bcases[visibleSpinIdx] ?? bcases[0];

  // Lane width tuned so 2-6 fit the row nicely on desktop
  const slots = battle.player_slots;

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
            Round {Math.max(0, Math.min(visibleSpinIdx + 1, battle.rounds_total))} / {battle.rounds_total}
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

      {/* Case track */}
      <div className="rounded-3xl border border-border bg-card/70 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Cases · {battle.rounds_total} rounds
          </div>
          {visibleCase && battle.status !== "waiting" && (
            <div className="flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              <span className="text-base">{caseMeta[visibleCase.case_id]?.image ?? "🎁"}</span>
              {caseMeta[visibleCase.case_id]?.name ?? "Case"}
            </div>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {bcases.map((bc, i) => {
            const meta = caseMeta[bc.case_id];
            const active = i === visibleSpinIdx && battle.status !== "waiting";
            const done = i < visibleSpinIdx;
            return (
              <div
                key={bc.id}
                className={`flex min-w-[60px] flex-col items-center rounded-xl border p-2 text-center transition ${
                  active
                    ? "scale-110 border-primary bg-primary/15 shadow-[0_0_15px_hsl(var(--primary)/0.5)]"
                    : done
                    ? "border-border opacity-40"
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

      {/* Lanes — Empire-Drop style side-by-side */}
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${slots}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: slots }).map((_, slot) => {
          const p = players.find((pp) => pp.slot === slot);
          const playerRounds = rounds
            .filter((r) => r.player_slot === slot)
            .sort((a, b) => a.round_index - b.round_index);

          const spinningRound = playerRounds.find((r) => r.round_index === visibleSpinIdx);
          const completedRounds = playerRounds.filter((r) => r.round_index < visibleSpinIdx);
          const totalSoFar =
            completedRounds.reduce((s, r) => s + r.item_value, 0) +
            (revealComplete && spinningRound ? spinningRound.item_value : 0);
          const poolForSpin = spinningRound ? itemPools[spinningRound.case_id] ?? [] : [];

          // Only reveal team winner glow after every reel has landed
          const isWinnerTeam =
            showFinishedUI && p && battle.winner_team === p.team;

          return (
            <div
              key={slot}
              className={`flex min-w-0 flex-col rounded-2xl border bg-card/70 p-3 transition ${
                isWinnerTeam
                  ? "border-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.55)]"
                  : "border-border"
              }`}
            >
              {/* Player header */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <PlayerAvatar avatar={p?.avatar} size={32} ring />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 truncate text-sm font-bold">
                      <span className="truncate">{p?.display_name ?? "Empty"}</span>
                      {p?.is_bot && <Bot className="h-3 w-3 shrink-0 text-muted-foreground" />}
                      {isWinnerTeam && <Crown className="h-3 w-3 shrink-0 text-amber-400" />}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Team {(p?.team ?? slot) + 1}
                    </div>
                  </div>
                </div>
                <div className="inline-flex shrink-0 items-center gap-1 text-xs font-black text-primary">
                  <MizrahiCoin size={10} /> {formatCoins(totalSoFar)}
                </div>
              </div>

              {/* Reel */}
              <div className="mt-3">
                {spinningRound && poolForSpin.length ? (
                  <CaseReel
                    pool={poolForSpin}
                    result={{
                      name: spinningRound.item_name,
                      image: spinningRound.item_image,
                      value: spinningRound.item_value,
                      rarity: spinningRound.rarity,
                      special_spin: spinningRound.special_spin,
                    }}
                    spinKey={`${slot}-${spinningRound.id}`}
                    durationMs={battle.fast ? 1800 : 5200}
                    size={slots <= 2 ? "md" : "sm"}
                    preBadge={
                      spinningRound.special_spin === "empire"
                        ? "empire"
                        : spinningRound.special_spin === "duel"
                        ? "duel"
                        : null
                    }
                  />
                ) : (
                  <div className="flex h-[256px] items-center justify-center rounded-2xl border border-dashed border-border bg-background/40 text-xs text-muted-foreground">
                    {battle.status === "waiting" ? "Waiting..." : "Get ready..."}
                  </div>
                )}
              </div>

              {/* Past rounds chips */}
              {completedRounds.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {completedRounds.map((r) => (
                    <div
                      key={r.id}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-background/60 px-1.5 py-0.5 text-[10px]"
                      title={`${r.item_name} · ${r.rarity}`}
                    >
                      <span>{r.item_image ?? "🎁"}</span>
                      <span className={`font-bold ${RARITY_TEXT[r.rarity] ?? RARITY_TEXT.common}`}>
                        {formatCoins(r.item_value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Winner badge */}
              {isWinnerTeam && (
                <motion.div
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 14 }}
                  className="mt-2 rounded-lg bg-amber-500/15 p-2 text-center text-xs font-black text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.5)]"
                >
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
                </motion.div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
