import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { formatCoins } from "@/lib/format";
import { Flame, Egg, Footprints } from "lucide-react";
import { playGem, playBomb, playTileClick, playCashout } from "@/lib/sfx";

type Difficulty = "easy" | "medium" | "hard" | "expert" | "master";

const CONFIG: Record<Difficulty, { tiles: number; eggs: number; step: number; tone: string }> = {
  easy:   { tiles: 4, eggs: 1, step: 1.18, tone: "border-emerald-400 bg-emerald-500/15 text-emerald-300" },
  medium: { tiles: 3, eggs: 1, step: 1.32, tone: "border-sky-400 bg-sky-500/15 text-sky-300" },
  hard:   { tiles: 2, eggs: 1, step: 1.65, tone: "border-amber-400 bg-amber-500/15 text-amber-300" },
  expert: { tiles: 3, eggs: 2, step: 2.20, tone: "border-orange-400 bg-orange-500/15 text-orange-300" },
  master: { tiles: 4, eggs: 3, step: 2.90, tone: "border-rose-400 bg-rose-500/15 text-rose-300" },
};

const FLOORS = 9;

type FloorState = {
  // For active rounds we don't know the eggs, only the chosen tile.
  pick?: number;        // tile index chosen on this floor (if any)
  revealedEggs?: number[]; // populated when floor settled / game over
  cleared: boolean;
};

function multAtFloor(step: number, floor: number) {
  if (floor <= 0) return 0;
  return +Math.pow(step, floor).toFixed(4);
}

export default function DragonTower() {
  useTrackGame("dragontower");
  const { profile, setLocalCoins } = useUserProfile();
  const [bet, setBet] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0); // floors cleared (0..9)
  const [busy, setBusy] = useState(false);
  const [floors, setFloors] = useState<FloorState[]>(
    Array.from({ length: FLOORS }, () => ({ cleared: false })),
  );
  const [exploded, setExploded] = useState<{ floor: number; tile: number } | null>(null);

  const cfg = CONFIG[difficulty];
  const currentMult = multAtFloor(cfg.step, progress);
  const nextMult = multAtFloor(cfg.step, progress + 1);
  const profit = Math.floor(bet * currentMult) - bet;

  // Resume any active round
  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("dragontower_round")
        .eq("id", profile.id)
        .maybeSingle();
      const round = data?.dragontower_round as
        | {
            active?: boolean;
            bet?: number;
            difficulty?: Difficulty;
            progress?: number;
            picks?: number[];
          }
        | null;
      if (round?.active) {
        setActive(true);
        setBet(Number(round.bet ?? bet));
        setDifficulty((round.difficulty as Difficulty) ?? "medium");
        setProgress(Number(round.progress ?? 0));
        const picks = round.picks ?? [];
        setFloors(
          Array.from({ length: FLOORS }, (_, i) => ({
            pick: picks[i],
            cleared: i < (round.progress ?? 0),
          })),
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  function resetBoard() {
    setFloors(Array.from({ length: FLOORS }, () => ({ cleared: false })));
    setProgress(0);
    setExploded(null);
  }

  async function start() {
    if (!profile) return;
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");
    setBusy(true);
    const { data, error } = await supabase.rpc("dragontower_start", {
      _bet_amount: bet,
      _difficulty: difficulty,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    resetBoard();
    setActive(true);
    playTileClick();
  }

  async function pick(floor: number, tile: number) {
    if (!active || busy) return;
    if (floor !== progress) return; // can only act on current floor
    setBusy(true);
    playTileClick();
    const { data, error } = await supabase.rpc("dragontower_pick", { _tile: tile });
    setBusy(false);
    if (error) return toast.error(error.message);
    const r = data?.[0];
    if (!r) return;

    const eggs = (r.eggs as number[]) ?? [];
    if (r.hit_egg) {
      playBomb();
      setExploded({ floor, tile });
      setFloors((prev) => {
        const next = [...prev];
        next[floor] = { pick: tile, revealedEggs: eggs, cleared: false };
        return next;
      });
      setActive(false);
      toast.error(`Burned! -${formatCoins(bet)}`);
      if (typeof r.new_balance === "number") setLocalCoins(Number(r.new_balance));
      return;
    }

    playGem();
    setFloors((prev) => {
      const next = [...prev];
      next[floor] = { pick: tile, revealedEggs: eggs, cleared: true };
      return next;
    });
    setProgress(Number(r.progress));

    if (r.ended) {
      // Tower complete — auto cashout
      playCashout();
      if (typeof r.new_balance === "number") setLocalCoins(Number(r.new_balance));
      const payout = Number(r.payout ?? 0);
      const mult = Number(r.multiplier ?? 0);
      toast.success(`Tower complete! +${formatCoins(payout - bet)} (${mult.toFixed(2)}×)`);
      setActive(false);
    }
  }

  async function cashout() {
    if (!active || progress === 0) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("dragontower_cashout");
    setBusy(false);
    if (error) return toast.error(error.message);
    const r = data?.[0];
    if (!r) return;
    playCashout();
    setLocalCoins(Number(r.new_balance));
    const mult = Number(r.multiplier);
    const pay = Number(r.payout);
    toast.success(`+${formatCoins(Math.max(pay - bet, 0))} (${mult.toFixed(2)}×)`);
    // Reveal remaining floors' eggs
    const fullFloors = (r.floors as number[][]) ?? [];
    setFloors((prev) =>
      prev.map((f, i) => ({ ...f, revealedEggs: fullFloors[i] ?? f.revealedEggs })),
    );
    setActive(false);
    setTimeout(() => resetBoard(), 2200);
  }

  // Render floors top-down (highest floor at top)
  const orderedFloors = floors.map((f, i) => ({ ...f, floor: i })).reverse();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <Flame className="h-7 w-7 text-primary" /> DRAGON TOWER
        </h1>
        <p className="text-sm text-muted-foreground">
          Climb 9 floors. Avoid the dragon eggs. Cash out anytime.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_320px]">
        {/* Tower */}
        <div className="rounded-3xl border border-border bg-card/70 p-3 backdrop-blur-xl sm:p-5">
          <div className="space-y-1.5">
            {orderedFloors.map(({ floor, pick: pickedTile, revealedEggs, cleared }) => {
              const isCurrent = active && floor === progress;
              const isPast = floor < progress;
              const isFuture = floor > progress;
              const floorMult = multAtFloor(cfg.step, floor + 1);
              return (
                <div
                  key={floor}
                  className={`flex items-center gap-2 rounded-xl border p-1.5 transition ${
                    isCurrent
                      ? "border-primary bg-primary/10 shadow-[0_0_18px_hsl(var(--primary)/0.3)]"
                      : isPast
                        ? "border-emerald-500/40 bg-emerald-500/5"
                        : "border-border bg-background/40"
                  }`}
                >
                  <div className="w-10 shrink-0 text-center">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                      F{floor + 1}
                    </div>
                    <div className="text-[11px] font-black tabular-nums text-foreground">
                      {floorMult.toFixed(2)}×
                    </div>
                  </div>
                  <div
                    className="grid flex-1 gap-1.5"
                    style={{ gridTemplateColumns: `repeat(${cfg.tiles}, minmax(0, 1fr))` }}
                  >
                    {Array.from({ length: cfg.tiles }).map((_, t) => {
                      const isPicked = pickedTile === t;
                      const isEgg = revealedEggs?.includes(t);
                      const showSafe = (isPast && isPicked) || (isPast && !isEgg);
                      const exploding =
                        exploded?.floor === floor && exploded?.tile === t && isEgg;
                      const baseDisabled =
                        !isCurrent || busy || pickedTile !== undefined;
                      return (
                        <button
                          key={t}
                          onClick={() => pick(floor, t)}
                          disabled={baseDisabled}
                          className={`relative h-9 rounded-lg border transition active:scale-95 ${
                            isEgg
                              ? "border-destructive bg-destructive/20"
                              : showSafe
                                ? "border-emerald-500 bg-emerald-500/20"
                                : isCurrent
                                  ? "border-primary/50 bg-secondary hover:bg-accent cursor-pointer"
                                  : isFuture
                                    ? "border-border bg-secondary/40 cursor-default"
                                    : "border-border bg-background/60 cursor-default"
                          }`}
                        >
                          <AnimatePresence>
                            {(isEgg || (isPast && isPicked)) && (
                              <motion.span
                                key={isEgg ? "egg" : "safe"}
                                initial={{ scale: 0, rotate: -180 }}
                                animate={{
                                  scale: exploding ? [1, 1.4, 1] : 1,
                                  rotate: 0,
                                }}
                                transition={{
                                  type: "spring",
                                  stiffness: 280,
                                  damping: 14,
                                }}
                                className="absolute inset-0 flex items-center justify-center"
                              >
                                {isEgg ? (
                                  <Egg className="h-5 w-5 text-destructive drop-shadow-[0_0_10px_hsl(var(--destructive)/0.7)]" />
                                ) : (
                                  <Footprints className="h-4 w-4 text-emerald-400 drop-shadow-[0_0_10px_hsl(var(--success)/0.7)]" />
                                )}
                              </motion.span>
                            )}
                          </AnimatePresence>
                          {isCurrent && pickedTile === undefined && (
                            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-primary/60">
                              ?
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-4 rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
          <BetControls bet={bet} setBet={setBet} disabled={active} />

          <div>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Difficulty
            </div>
            <div className="grid grid-cols-5 gap-1">
              {(Object.keys(CONFIG) as Difficulty[]).map((d) => {
                const c = CONFIG[d];
                const selected = difficulty === d;
                return (
                  <button
                    key={d}
                    onClick={() => !active && setDifficulty(d)}
                    disabled={active}
                    className={`rounded-md border px-1 py-1.5 text-[9px] font-black uppercase tracking-wider transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      selected
                        ? c.tone
                        : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 text-[10px] text-muted-foreground">
              {cfg.tiles} tiles · {cfg.eggs} egg{cfg.eggs > 1 ? "s" : ""} per floor · step{" "}
              <span className="font-black text-foreground">{cfg.step.toFixed(2)}×</span>
            </div>
          </div>

          {active && (
            <div className="grid grid-cols-2 gap-2 text-center">
              <Stat
                label="Multiplier"
                value={progress > 0 ? `${currentMult.toFixed(2)}×` : "—"}
              />
              <Stat
                label="Next floor"
                value={progress < FLOORS ? `${nextMult.toFixed(2)}×` : "MAX"}
              />
            </div>
          )}

          {active ? (
            <Button
              onClick={cashout}
              disabled={progress === 0 || busy}
              className="h-14 w-full bg-[hsl(var(--success))] text-background hover:bg-[hsl(var(--success))]/90"
            >
              CASHOUT {progress > 0 && `+${formatCoins(profit)}`}
            </Button>
          ) : (
            <Button
              onClick={start}
              disabled={busy}
              className="h-14 w-full text-lg font-black tracking-wider shadow-[0_0_24px_hsl(var(--primary)/0.4)]"
            >
              CLIMB
            </Button>
          )}

          <div className="rounded-xl bg-background/60 p-2.5 text-[10px] text-muted-foreground">
            Max payout (9 floors):{" "}
            <span className="font-black text-foreground">
              {multAtFloor(cfg.step, FLOORS).toFixed(2)}×
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background/60 p-2">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-base font-black tabular-nums">{value}</div>
    </div>
  );
}