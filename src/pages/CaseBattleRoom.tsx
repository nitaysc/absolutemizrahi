import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { formatCoins } from "@/lib/format";
import { toast } from "sonner";
import { Bot, Crown, Play, LogOut, Swords, X, RotateCcw, Pencil, Trophy, UserPlus } from "lucide-react";
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
  finished_at: string | null;
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

// Per-team colour palette so teammates are instantly recognisable.
// Index 0 = team 1, index 1 = team 2, etc. Cycles after 4.
const TEAM_STYLES: { border: string; bg: string; chip: string; dot: string; label: string }[] = [
  { border: "border-sky-400/70", bg: "bg-sky-500/5", chip: "bg-sky-500/20 text-sky-200", dot: "bg-sky-400", label: "text-sky-300" },
  { border: "border-rose-400/70", bg: "bg-rose-500/5", chip: "bg-rose-500/20 text-rose-200", dot: "bg-rose-400", label: "text-rose-300" },
  { border: "border-emerald-400/70", bg: "bg-emerald-500/5", chip: "bg-emerald-500/20 text-emerald-200", dot: "bg-emerald-400", label: "text-emerald-300" },
  { border: "border-amber-400/70", bg: "bg-amber-500/5", chip: "bg-amber-500/20 text-amber-200", dot: "bg-amber-400", label: "text-amber-300" },
];
const teamStyle = (team: number | undefined) => TEAM_STYLES[(team ?? 0) % TEAM_STYLES.length];

function ImgOrEmoji({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  if (src && /^https?:\/\//i.test(src)) {
    return <img src={src} alt={alt} className={className} loading="lazy" />;
  }
  return <span className={className}>{src ?? "🎁"}</span>;
}

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
  // Countdown until auto-start once bots are filled (null = no countdown)
  const [autoStartIn, setAutoStartIn] = useState<number | null>(null);
  // Track previous human-player count so we can extend the countdown when
  // a new player joins (gives the room time to settle / let others join too).
  const prevPlayerCountRef = useRef<number>(0);

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

  // Drive synchronized round-by-round reveal.
  // Uses a single ref-based flag so we only run the animation ONCE per battle
  // (otherwise re-renders from realtime updates would keep restarting it).
  const animRunRef = useRef<string | null>(null);
  useEffect(() => {
    if (!battle) return;
    if (battle.status === "waiting") {
      setCurrentSpin(-1);
      setRevealComplete(false);
      animRunRef.current = null;
      return;
    }
    if (battle.status !== "finished") return;
    if (!rounds.length || !battle.rounds_total) return;
    // Only animate ONCE per battle id. If the user re-opens a finished battle,
    // skip animation and reveal everything immediately.
    if (animRunRef.current === battle.id) return;
    animRunRef.current = battle.id;

    // If the battle finished more than 30s ago, treat it as "already played" and
    // skip the animation — that prevents the room feeling "stuck" when revisiting.
    const finishedSecs =
      battle.status === "finished" && battle.finished_at
        ? (Date.now() - new Date(battle.finished_at).getTime()) / 1000
        : 0;
    if (finishedSecs > 30) {
      setCurrentSpin(battle.rounds_total - 1);
      setRevealComplete(true);
      return;
    }

    setRevealComplete(false);
    setCurrentSpin(0);
    // Per-round dynamic pacing: special spins (Empire/Duel) need extra time
    // because they play a 2-stage animation. We schedule each round's advance
    // individually based on whether ANY lane in that round has a special spin.
    const total = battle.rounds_total;
    const baseSpin = battle.fast ? 1600 : 4200; // matches CaseReel durationMs
    // Stage-2 of a special spin is min 1800ms (see CaseReel) + ~700ms gap.
    // Add a buffer so the second spin fully finishes before we advance.
    const specialExtra = battle.fast ? 2700 : 3600;
    const tail = battle.fast ? 600 : 1200;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const roundHasSpecial = (idx: number) =>
      rounds.some(
        (r) => r.round_index === idx && (r.special_spin === "empire" || r.special_spin === "duel"),
      );
    let elapsed = 0;
    for (let i = 1; i <= total; i++) {
      const prev = i - 1;
      const dur = baseSpin + (roundHasSpecial(prev) ? specialExtra : 0) + tail;
      elapsed += dur;
      const at = elapsed;
      if (i < total) {
        timeouts.push(setTimeout(() => setCurrentSpin(i), at));
      } else {
        timeouts.push(
          setTimeout(() => {
            setRevealComplete(true);
            refetch();
          }, at),
        );
      }
    }
    // Failsafe — never let the UI hang past elapsed + 4s
    const failSafe = setTimeout(
      () => {
        setRevealComplete(true);
        refetch();
      },
      elapsed + 4000,
    );
    return () => {
      timeouts.forEach(clearTimeout);
      clearTimeout(failSafe);
    };
  }, [battle?.status, battle?.rounds_total, battle?.fast, battle?.id, rounds.length]);

  const isHost = battle?.host_id === profile?.id;
  const inBattle = !!players.find((p) => p.user_id === profile?.id);

  // Auto-start: when bots-fill is enabled and there's at least one human, run a 3s countdown
  // and then auto-call start_case_battle. Only the host triggers the RPC to avoid races.
  useEffect(() => {
    if (!battle) return;
    if (battle.status !== "waiting") {
      setAutoStartIn(null);
      prevPlayerCountRef.current = 0;
      return;
    }
    // Trigger auto-start when EITHER:
    //  - fill_with_bots is on and at least one human is in, OR
    //  - the lobby is fully filled (humans + bots called manually)
    const lobbyFull = players.length >= battle.player_slots;
    const botsFlow = battle.fill_with_bots && players.length > 0;
    if (!lobbyFull && !botsFlow) {
      setAutoStartIn(null);
      prevPlayerCountRef.current = players.length;
      return;
    }
    // If a new player just joined, extend the countdown to give others a chance.
    const justJoined = players.length > prevPlayerCountRef.current;
    prevPlayerCountRef.current = players.length;
    if (autoStartIn === null) {
      setAutoStartIn(3);
    } else if (justJoined) {
      // Extend grace period when a fresh player slides in.
      setAutoStartIn((v) => Math.max(v ?? 0, 6));
    }
    const t = setInterval(() => {
      setAutoStartIn((v) => {
        if (v === null) return null;
        if (v <= 1) {
          clearInterval(t);
          if (isHost && !busy) {
            void start();
          }
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle?.status, battle?.fill_with_bots, players.length, isHost]);

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

  async function callBot() {
    setBusy(true);
    const { error } = await supabase.rpc("add_bot_to_battle", { _battle_id: id! });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Bot called in!");
  }

  // Build the case_ids list for "Recreate" / "Edit Battle"
  const caseIdList = useMemo(
    () => bcases.slice().sort((a, b) => a.position - b.position).map((bc) => bc.case_id),
    [bcases],
  );

  async function recreate() {
    if (!battle || !caseIdList.length) return;
    if (!profile || profile.coins < battle.per_player_cost) {
      return toast.error("Not enough coins");
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("create_case_battle", {
      _mode: battle.mode,
      _type: battle.type,
      _case_ids: caseIdList,
      _fill_with_bots: battle.fill_with_bots,
      _fast: battle.fast,
      _private: false,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    refetch();
    navigate(`/cases/battles/${data}`);
  }

  function editBattle() {
    if (!battle || !caseIdList.length) return;
    const params = new URLSearchParams({
      mode: battle.mode,
      type: battle.type,
      cases: caseIdList.join(","),
      bots: battle.fill_with_bots ? "1" : "0",
      fast: battle.fast ? "1" : "0",
    });
    navigate(`/cases/battles/new?${params.toString()}`);
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
              {isHost && !battle.fill_with_bots && (
                <button
                  onClick={start}
                  disabled={busy || (!battle.fill_with_bots && players.length < battle.player_slots)}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-bold text-emerald-950 disabled:bg-muted disabled:text-muted-foreground"
                >
                  <Play className="h-3 w-3" /> Start
                </button>
              )}
              {isHost && players.length < battle.player_slots && (
                <button
                  onClick={callBot}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/50 bg-fuchsia-500/15 px-3 py-1.5 text-sm font-bold text-fuchsia-200 hover:bg-fuchsia-500/25 disabled:opacity-50"
                  title="Add a bot to fill an empty slot"
                >
                  <UserPlus className="h-3 w-3" /> Call Bot
                </button>
              )}
              {autoStartIn !== null && autoStartIn > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-3 py-1.5 text-sm font-black text-amber-300 animate-pulse">
                  Auto-start in {autoStartIn}s
                </span>
              )}
            </>
          )}
          {showFinishedUI && (
            <button
              onClick={() => navigate("/cases/battles")}
              className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground"
            >
              <X className="h-3 w-3" /> Exit
            </button>
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
              <ImgOrEmoji
                src={caseMeta[visibleCase.case_id]?.image}
                alt={caseMeta[visibleCase.case_id]?.name ?? "case"}
                className="h-5 w-5 object-contain text-base"
              />
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
                <div className="flex h-8 w-8 items-center justify-center text-2xl">
                  <ImgOrEmoji src={meta?.image} alt={meta?.name ?? "case"} className="h-8 w-8 object-contain text-2xl" />
                </div>
                <div className="text-[10px] font-bold">{i + 1}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lanes — Empire-Drop style side-by-side */}
      {battle.team_size >= 1 && (() => {
        // Aggregate per-team totals from rounds revealed so far.
        const teamTotals = new Map<number, number>();
        const teamMembers = new Map<number, Player[]>();
        players.forEach((pp) => {
          if (!teamMembers.has(pp.team)) teamMembers.set(pp.team, []);
          teamMembers.get(pp.team)!.push(pp);
        });
        players.forEach((pp) => {
          const playerRounds = rounds
            .filter((r) => r.player_slot === pp.slot)
            .sort((a, b) => a.round_index - b.round_index);
          const completed = playerRounds.filter((r) => r.round_index < visibleSpinIdx);
          const spinning = playerRounds.find((r) => r.round_index === visibleSpinIdx);
          const sum =
            completed.reduce((s, r) => s + r.item_value, 0) +
            (revealComplete && spinning ? spinning.item_value : 0);
          teamTotals.set(pp.team, (teamTotals.get(pp.team) ?? 0) + sum);
        });
        const teams = Array.from(teamMembers.keys()).sort((a, b) => a - b);
        if (teams.length < 2) return null;
        const leading = Math.max(...Array.from(teamTotals.values()));
        return (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {teams.map((t) => {
              const ts = teamStyle(t);
              const total = teamTotals.get(t) ?? 0;
              const isLeading = total > 0 && total === leading;
              const isWinner = showFinishedUI && battle.winner_team === t;
              return (
                <div
                  key={t}
                  className={`flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-xs font-black uppercase tracking-wider transition ${
                    isWinner
                      ? "border-amber-400 bg-amber-500/15 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.5)]"
                      : `${ts.border} ${ts.bg} ${ts.label}`
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${ts.dot}`} />
                  <span>Team {t + 1}</span>
                  <span className="inline-flex items-center gap-1 text-primary">
                    <MizrahiCoin size={10} /> {formatCoins(total)}
                  </span>
                  {isLeading && !isWinner && (
                    <span className="text-[9px] text-amber-300">LEADING</span>
                  )}
                  {isWinner && <Crown className="h-3 w-3 text-amber-400" />}
                </div>
              );
            })}
          </div>
        );
      })()}

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
          const ts = teamStyle(p?.team ?? slot);
          // Only show team colours when there's actual team play (>=2 teams,
          // since 1v1 already has 2 distinct teams). Always-on is fine.

          return (
            <div
              key={slot}
              className={`flex min-w-0 flex-col rounded-2xl border-2 ${ts.bg} p-3 transition ${
                isWinnerTeam
                  ? "border-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.55)]"
                  : `${ts.border} shadow-[0_0_18px_-6px_currentColor] ${ts.label}`
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
                    <div className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${ts.chip}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${ts.dot}`} />
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
                    durationMs={battle.fast ? 1600 : 4200}
                    size={slots <= 2 ? "md" : "sm"}
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
              {isWinnerTeam && p && (
                <motion.div
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 14 }}
                  className="mt-2 rounded-lg bg-amber-500/15 p-2 text-center text-xs font-black text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.5)]"
                >
                  {(() => {
                    const teammates = players.filter((pp) => pp.team === p.team);
                    if (p.is_bot) return "WINNER · BOT (no payout)";
                    const share = Math.floor((battle.pot_payout ?? 0) / Math.max(1, teammates.length));
                    return `WINNER · +${formatCoins(share)}`;
                  })()}
                </motion.div>
              )}
            </div>
          );
        })}
      </div>

      {/* Winner end screen */}
      <AnimatePresence>
        {showFinishedUI && battle.winner_team !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/85 p-4 backdrop-blur-2xl"
          >
            {/* Glow background */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,hsl(var(--primary)/0.35),transparent_60%)]" />

            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 180, damping: 18 }}
              className="relative z-10 my-6 w-full max-w-3xl space-y-6 rounded-3xl border border-primary/40 bg-card/80 p-6 shadow-[0_0_60px_-10px_hsl(var(--primary)/0.7)] sm:p-8"
            >
              {/* Title */}
              <div className="text-center">
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground"
                >
                  Battle complete
                </motion.p>
                <motion.h2
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 220, damping: 14 }}
                  className="mt-2 bg-gradient-to-r from-amber-300 via-primary to-fuchsia-400 bg-clip-text text-3xl font-black italic tracking-wide text-transparent drop-shadow-[0_0_20px_hsl(var(--primary)/0.5)] sm:text-4xl"
                >
                  THE BATTLE HAS ENDED
                </motion.h2>
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-bold uppercase text-primary">
                  <Swords className="h-3 w-3" />
                  {battle.mode} · {battle.type}
                </div>
                <div className="mt-3 inline-flex flex-wrap items-center justify-center gap-2 text-xs">
                  <span className="rounded-full border border-border bg-background/50 px-3 py-1">
                    Pot:{" "}
                    <span className="font-black text-primary">
                      {formatCoins(battle.pot_payout ?? 0)}
                    </span>
                  </span>
                  <span className="rounded-full border border-border bg-background/50 px-3 py-1 text-muted-foreground">
                    Total wagered:{" "}
                    <span className="font-black text-foreground">
                      {formatCoins(battle.total_cost)}
                    </span>
                  </span>
                </div>
              </div>

              {/* Winner cards */}
              <div className="flex flex-wrap items-stretch justify-center gap-3">
                {players
                  .filter((p) => p.team === battle.winner_team)
                  .map((p, i) => {
                    const winners = players.filter((pp) => pp.team === battle.winner_team);
                    const humanWinners = winners.filter((pp) => !pp.is_bot).length;
                    const pot = battle.pot_payout ?? 0;
                    // Pot is split across the full team (humans + bots).
                    // Bots forfeit their share — humans only get their fair fraction.
                    const perSeat = winners.length > 0 ? Math.floor(pot / winners.length) : 0;
                    const myShare = p.is_bot ? 0 : perSeat;
                    const sharePct = pot > 0 ? (myShare / pot) * 100 : 0;
                    return (
                      <motion.div
                        key={p.id}
                        initial={{ scale: 0.6, opacity: 0, y: 30 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        transition={{
                          delay: 0.35 + i * 0.12,
                          type: "spring",
                          stiffness: 200,
                          damping: 14,
                        }}
                        className="relative w-44 overflow-hidden rounded-2xl border-2 border-amber-400/70 bg-gradient-to-b from-amber-400/15 via-primary/10 to-fuchsia-500/15 p-4 text-center shadow-[0_0_30px_rgba(245,158,11,0.45)]"
                      >
                        {/* WINNER chip */}
                        <div className="mx-auto mb-2 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-fuchsia-500 px-3 py-0.5 text-[10px] font-black uppercase tracking-widest text-background shadow-[0_0_15px_rgba(245,158,11,0.6)]">
                          <Trophy className="h-3 w-3" /> Winner
                        </div>
                        <div className="relative mx-auto mb-2 h-16 w-16">
                          <motion.div
                            animate={{ scale: [1, 1.06, 1] }}
                            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                            className="absolute inset-0 rounded-full bg-amber-400/30 blur-xl"
                          />
                          <div className="relative">
                            <PlayerAvatar avatar={p.avatar} size={64} ring />
                          </div>
                          <Crown className="absolute -top-2 left-1/2 h-5 w-5 -translate-x-1/2 text-amber-300 drop-shadow-[0_0_6px_rgba(245,158,11,0.9)]" />
                        </div>
                        <div className="flex items-center justify-center gap-1 truncate text-sm font-black">
                          <span className="truncate">{p.display_name}</span>
                          {p.is_bot && <Bot className="h-3 w-3 shrink-0 text-muted-foreground" />}
                        </div>
                        {p.is_bot ? (
                          <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-background/60 px-2 py-0.5 text-[11px] font-black text-muted-foreground">
                            BOT · no payout
                          </div>
                        ) : (
                          <>
                            <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-background/60 px-2 py-0.5 text-sm font-black text-amber-300">
                              <MizrahiCoin size={12} /> {formatCoins(myShare)}
                            </div>
                            <div className="mt-1 text-[10px] font-bold text-muted-foreground">
                              {sharePct.toFixed(0)}% of pot
                            </div>
                          </>
                        )}
                      </motion.div>
                    );
                  })}
              </div>

              {/* Split summary line */}
              {(() => {
                const winners = players.filter((pp) => pp.team === battle.winner_team);
                const humanWinners = winners.filter((pp) => !pp.is_bot).length;
                const botWinners = winners.length - humanWinners;
                if (winners.length <= 1) return null;
                return (
                  <div className="mx-auto max-w-md rounded-2xl border border-border bg-background/40 px-4 py-2 text-center text-xs text-muted-foreground">
                    Pot of{" "}
                    <span className="font-black text-primary">
                      {formatCoins(battle.pot_payout ?? 0)}
                    </span>{" "}
                    split equally across the{" "}
                    <span className="font-black text-foreground">{winners.length}</span>-seat
                    winning team
                    {botWinners > 0 && (
                      <>
                        {" "}· <span className="font-bold">{botWinners}</span>{" "}
                        {botWinners === 1 ? "bot share is" : "bot shares are"} forfeited
                      </>
                    )}
                    .
                  </div>
                );
              })()}

              {/* Action buttons */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="flex flex-wrap items-center justify-center gap-2 pt-2"
              >
                <button
                  onClick={() => navigate("/cases/battles")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-4 py-2 text-sm font-bold text-foreground hover:border-primary/50"
                >
                  <X className="h-4 w-4" /> Exit
                </button>
                <button
                  onClick={recreate}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-black text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.6)] disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  Recreate for {formatCoins(battle.per_player_cost)}
                </button>
                {isHost && (
                  <button
                    onClick={editBattle}
                    className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-400/50 bg-fuchsia-500/15 px-4 py-2 text-sm font-bold text-fuchsia-200 hover:bg-fuchsia-500/25"
                  >
                    <Pencil className="h-4 w-4" /> Edit Battle
                  </button>
                )}
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
