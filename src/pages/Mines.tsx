import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { NumberField } from "@/components/NumberField";
import { formatCoins } from "@/lib/format";
import { Bomb, Gem } from "lucide-react";
import { playGem, playBomb, playTileClick, playCashout } from "@/lib/sfx";

type Tile = "hidden" | "gem" | "bomb";

export default function Mines() {
  useTrackGame("mines");
  const { profile, setLocalCoins } = useUserProfile();
  const [bet, setBet] = useState(10);
  const [mines, setMines] = useState(3);
  const [active, setActive] = useState(false);
  const [tiles, setTiles] = useState<Tile[]>(Array(25).fill("hidden"));
  const [revealedCount, setRevealedCount] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [busy, setBusy] = useState(false);

  // Resume any active round on mount
  useEffect(() => {
    if (!profile) return;
    // Check via separate query for the round
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("mines_round")
        .eq("id", profile.id)
        .maybeSingle();
      const round = data?.mines_round as
        | { active?: boolean; bet?: number; mines?: number; revealed?: number[] }
        | null;
      if (round?.active) {
        setActive(true);
        setBet(Number(round.bet ?? bet));
        setMines(Number(round.mines ?? mines));
        const t: Tile[] = Array(25).fill("hidden");
        (round.revealed ?? []).forEach((idx) => (t[idx] = "gem"));
        setTiles(t);
        setRevealedCount(round.revealed?.length ?? 0);
        setMultiplier(currentMultiplier(Number(round.mines ?? 1), round.revealed?.length ?? 0));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const gemsLeft = 25 - mines - revealedCount;
  const nextMultiplier = currentMultiplier(mines, revealedCount + 1);
  const profit = Math.floor(bet * multiplier) - bet;

  async function start() {
    if (!profile) return;
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");
    if (mines < 1 || mines > 24) return toast.error("Mines 1-24");
    setBusy(true);
    const { data, error } = await supabase.rpc("mines_start", {
      _bet_amount: bet,
      _mines: mines,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    setTiles(Array(25).fill("hidden"));
    setRevealedCount(0);
    setMultiplier(1);
    setActive(true);
  }

  async function reveal(i: number) {
    if (!active || tiles[i] !== "hidden" || busy) return;
    playTileClick();
    setBusy(true);
    const { data, error } = await supabase.rpc("mines_reveal", { _tile: i });
    setBusy(false);
    if (error) return toast.error(error.message);
    const r = data?.[0];
    if (!r) return;
    if (r.hit_bomb) {
      playBomb();
      // Use functional update so we don't drop a click that landed mid-request.
      setTiles((prev) => {
        const next: Tile[] = [...prev];
        next[i] = "bomb";
        const bombs = (r.bombs as number[]) ?? [];
        bombs.forEach((b) => (next[b] = "bomb"));
        return next;
      });
      setActive(false);
      setMultiplier(0);
      toast.error(`Boom! -${formatCoins(bet)}`);
      return;
    }
    playGem();
    // Functional update guarantees the clicked tile shows even if React
    // batched another state change between the click and the response.
    setTiles((prev) => {
      const next: Tile[] = [...prev];
      next[i] = "gem";
      return next;
    });
    setRevealedCount((c) => c + 1);
    setMultiplier(Number(r.multiplier));
  }

  async function cashout() {
    if (!active || revealedCount === 0) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("mines_cashout");
    setBusy(false);
    if (error) return toast.error(error.message);
    const r = data?.[0];
    if (r) setLocalCoins(Number(r.new_balance));
    if (r) {
      playCashout();
      const profit = Math.max(Number(r.payout ?? 0) - bet, 0);
      toast.success(
        `+${formatCoins(profit)} (${Number(r.multiplier).toFixed(2)}×)`,
      );
      // Reveal the bombs the player avoided so they can see what they dodged.
      const bombs = (r.bombs as number[]) ?? [];
      setTiles((prev) => {
        const next: Tile[] = [...prev];
        bombs.forEach((b) => {
          if (next[b] === "hidden") next[b] = "bomb";
        });
        return next;
      });
      setActive(false);
      // Auto-clear after a short reveal so the next round starts fresh.
      setTimeout(() => {
        setTiles(Array(25).fill("hidden"));
        setRevealedCount(0);
        setMultiplier(1);
      }, 2200);
      return;
    }
    setActive(false);
    setTiles(Array(25).fill("hidden"));
    setRevealedCount(0);
    setMultiplier(1);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <Bomb className="h-7 w-7 text-primary" /> MINES
        </h1>
        <p className="text-sm text-muted-foreground">
          Reveal gems, dodge bombs, cash out before you bust.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_320px]">
        {/* Grid */}
        <div className="rounded-3xl border border-border bg-card/70 p-4 backdrop-blur-xl sm:p-6">
          <div className="grid grid-cols-5 gap-2 sm:gap-3">
            {tiles.map((t, i) => (
              <button
                key={i}
                onClick={() => reveal(i)}
                disabled={!active || t !== "hidden" || busy}
                className={`relative aspect-square rounded-xl transition ${
                  t === "hidden"
                    ? active
                      ? "bg-secondary hover:bg-accent active:scale-95 cursor-pointer"
                      : "bg-secondary/50 cursor-default"
                    : t === "gem"
                      ? "bg-[hsl(var(--success))]/15 ring-2 ring-[hsl(var(--success))]"
                      : "bg-destructive/15 ring-2 ring-destructive"
                }`}
              >
                {/* No AnimatePresence — it was racing fast clicks and making
                    revealed gems disappear. A simple key-based motion remount
                    plays the pop animation reliably. */}
                {t !== "hidden" && (
                  <motion.div
                    key={t}
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 14 }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    {t === "gem" ? (
                      <Gem className="h-7 w-7 text-[hsl(var(--success))] drop-shadow-[0_0_12px_hsl(var(--success)/0.6)] sm:h-9 sm:w-9" />
                    ) : (
                      <Bomb className="h-7 w-7 text-destructive drop-shadow-[0_0_12px_hsl(var(--destructive)/0.6)] sm:h-9 sm:w-9" />
                    )}
                  </motion.div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-4 rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
          <BetControls bet={bet} setBet={setBet} disabled={active} />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Mines
              </label>
              <NumberField
                value={mines}
                onChange={setMines}
                min={1}
                max={24}
                disabled={active}
                className="mt-2"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Gems
              </label>
              <div className="mt-2 rounded-md border border-input bg-background/60 px-3 py-2 text-lg font-black tabular-nums">
                {25 - mines}
              </div>
            </div>
          </div>

          {active && (
            <div className="grid grid-cols-2 gap-2 text-center">
              <Stat label="Multiplier" value={`${multiplier.toFixed(2)}×`} />
              <Stat
                label="Next pick"
                value={gemsLeft > 0 ? `${nextMultiplier.toFixed(2)}×` : "—"}
              />
            </div>
          )}

          {active ? (
            <Button
              onClick={cashout}
              disabled={revealedCount === 0 || busy}
              className="h-14 w-full bg-[hsl(var(--success))] text-background hover:bg-[hsl(var(--success))]/90"
            >
              CASHOUT {revealedCount > 0 && `+${formatCoins(profit)}`}
            </Button>
          ) : (
            <Button
              onClick={start}
              disabled={busy}
              className="h-14 w-full text-lg font-black tracking-wider shadow-[0_0_24px_hsl(var(--primary)/0.4)]"
            >
              BET
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Mines multiplier with 1% house edge. Identical formula to the SQL function. */
function currentMultiplier(mines: number, safeRevealed: number): number {
  if (safeRevealed <= 0) return 1;
  let m = 1;
  for (let i = 0; i < safeRevealed; i++) {
    m *= (25 - i) / (25 - mines - i);
  }
  return +(m * 0.99).toFixed(4);
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