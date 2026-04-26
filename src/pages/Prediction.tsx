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
  status: string;
  teams: [Team, Team];
};

const PAYOUT_MULTIPLIER = 2;
const SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";

export default function Prediction() {
  useTrackGame("prediction");
  const { profile, setLocalCoins } = useUserProfile();

  const [games, setGames] = useState<Matchup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bet, setBet] = useState(25);
  const [selectedTeam, setSelectedTeam] = useState<Record<string, string>>({});
  const [placingId, setPlacingId] = useState<string | null>(null);

  async function loadGames(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch(SCOREBOARD_URL);
      if (!res.ok) throw new Error("Could not load ESPN games");
      const data = await res.json();

      const parsed: Matchup[] = (data.events ?? [])
        .map((event: any) => {
          const comp = event.competitions?.[0];
          const competitors = comp?.competitors ?? [];
          if (competitors.length !== 2) return null;

          const teamA = competitors[0];
          const teamB = competitors[1];

          return {
            id: String(event.id),
            name: String(event.name ?? "NBA Game"),
            startTime: String(event.date),
            completed: Boolean(comp?.status?.type?.completed),
            status: String(comp?.status?.type?.description ?? "Scheduled"),
            teams: [
              {
                id: String(teamA.team?.id ?? teamA.id),
                name: String(teamA.team?.displayName ?? teamA.team?.name ?? "Team A"),
                abbrev: String(teamA.team?.abbreviation ?? "A"),
                score: Number(teamA.score ?? 0),
              },
              {
                id: String(teamB.team?.id ?? teamB.id),
                name: String(teamB.team?.displayName ?? teamB.team?.name ?? "Team B"),
                abbrev: String(teamB.team?.abbreviation ?? "B"),
                score: Number(teamB.score ?? 0),
              },
            ] as [Team, Team],
          };
        })
        .filter(Boolean);

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
  }, []);

  const completedGames = useMemo(() => games.filter((g) => g.completed), [games]);

  async function placePrediction(game: Matchup) {
    if (!profile) return;
    const pickedTeamId = selectedTeam[game.id];
    if (!pickedTeamId) {
      toast.error("Pick a team first");
      return;
    }
    if (!game.completed) {
      toast.error("Game must be final to settle this bet");
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
      toast.error("This game is tied / unresolved, try another one");
      return;
    }

    const winner = teamA.score > teamB.score ? teamA : teamB;
    const won = winner.id === pickedTeamId;

    setPlacingId(game.id);
    const { data, error } = await supabase.rpc("place_bet", {
      _game: "prediction",
      _bet_amount: bet,
      _won: won,
      _multiplier: PAYOUT_MULTIPLIER,
      _details: {
        market: "nba-moneyline",
        event_id: game.id,
        event_name: game.name,
        status: game.status,
        picked_team_id: pickedTeamId,
        winning_team_id: winner.id,
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
      toast.success(`Winner! +${formatCoins(bet)} profit (${PAYOUT_MULTIPLIER}x payout)`);
    } else {
      toast.error(`Lost ${formatCoins(bet)} coins`);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">NBA PREDICTION</h1>
          <p className="text-sm text-muted-foreground">
            Polymarket style: pick a winner on final NBA games. Win pays {PAYOUT_MULTIPLIER}x,
            loss pays 0x.
          </p>
        </div>
        <Button variant="outline" onClick={() => loadGames(true)} disabled={refreshing || loading}>
          {refreshing ? "Refreshing..." : "Refresh ESPN"}
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
      ) : completedGames.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card/70 p-8 text-center text-muted-foreground">
          No final NBA games in ESPN feed right now. Press refresh later.
        </div>
      ) : (
        <div className="space-y-3">
          {completedGames.map((game) => {
            const pickedId = selectedTeam[game.id];
            const [a, b] = game.teams;
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
                    {placingId === game.id ? "Placing..." : `Bet ${formatCoins(bet)} for ${PAYOUT_MULTIPLIER}x`}
                  </Button>
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
                      <p className="text-sm text-muted-foreground">Final score: {t.score}</p>
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
