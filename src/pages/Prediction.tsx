import { useEffect, useMemo, useState } from "react";
import { useTrackGame } from "@/hooks/usePresence";
import { useUserProfile } from "@/hooks/useUserProfile";
import { supabase } from "@/integrations/supabase/client";
import { formatCoins } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Team = {
  id: string;
  name: string;
  abbrev: string;
  score: number;
};

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

const PAYOUT_MULTIPLIER_LIVE = 1.5;
const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const NBA_SCOREBOARD_URL =
  "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json";

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
          },
          {
            id: String(teamB?.team?.id ?? teamB?.id ?? "team-b"),
            name: String(teamB?.team?.displayName ?? teamB?.team?.name ?? "Team B"),
            abbrev: String(teamB?.team?.abbreviation ?? "B"),
            score: safeNum(teamB?.score),
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
          },
          {
            id: String(home?.teamId ?? "home"),
            name: String(home?.teamName ?? "Home"),
            abbrev: String(home?.teamTricode ?? "HME"),
            score: safeNum(home?.score),
          },
        ] as [Team, Team],
      };
    })
    .filter(Boolean);
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
  const [placingId, setPlacingId] = useState<string | null>(null);

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

  useEffect(() => {
    loadGames();
    const interval = window.setInterval(() => loadGames(true), 30000);
    return () => window.clearInterval(interval);
  }, []);

  const availableGames = useMemo(() => games.filter((g) => g.isLive && !g.completed), [games]);

  async function placePrediction(game: Matchup) {
    if (!profile) return;
    const pickedTeamId = selectedTeam[game.id];
    if (!pickedTeamId) {
      toast.error("Pick a team first");
      return;
    }
    if (game.completed || !game.isLive) {
      toast.error("Only live markets are open for betting");
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

    const [teamA, teamB] = game.teams;
    if (teamA.score === teamB.score) {
      toast.error("Game score is tied right now, wait for a lead or final");
      return;
    }

    const winner = teamA.score > teamB.score ? teamA : teamB;
    const won = winner.id === pickedTeamId;
    const multiplier = PAYOUT_MULTIPLIER_LIVE;

    setPlacingId(game.id);
    const { data, error } = await supabase.rpc("place_bet", {
      _game: "prediction",
      _bet_amount: bet,
      _won: won,
      _multiplier: multiplier,
      _details: {
        market: "nba-live-leader",
        source: game.source,
        event_id: game.id,
        event_name: game.name,
        status: game.status,
        picked_team_id: pickedTeamId,
        settled_team_id: winner.id,
        settled_on: "live",
        scores: {
          [teamA.id]: teamA.score,
          [teamB.id]: teamB.score,
        },
      },
    });
    setPlacingId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));

    if (won) {
      toast.success(`Winner! +${formatCoins(Math.round(bet * (multiplier - 1)))} profit (${multiplier}x)`);
    } else {
      toast.error(`Lost ${formatCoins(bet)} coins`);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">NBA PREDICTION</h1>
          <p className="text-sm text-muted-foreground">Bet only on live leaders. Live settles instantly at 1.5x.</p>
          <p className="text-xs text-muted-foreground/80">
            Feed: {feed === null ? "loading..." : feed.toUpperCase()} (auto-refresh every 30s)
          </p>
        </div>
        <Button variant="outline" onClick={() => loadGames(true)} disabled={refreshing || loading}>
          {refreshing ? "Refreshing..." : "Refresh Games"}
        </Button>
      </header>

      <section className="rounded-3xl border border-border bg-card/70 p-4 backdrop-blur-xl">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Stake</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[10, 25, 50, 100, 250].map((n) => (
            <button
              key={n}
              onClick={() => setBet(n)}
              className={`rounded-full px-4 py-1.5 text-sm font-bold ${
                bet === n
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground"
              }`}
            >
              {n}
            </button>
          ))}
          <input
            type="number"
            min={1}
            value={bet}
            onChange={(e) => setBet(Math.max(1, Number(e.target.value) || 1))}
            className="w-28 rounded-full border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>
      </section>

      {loading ? (
        <div className="rounded-3xl border border-border bg-card/70 p-8 text-center text-muted-foreground">
          Loading games...
        </div>
      ) : availableGames.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card/70 p-8 text-center text-muted-foreground">
          No live NBA games available right now. Press refresh later.
        </div>
      ) : (
        <div className="space-y-3">
          {availableGames.map((game) => {
            const pickedId = selectedTeam[game.id];
            const [a, b] = game.teams;
            const multiplier = PAYOUT_MULTIPLIER_LIVE;
            return (
              <article key={game.id} className="rounded-3xl border border-border bg-card/70 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold">{game.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {new Date(game.startTime).toLocaleString()} · {game.status}
                    </p>
                  </div>
                  <Button
                    onClick={() => placePrediction(game)}
                    disabled={placingId === game.id || !pickedId}
                  >
                    {placingId === game.id ? "Placing..." : `Bet ${formatCoins(bet)} for ${multiplier}x`}
                  </Button>
                </div>

                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden />
                    LIVE market (bettable)
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[a, b].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTeam((prev) => ({ ...prev, [game.id]: t.id }))}
                      className={`rounded-2xl border p-3 text-left transition ${
                        pickedId === t.id
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background/60"
                      }`}
                    >
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        {t.abbrev}
                      </p>
                      <p className="text-base font-black">{t.name}</p>
                      <p className="text-sm text-muted-foreground">Score: {t.score}</p>
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
