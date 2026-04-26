import { useEffect, useMemo, useState } from "react";
import { useTrackGame } from "@/hooks/usePresence";
import { useUserProfile } from "@/hooks/useUserProfile";
import { supabase } from "@/integrations/supabase/client";
import { formatCoins } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RefreshCw, ShieldCheck, Timer } from "lucide-react";

type Team = {
  id: string;
  name: string;
  abbrev: string;
  score: number;
  logo?: string;
  logoCandidates?: string[];
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
};

const WIN_MULTIPLIER = 2;
const WIN_SETTLEMENT_MULTIPLIER = 3;
const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const NBA_SCOREBOARD_URL =
  "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json";
const BETTING_WINDOW_DAYS = 7;

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
            id: String(teamA?.team?.id ?? teamA?.id ?? "team-a"),
            name: String(teamA?.team?.displayName ?? teamA?.team?.name ?? "Team A"),
            abbrev: String(teamA?.team?.abbreviation ?? "A"),
            score: safeNum(teamA?.score),
            logo: String(teamA?.team?.logos?.[0]?.href ?? ""),
          },
          {
            id: String(teamB?.team?.id ?? teamB?.id ?? "team-b"),
            name: String(teamB?.team?.displayName ?? teamB?.team?.name ?? "Team B"),
            abbrev: String(teamB?.team?.abbreviation ?? "B"),
            score: safeNum(teamB?.score),
            logo: String(teamB?.team?.logos?.[0]?.href ?? ""),
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
        const res = await fetch(ESPN_SCOREBOARD_URL);
        if (!res.ok) throw new Error("ESPN unavailable");
        parsed = parseEspnGames(await res.json());
        if (parsed.length > 0) setFeed("espn");
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

  useEffect(() => {
    if (!profile) return;

    const settleWinners = async () => {
      for (const game of games) {
        if (!game.completed) continue;

        const openBet = lockedBets[game.id];
        if (!openBet || settledOpenBetIds.has(openBet.betId)) continue;

        const [a, b] = game.teams;
        if (a.score === b.score) continue;
        const winner = a.score > b.score ? a : b;
        if (winner.id !== openBet.pickedTeamId) continue;

        const { error } = await supabase.rpc("place_bet", {
          _game: "prediction",
          _bet_amount: openBet.amount,
          _won: true,
          _multiplier: WIN_SETTLEMENT_MULTIPLIER,
          _details: {
            entry_type: "prediction-settlement",
            settlement_for: openBet.betId,
            event_id: game.id,
            event_name: game.name,
            winner_team_id: winner.id,
            winner_team_name: winner.name,
            settled_at: new Date().toISOString(),
          },
        });

        if (!error) {
          toast.success(`✅ ${openBet.eventName} settled: ${openBet.pickedTeamName} won, paid ${WIN_MULTIPLIER}x`);
          await loadLockedBets();
        }
      }
    };

    void settleWinners();
  }, [games, lockedBets, profile, settledOpenBetIds]);

  const availableGames = useMemo(
    () => games.filter((g) => isBettableGame(g)).sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime)),
    [games],
  );

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

    if (
      !window.confirm(
        `Are you sure? Bet ${formatCoins(bet)} on ${picked.name}. This cannot be changed after placing.`,
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
        expected_payout_multiplier: WIN_MULTIPLIER,
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
    toast.success(`Bet locked: ${picked.name}. You will auto-settle at ${WIN_MULTIPLIER}x if this team wins.`);
    await loadLockedBets();
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">NBA PREDICTION</h1>
          <p className="text-sm text-muted-foreground">Lock one pick per game. Bet live games or upcoming games within the next 7 days. Stake is deducted now. Winners settle at 2x when game is final.</p>
          <p className="text-xs text-muted-foreground/80">
            Feed: {feed === null ? "loading..." : feed.toUpperCase()} (auto-refresh every 30s)
          </p>
        </div>
        <Button variant="outline" onClick={() => loadGames(true)} disabled={refreshing || loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing..." : "Refresh Games"}
        </Button>
      </header>

      <section className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card/80 to-card/50 p-4 backdrop-blur-xl">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Stake</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[10, 25, 50, 100, 250].map((n) => (
                <button
                  key={n}
                  onClick={() => setBet(n)}
                  className={`rounded-full border px-4 py-1.5 text-sm font-bold transition ${
                    bet === n
                      ? "border-primary bg-primary text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.4)]"
                      : "border-border bg-background/70 text-muted-foreground hover:text-foreground"
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
                className="w-28 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-semibold"
              />
            </div>
          </div>
          <div className="rounded-2xl border border-border/80 bg-background/60 px-4 py-3 text-sm">
            <p className="flex items-center gap-2 font-semibold text-foreground"><ShieldCheck className="h-4 w-4 text-emerald-500" /> 1 pick per matchup</p>
            <p className="mt-1 flex items-center gap-2 text-muted-foreground"><Timer className="h-4 w-4" /> Auto-settles at final score</p>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="rounded-3xl border border-border bg-card/70 p-8 text-center text-muted-foreground">
          Loading games...
        </div>
      ) : availableGames.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card/70 p-8 text-center text-muted-foreground">
          No live or upcoming NBA games (next 7 days) available right now. Press refresh later.
        </div>
      ) : (
        <div className="space-y-3">
          {availableGames.map((game) => {
            const pickedId = selectedTeam[game.id];
            const [a, b] = game.teams;
            const locked = lockedBets[game.id];
            return (
              <article key={game.id} className="rounded-3xl border border-border bg-card/70 p-4 shadow-[0_8px_24px_-12px_hsl(var(--background))]">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold">{game.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {new Date(game.startTime).toLocaleString()} · {game.status}
                    </p>
                    {locked ? (
                      <p className="text-xs font-semibold text-amber-500">
                        Locked on {locked.pickedTeamName} ({formatCoins(locked.amount)})
                      </p>
                    ) : null}
                  </div>
                  {confirmingId === game.id && !locked ? (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => setConfirmingId(null)}>Cancel</Button>
                      <Button onClick={() => placePrediction(game)} disabled={placingId === game.id || !pickedId}>
                        {placingId === game.id ? "Placing..." : "Are you sure? Place"}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={() => setConfirmingId(game.id)}
                      disabled={placingId === game.id || !pickedId || !!locked}
                    >
                      {locked ? "Locked" : `Bet ${formatCoins(bet)} for ${WIN_MULTIPLIER}x`}
                    </Button>
                  )}
                </div>

                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full ${game.isLive ? "bg-red-500" : "bg-emerald-500"}`}
                      aria-hidden
                    />
                    {game.isLive ? "LIVE market" : "UPCOMING market"} (one pick only)
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[a, b].map((t) => {
                    const logoKey = `${game.id}:${t.id}`;
                    const logoIndex = logoIndexByKey[logoKey] ?? 0;
                    const selectedLogo = t.logoCandidates?.[logoIndex] ?? t.logo;

                    return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTeam((prev) => ({ ...prev, [game.id]: t.id }))}
                      disabled={!!locked}
                      className={`rounded-2xl border p-3 text-left transition ${
                        pickedId === t.id
                          ? "border-primary bg-gradient-to-br from-primary/20 to-primary/5 shadow-[0_0_18px_hsl(var(--primary)/0.25)]"
                          : "border-border bg-background/60 hover:border-primary/40"
                      } ${locked ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      <div className="flex items-center gap-3">
                        {selectedLogo ? (
                          <img
                            src={selectedLogo}
                            alt={`${t.name} logo`}
                            className="h-10 w-10 rounded-full border border-border bg-white p-1 object-contain"
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
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-xs font-black">
                            {t.abbrev}
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                            {t.abbrev}
                          </p>
                          <p className="text-base font-black">{t.name}</p>
                          <p className="text-sm text-muted-foreground">Score: {t.score}</p>
                        </div>
                      </div>
                    </button>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
