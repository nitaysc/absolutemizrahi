import { useCallback, useEffect, useMemo, useState } from "react";
import { useTrackGame } from "@/hooks/usePresence";
import { useUserProfile } from "@/hooks/useUserProfile";
import { supabase } from "@/integrations/supabase/client";
import { formatCoins } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RefreshCw, ShieldCheck, Timer, CalendarDays, Zap, TrendingUp, Lock } from "lucide-react";

type Team = {
  id: string;
  name: string;
  abbrev: string;
  score: number;
  logo?: string;
  logoCandidates?: string[];
  /** Win-loss record parsed from ESPN, e.g. { w: 50, l: 32 }. */
  record?: { w: number; l: number };
};

const ESPN_LOGO_KEY_BY_TRICODE: Record<string, string> = {
  ATL: "atl",
  BKN: "bkn",
  BOS: "bos",
  CHA: "cha",
  CHI: "chi",
  CLE: "cle",
  DAL: "dal",
  DEN: "den",
  DET: "det",
  GSW: "gs",
  HOU: "hou",
  IND: "ind",
  LAC: "lac",
  LAL: "lal",
  MEM: "mem",
  MIA: "mia",
  MIL: "mil",
  MIN: "min",
  NOP: "no",
  NYK: "ny",
  OKC: "okc",
  ORL: "orl",
  PHI: "phi",
  PHX: "phx",
  POR: "por",
  SAC: "sac",
  SAS: "sa",
  TOR: "tor",
  UTA: "utah",
  WAS: "wsh",
};

function getNbaLogoCandidates(teamId: string, tricode: string) {
  const normalizedId = String(teamId ?? "").trim();
  const normalizedTri = String(tricode ?? "").trim().toUpperCase();
  const espnKey = ESPN_LOGO_KEY_BY_TRICODE[normalizedTri] ?? normalizedTri.toLowerCase();

  return [
    normalizedId ? `https://cdn.nba.com/logos/nba/${normalizedId}/primary/L/logo.svg` : "",
    normalizedId ? `https://cdn.nba.com/logos/nba/${normalizedId}/global/L/logo.svg` : "",
    espnKey ? `https://a.espncdn.com/i/teamlogos/nba/500/${espnKey}.png` : "",
    espnKey ? `https://a.espncdn.com/i/teamlogos/nba/500-dark/${espnKey}.png` : "",
  ].filter(Boolean);
}

type Matchup = {
  id: string;
  name: string;
  startTime: string;
  completed: boolean;
  isLive: boolean;
  status: string;
  source: "espn" | "nba";
  teams: [Team, Team];
};

type LockedBet = {
  betId: string;
  eventId: string;
  eventName: string;
  pickedTeamId: string;
  pickedTeamName: string;
  amount: number;
  /** Multiplier promised at lock time — what we pay out if they win. */
  multiplier: number;
};

/** House edge applied to the fair multiplier (5%). */
const HOUSE_EDGE = 0.05;
/** Minimum multiplier we'll ever pay (capping huge favorites). */
const MIN_MULTIPLIER = 1.05;
/** Maximum multiplier (capping crazy underdogs / no-record games). */
const MAX_MULTIPLIER = 10;
const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const NBA_SCOREBOARD_URL =
  "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json";
const BETTING_WINDOW_DAYS = 7;
const SETTLEMENT_LOOKBACK_DAYS = 2;

/** Convert a fair win probability (0-1) into a payout multiplier. */
function probabilityToMultiplier(p: number) {
  const clamped = Math.max(0.02, Math.min(0.98, p));
  const fair = 1 / clamped;
  const withEdge = fair * (1 - HOUSE_EDGE);
  return Math.max(MIN_MULTIPLIER, Math.min(MAX_MULTIPLIER, withEdge));
}

/** Parse ESPN "50-32" record summaries into win/loss numbers. */
function parseRecord(summary: string | undefined | null): { w: number; l: number } | undefined {
  if (!summary) return undefined;
  const m = String(summary).match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return undefined;
  const w = Number(m[1]);
  const l = Number(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(l) || w + l <= 0) return undefined;
  return { w, l };
}

/** Log5 formula — given two teams' win pct, return prob A beats B. */
function log5(pa: number, pb: number) {
  const num = pa - pa * pb;
  const den = pa + pb - 2 * pa * pb;
  if (den <= 0) return 0.5;
  return num / den;
}

/** Pre-game probability based on season records. Falls back to 50/50. */
function getPreGameProbability(team: Team, opponent: Team): number {
  if (!team.record || !opponent.record) return 0.5;
  const pa = team.record.w / (team.record.w + team.record.l);
  const pb = opponent.record.w / (opponent.record.w + opponent.record.l);
  if (pa <= 0 && pb <= 0) return 0.5;
  // Slight regression toward the mean to avoid extremes off small samples.
  const regress = (p: number) => 0.85 * p + 0.15 * 0.5;
  return log5(regress(pa), regress(pb));
}

function formatYmd(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function safeNum(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function parseEspnGames(data: any): Matchup[] {
  return (data?.events ?? [])
    .map((event: any) => {
      const comp = event?.competitions?.[0];
      const competitors = comp?.competitors ?? [];
      if (competitors.length !== 2) return null;

      const statusType = comp?.status?.type;
      const teamA = competitors[0];
      const teamB = competitors[1];

      const teamAId = String(teamA?.team?.id ?? teamA?.id ?? "team-a");
      const teamBId = String(teamB?.team?.id ?? teamB?.id ?? "team-b");
      const teamAAbbr = String(teamA?.team?.abbreviation ?? "A");
      const teamBAbbr = String(teamB?.team?.abbreviation ?? "B");
      const teamALogo = String(teamA?.team?.logo ?? teamA?.team?.logos?.[0]?.href ?? "");
      const teamBLogo = String(teamB?.team?.logo ?? teamB?.team?.logos?.[0]?.href ?? "");
      const teamACandidates = [teamALogo, ...getNbaLogoCandidates(teamAId, teamAAbbr)].filter(Boolean);
      const teamBCandidates = [teamBLogo, ...getNbaLogoCandidates(teamBId, teamBAbbr)].filter(Boolean);
      const teamARecord =
        parseRecord(
          (teamA?.records ?? []).find((r: any) => r?.type === "total")?.summary ??
            teamA?.record,
        );
      const teamBRecord =
        parseRecord(
          (teamB?.records ?? []).find((r: any) => r?.type === "total")?.summary ??
            teamB?.record,
        );

      return {
        id: String(event.id ?? `${teamA?.id}-${teamB?.id}`),
        name: String(
          event.name ??
            `${teamA?.team?.displayName ?? "Team A"} vs ${teamB?.team?.displayName ?? "Team B"}`,
        ),
        startTime: String(event.date ?? new Date().toISOString()),
        completed: Boolean(statusType?.completed),
        isLive: Boolean(statusType?.state === "in"),
        status: String(statusType?.shortDetail ?? statusType?.description ?? "Scheduled"),
        source: "espn" as const,
        teams: [
          {
            id: teamAId,
            name: String(teamA?.team?.displayName ?? teamA?.team?.name ?? "Team A"),
            abbrev: teamAAbbr,
            score: safeNum(teamA?.score),
            logo: teamACandidates[0],
            logoCandidates: teamACandidates,
            record: teamARecord,
          },
          {
            id: teamBId,
            name: String(teamB?.team?.displayName ?? teamB?.team?.name ?? "Team B"),
            abbrev: teamBAbbr,
            score: safeNum(teamB?.score),
            logo: teamBCandidates[0],
            logoCandidates: teamBCandidates,
            record: teamBRecord,
          },
        ] as [Team, Team],
      };
    })
    .filter(Boolean);
}

function parseNbaGames(data: any): Matchup[] {
  return (data?.scoreboard?.games ?? [])
    .map((game: any) => {
      const away = game?.awayTeam;
      const home = game?.homeTeam;
      if (!away || !home) return null;

      const gameStatus = safeNum(game?.gameStatus);
      const awayLogoCandidates = getNbaLogoCandidates(
        String(away?.teamId ?? ""),
        String(away?.teamTricode ?? ""),
      );
      const homeLogoCandidates = getNbaLogoCandidates(
        String(home?.teamId ?? ""),
        String(home?.teamTricode ?? ""),
      );
      return {
        id: String(game?.gameId ?? `${away?.teamId}-${home?.teamId}`),
        name: `${away?.teamName ?? "Away"} vs ${home?.teamName ?? "Home"}`,
        startTime: String(game?.gameEt ?? new Date().toISOString()),
        completed: gameStatus === 3,
        isLive: gameStatus === 2,
        status: String(game?.gameStatusText ?? "Scheduled"),
        source: "nba" as const,
        teams: [
          {
            id: String(away?.teamId ?? "away"),
            name: String(away?.teamName ?? "Away"),
            abbrev: String(away?.teamTricode ?? "AWY"),
            score: safeNum(away?.score),
            logoCandidates: awayLogoCandidates,
            logo: awayLogoCandidates[0],
          },
          {
            id: String(home?.teamId ?? "home"),
            name: String(home?.teamName ?? "Home"),
            abbrev: String(home?.teamTricode ?? "HME"),
            score: safeNum(home?.score),
            logoCandidates: homeLogoCandidates,
            logo: homeLogoCandidates[0],
          },
        ] as [Team, Team],
      };
    })
    .filter(Boolean);
}

function isBettableGame(game: Matchup, now = Date.now()) {
  if (game.completed) return false;
  if (game.isLive) return true;

  const startAt = new Date(game.startTime).getTime();
  if (!Number.isFinite(startAt)) return false;

  const inFuture = startAt >= now;
  const withinWeek = startAt <= now + BETTING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return inFuture && withinWeek;
}

/**
 * Live games: blend pre-game prob with a score-differential signal.
 * Pre-game: pure log5 from records.
 * Returns probability in [0.02, 0.98].
 */
function getTeamWinProbability(team: Team, opponent: Team, isLive: boolean) {
  const pre = getPreGameProbability(team, opponent);
  if (!isLive) return Math.max(0.02, Math.min(0.98, pre));
  const diff = team.score - opponent.score;
  // Score differential adds ~6% per point, capped, then averaged with pre-game.
  const live = 0.5 + Math.max(-0.45, Math.min(0.45, diff * 0.06));
  const blended = 0.4 * pre + 0.6 * live;
  return Math.max(0.02, Math.min(0.98, blended));
}

/** Computes paired probabilities that sum to 1 for a matchup. */
function getMatchupOdds(a: Team, b: Team, isLive: boolean) {
  const pa = getTeamWinProbability(a, b, isLive);
  const pb = getTeamWinProbability(b, a, isLive);
  const total = pa + pb;
  const na = total > 0 ? pa / total : 0.5;
  const nb = 1 - na;
  return {
    a: { prob: na, multiplier: probabilityToMultiplier(na) },
    b: { prob: nb, multiplier: probabilityToMultiplier(nb) },
  };
}

export default function Prediction() {
  useTrackGame("prediction");
  const { profile, setLocalCoins } = useUserProfile();

  const [games, setGames] = useState<Matchup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feed, setFeed] = useState<"espn" | "nba" | null>(null);
  const [bet, setBet] = useState(25);
  const [selectedTeam, setSelectedTeam] = useState<Record<string, string>>({});
  const [lockedBets, setLockedBets] = useState<Record<string, LockedBet>>({});
  const [settledOpenBetIds, setSettledOpenBetIds] = useState<Set<string>>(new Set());
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [logoIndexByKey, setLogoIndexByKey] = useState<Record<string, number>>({});

  async function loadGames(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      let parsed: Matchup[] = [];

      try {
        // Fetch ESPN scoreboard for recent + upcoming dates. The default
        // endpoint only returns today's slate, so to surface upcoming
        // games we query each date explicitly.
        const today = new Date();
        const dates: string[] = [];
        for (let i = -SETTLEMENT_LOOKBACK_DAYS; i < BETTING_WINDOW_DAYS; i++) {
          const d = new Date(today);
          d.setUTCDate(today.getUTCDate() + i);
          dates.push(formatYmd(d));
        }
        const responses = await Promise.all(
          dates.map((d) =>
            fetch(`${ESPN_SCOREBOARD_URL}?dates=${d}`)
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
          ),
        );
        const all: Matchup[] = [];
        const seen = new Set<string>();
        for (const data of responses) {
          if (!data) continue;
          for (const g of parseEspnGames(data)) {
            if (seen.has(g.id)) continue;
            seen.add(g.id);
            all.push(g);
          }
        }
        parsed = all;
        if (parsed.length > 0) setFeed("espn");
        else throw new Error("ESPN returned no games");
      } catch {
        parsed = [];
      }

      if (parsed.length === 0) {
        const nbaRes = await fetch(NBA_SCOREBOARD_URL);
        if (!nbaRes.ok) throw new Error("Could not load NBA games right now");
        parsed = parseNbaGames(await nbaRes.json());
        setFeed("nba");
      }

      setGames(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load games";
      toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadLockedBets() {
    if (!profile) return;
    const { data, error } = await supabase
      .from("bets")
      .select("id,bet_amount,details")
      .eq("game", "prediction")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false });

    if (error || !data) return;

    const settled = new Set<string>();
    for (const row of data) {
      const details = (row.details ?? {}) as Record<string, any>;
      if (details.entry_type === "prediction-settlement" && details.settlement_for) {
        settled.add(String(details.settlement_for));
      }
    }

    const locked: Record<string, LockedBet> = {};
    for (const row of data) {
      const details = (row.details ?? {}) as Record<string, any>;
      if (details.entry_type !== "prediction-open") continue;
      const eventId = String(details.event_id ?? "");
      if (!eventId || settled.has(row.id)) continue;
      if (locked[eventId]) continue;
      locked[eventId] = {
        betId: row.id,
        eventId,
        eventName: String(details.event_name ?? "NBA Game"),
        pickedTeamId: String(details.picked_team_id ?? ""),
        pickedTeamName: String(details.picked_team_name ?? "Team"),
        amount: Number(row.bet_amount ?? 0),
        multiplier: Number(details.expected_payout_multiplier ?? 2),
      };
    }

    setSettledOpenBetIds(settled);
    setLockedBets(locked);
  }

  useEffect(() => {
    loadGames();
    loadLockedBets();
    const interval = window.setInterval(() => {
      loadGames(true);
      loadLockedBets();
    }, 30000);
    return () => window.clearInterval(interval);
  }, [profile?.id]);

  const settleWinners = useCallback(async () => {
    if (!profile) return;
    let paidAny = false;
    for (const game of games) {
      if (!game.completed) continue;

      const openBet = lockedBets[game.id];
      if (!openBet || settledOpenBetIds.has(openBet.betId)) continue;

      const [a, b] = game.teams;
      if (a.score === b.score) continue;
      const winner = a.score > b.score ? a : b;
      if (winner.id !== openBet.pickedTeamId) continue;

      const payoutMultiplier = Math.max(MIN_MULTIPLIER, Number(openBet.multiplier) || 2);
      // The opening ticket already deducted the original stake.
      // During settlement we must credit "stake * multiplier" in full,
      // so we pass multiplier + 1 to place_bet where net delta is:
      //   -stake + (stake * (multiplier + 1)) = stake * multiplier
      const { data, error } = await supabase.rpc("place_bet", {
        _game: "prediction",
        _bet_amount: openBet.amount,
        _won: true,
        _multiplier: payoutMultiplier + 1,
        _details: {
          entry_type: "prediction-settlement",
          settlement_for: openBet.betId,
          event_id: game.id,
          event_name: game.name,
          winner_team_id: winner.id,
          winner_team_name: winner.name,
          payout_multiplier: payoutMultiplier,
          settled_at: new Date().toISOString(),
        },
      });

      if (!error) {
        paidAny = true;
        if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
        toast.success(
          `✅ ${openBet.eventName} — ${openBet.pickedTeamName} won! Paid ${payoutMultiplier.toFixed(2)}×`,
        );
      } else if ((error as { code?: string }).code === "23505") {
        // Settlement already exists (idempotency guard at DB level).
        paidAny = true;
      }
    }

    if (paidAny) await loadLockedBets();
  }, [games, lockedBets, profile, setLocalCoins, settledOpenBetIds]);

  useEffect(() => {
    void settleWinners();
  }, [settleWinners]);

  const availableGames = useMemo(
    () => games.filter((g) => isBettableGame(g)).sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime)),
    [games],
  );

  const gamesByDay = useMemo(() => {
    const groups: { key: string; games: Matchup[] }[] = [];
    const map = new Map<string, Matchup[]>();
    for (const g of availableGames) {
      const k = dayKey(g.startTime);
      if (!map.has(k)) {
        map.set(k, []);
        groups.push({ key: k, games: map.get(k)! });
      }
      map.get(k)!.push(g);
    }
    return groups;
  }, [availableGames]);

  async function placePrediction(game: Matchup) {
    if (!profile) return;
    const pickedTeamId = selectedTeam[game.id];
    const locked = lockedBets[game.id];

    if (locked) {
      toast.error("You already placed your pick for this game. Decision is locked.");
      return;
    }

    if (!pickedTeamId) {
      toast.error("Pick a team first");
      return;
    }
    if (!isBettableGame(game)) {
      toast.error("Betting is open only for live games or games starting within 7 days");
      return;
    }
    if (bet < 1) {
      toast.error("Bet at least 1 coin");
      return;
    }
    if (bet > profile.coins) {
      toast.error("Not enough coins");
      return;
    }

    const picked = game.teams.find((t) => t.id === pickedTeamId);
    if (!picked) {
      toast.error("Invalid team pick");
      return;
    }

    const opponent = game.teams.find((t) => t.id !== picked.id)!;
    const odds = getMatchupOdds(game.teams[0], game.teams[1], game.isLive);
    const pickedOdds = picked.id === game.teams[0].id ? odds.a : odds.b;
    const pickedMultiplier = pickedOdds.multiplier;

    if (
      !window.confirm(
        `Bet ${formatCoins(bet)} on ${picked.name} @ ${pickedMultiplier.toFixed(2)}× (win pays ${formatCoins(Math.floor(bet * pickedMultiplier))}). This cannot be changed.`,
      )
    ) {
      return;
    }

    setPlacingId(game.id);
    const { data, error } = await supabase.rpc("place_bet", {
      _game: "prediction",
      _bet_amount: bet,
      _won: false,
      _multiplier: 0,
      _details: {
        entry_type: "prediction-open",
        event_id: game.id,
        event_name: game.name,
        source: game.source,
        picked_team_id: picked.id,
        picked_team_name: picked.name,
        expected_payout_multiplier: pickedMultiplier,
        picked_team_probability: pickedOdds.prob,
        opponent_team_id: opponent.id,
        opponent_team_name: opponent.name,
        status: "pending",
        opened_at: new Date().toISOString(),
      },
    });
    setPlacingId(null);
    setConfirmingId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    toast.success(
      `🔒 Locked ${picked.name} @ ${pickedMultiplier.toFixed(2)}× — auto-settles when game ends.`,
    );
    await loadLockedBets();
  }

  const totalGames = availableGames.length;

  return (
    <div className="space-y-4 pb-24">
      {/* ===== Compact header ===== */}
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">NBA Markets</h1>
          <p className="text-[11px] text-muted-foreground/80">
            {totalGames} game{totalGames === 1 ? "" : "s"} · live odds · auto-settles
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadGames(true)}
          disabled={refreshing || loading}
          className="gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "..." : "Refresh"}
        </Button>
      </header>

      {/* ===== Sticky stake + day-jump bar ===== */}
      <div className="sticky top-0 z-30 -mx-4 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur-xl">
        <div className="space-y-2">
          {/* Stake row */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Stake
            </span>
            {[10, 25, 50, 100, 250, 500].map((n) => (
              <button
                key={n}
                onClick={() => setBet(n)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold transition ${
                  bet === n
                    ? "border-primary bg-primary text-primary-foreground shadow-[0_0_14px_hsl(var(--primary)/0.45)]"
                    : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {formatCoins(n)}
              </button>
            ))}
            <input
              type="number"
              min={1}
              value={bet}
              onChange={(e) => setBet(Math.max(1, Number(e.target.value) || 1))}
              className="w-20 shrink-0 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-bold tabular-nums"
              aria-label="Custom stake"
            />
          </div>

          {/* Day-jump pills */}
          {gamesByDay.length > 1 ? (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {gamesByDay.map((group, i) => (
                <a
                  key={group.key}
                  href={`#day-${i}`}
                  className="shrink-0 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
                >
                  {group.key} <span className="text-muted-foreground/60">· {group.games.length}</span>
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* ===== Markets list ===== */}
      {loading ? (
        <div className="rounded-2xl border border-border bg-card/70 p-8 text-center text-sm text-muted-foreground">
          Loading games...
        </div>
      ) : availableGames.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/70 p-8 text-center text-sm text-muted-foreground">
          No live or upcoming NBA games in the next 7 days.
        </div>
      ) : (
        <div className="space-y-5">
          {gamesByDay.map((group, i) => (
            <section key={group.key} id={`day-${i}`} className="space-y-2 scroll-mt-32">
              <div className="flex items-center gap-2 px-1">
                <CalendarDays className="h-3.5 w-3.5 text-primary" />
                <h2 className="text-xs font-black uppercase tracking-widest text-foreground">
                  {group.key}
                </h2>
                <span className="text-[10px] text-muted-foreground/70">
                  · {group.games.length} game{group.games.length === 1 ? "" : "s"}
                </span>
              </div>

              {group.games.map((game) => {
                const pickedId = selectedTeam[game.id];
                const [a, b] = game.teams;
                const locked = lockedBets[game.id];
                const odds = getMatchupOdds(a, b, game.isLive);
                const aPct = Math.round(odds.a.prob * 100);
                const bPct = 100 - aPct;
                const pickedOdds = pickedId === a.id ? odds.a : pickedId === b.id ? odds.b : null;
                const potentialReturn = pickedOdds
                  ? Math.floor(bet * pickedOdds.multiplier)
                  : 0;

                return (
                  <article
                    key={game.id}
                    className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:border-primary/40"
                  >
                    {/* Card head */}
                    <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {game.isLive ? (
                          <span className="flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-destructive">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
                            Live
                          </span>
                        ) : (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                            {new Date(game.startTime).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                        <p className="truncate text-[11px] text-muted-foreground">{game.status}</p>
                      </div>
                      {locked ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-500">
                          <Lock className="h-3 w-3" /> Locked
                        </span>
                      ) : null}
                    </div>

                    {/* Probability bar (Polymarket-style) */}
                    <div className="px-3 pt-3">
                      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="bg-emerald-500 transition-all"
                          style={{ width: `${aPct}%` }}
                        />
                        <div
                          className="bg-sky-500 transition-all"
                          style={{ width: `${bPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Two team rows */}
                    <div className="space-y-1.5 p-3">
                      {[
                        { team: a, side: odds.a, accent: "emerald" as const },
                        { team: b, side: odds.b, accent: "sky" as const },
                      ].map(({ team: t, side, accent }) => {
                        const logoKey = `${game.id}:${t.id}`;
                        const logoIndex = logoIndexByKey[logoKey] ?? 0;
                        const selectedLogo = t.logoCandidates?.[logoIndex] ?? t.logo;
                        const isPicked = pickedId === t.id;
                        const isLockedPick = locked?.pickedTeamId === t.id;
                        const pct = Math.round(side.prob * 100);

                        return (
                          <button
                            key={t.id}
                            onClick={() =>
                              !locked &&
                              setSelectedTeam((prev) => ({ ...prev, [game.id]: t.id }))
                            }
                            disabled={!!locked}
                            className={`group flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                              isLockedPick
                                ? "border-amber-500/60 bg-amber-500/10"
                                : isPicked
                                  ? "border-primary bg-primary/10 shadow-[0_0_12px_hsl(var(--primary)/0.25)]"
                                  : "border-border bg-background/40 hover:border-primary/40 hover:bg-background/70"
                            } ${locked && !isLockedPick ? "opacity-50" : ""} ${locked ? "cursor-default" : "cursor-pointer"}`}
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              {selectedLogo && logoIndex !== Number.MAX_SAFE_INTEGER ? (
                                <img
                                  src={selectedLogo}
                                  alt={`${t.name} logo`}
                                  className="h-9 w-9 shrink-0 rounded-full border border-border bg-white object-contain p-0.5"
                                  loading="lazy"
                                  onError={() => {
                                    if ((t.logoCandidates?.length ?? 0) > logoIndex + 1) {
                                      setLogoIndexByKey((prev) => ({
                                        ...prev,
                                        [logoKey]: logoIndex + 1,
                                      }));
                                      return;
                                    }
                                    setLogoIndexByKey((prev) => ({
                                      ...prev,
                                      [logoKey]: Number.MAX_SAFE_INTEGER,
                                    }));
                                  }}
                                />
                              ) : (
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[10px] font-black">
                                  {t.abbrev}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black leading-tight">
                                  {t.name}
                                </p>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                  {t.abbrev}
                                  {t.record ? ` · ${t.record.w}-${t.record.l}` : ""}
                                  {game.isLive ? ` · ${t.score} pts` : ""}
                                </p>
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              <div className="text-right">
                                <p
                                  className={`text-lg font-black leading-none tabular-nums ${
                                    accent === "emerald" ? "text-emerald-500" : "text-sky-500"
                                  }`}
                                >
                                  {pct}%
                                </p>
                                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                  {side.multiplier.toFixed(2)}×
                                </p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Bet button row */}
                    <div className="border-t border-border/60 bg-background/30 px-3 py-2.5">
                      {locked ? (
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-amber-500">
                            🔒 {locked.pickedTeamName}
                          </span>
                          <span className="text-muted-foreground">
                            {formatCoins(locked.amount)} @{" "}
                            <span className="font-black text-foreground">
                              {locked.multiplier.toFixed(2)}×
                            </span>{" "}
                            → win{" "}
                            <span className="font-black text-emerald-500">
                              {formatCoins(Math.floor(locked.amount * locked.multiplier))}
                            </span>
                          </span>
                        </div>
                      ) : confirmingId === game.id ? (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => setConfirmingId(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 bg-gradient-to-r from-primary to-primary/80 font-black"
                            onClick={() => placePrediction(game)}
                            disabled={placingId === game.id || !pickedId}
                          >
                            {placingId === game.id ? "Placing..." : "Confirm Bet"}
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => pickedId && setConfirmingId(game.id)}
                          disabled={!pickedId || placingId === game.id}
                          className={`relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl px-4 py-3 text-sm font-black uppercase tracking-wider transition active:scale-[0.98] ${
                            pickedId
                              ? "bg-gradient-to-r from-primary via-primary to-primary/80 text-primary-foreground shadow-[0_4px_20px_-4px_hsl(var(--primary)/0.6)] hover:shadow-[0_6px_24px_-2px_hsl(var(--primary)/0.8)]"
                              : "cursor-not-allowed bg-muted text-muted-foreground"
                          }`}
                        >
                          {pickedId ? (
                            <>
                              <Zap className="h-4 w-4" />
                              Bet {formatCoins(bet)} → win{" "}
                              <span className="tabular-nums">
                                {formatCoins(potentialReturn)}
                              </span>
                              <span className="rounded-md bg-background/20 px-1.5 py-0.5 text-[10px]">
                                {pickedOdds?.multiplier.toFixed(2)}×
                              </span>
                            </>
                          ) : (
                            <>
                              <TrendingUp className="h-4 w-4" />
                              Pick a team to bet
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          ))}

          <div className="flex items-center justify-center gap-2 pt-2 text-[10px] text-muted-foreground/70">
            <ShieldCheck className="h-3 w-3 text-emerald-500" />
            One pick per matchup · Auto-settles at final score · Feed: {feed?.toUpperCase() ?? "..."}
          </div>
        </div>
      )}
    </div>
  );
}
