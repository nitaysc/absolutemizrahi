import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Equal, Layers } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { formatCoins } from "@/lib/format";

type Pick = "higher" | "lower" | "equal";

const HOUSE_EDGE = 0.99;
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function randomRank() {
  return Math.floor(Math.random() * 13) + 1;
}

export default function HiLo() {
  useTrackGame("hilo");
  const { profile, setLocalCoins } = useUserProfile();
  const [bet, setBet] = useState(10);
  const [current, setCurrent] = useState(() => randomRank());
  const [next, setNext] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [lastPick, setLastPick] = useState<Pick | null>(null);

  const probabilities = useMemo(() => {
    const higher = (13 - current) / 13;
    const lower = (current - 1) / 13;
    const equal = 1 / 13;
    return { higher, lower, equal };
  }, [current]);

  const multipliers = useMemo(
    () => ({
      higher: probabilities.higher > 0 ? +(HOUSE_EDGE / probabilities.higher).toFixed(4) : 0,
      lower: probabilities.lower > 0 ? +(HOUSE_EDGE / probabilities.lower).toFixed(4) : 0,
      equal: +(HOUSE_EDGE / probabilities.equal).toFixed(4),
    }),
    [probabilities],
  );

  async function play(pick: Pick) {
    if (!profile) return;
    if (bet < 1) {
      toast.error("Bet at least 1 coin");
      return;
    }
    if (bet > profile.coins) {
      toast.error("Not enough coins");
      return;
    }

    const p = probabilities[pick];
    if (p <= 0) {
      toast.error("That pick cannot win on this card");
      return;
    }

    setPending(true);
    const drawn = randomRank();
    const won = pick === "higher" ? drawn > current : pick === "lower" ? drawn < current : drawn === current;

    const { data, error } = await supabase.rpc("place_bet", {
      _game: "hilo",
      _bet_amount: bet,
      _won: won,
      _multiplier: multipliers[pick],
      _details: { current, next: drawn, pick, variant: "higher-lower-equal" },
    });
    setPending(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    setLastPick(pick);
    setNext(drawn);
    setCurrent(drawn);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">Classic card game</p>
        <h1 className="mt-1 text-3xl font-black">HI-LO</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Guess whether the next card will be higher, lower, or equal to the current card.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_320px]">
        <section className="rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
          <div className="grid grid-cols-2 gap-3">
            <CardFace label="Current" rank={RANKS[current - 1]} active />
            <CardFace label="Next" rank={next ? RANKS[next - 1] : "?"} reveal={next !== null} />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <PickButton
              label="Higher"
              icon={<ArrowUp className="h-4 w-4" />}
              chance={probabilities.higher}
              multiplier={multipliers.higher}
              disabled={pending || probabilities.higher <= 0}
              onClick={() => play("higher")}
            />
            <PickButton
              label="Lower"
              icon={<ArrowDown className="h-4 w-4" />}
              chance={probabilities.lower}
              multiplier={multipliers.lower}
              disabled={pending || probabilities.lower <= 0}
              onClick={() => play("lower")}
            />
            <PickButton
              label="Equal"
              icon={<Equal className="h-4 w-4" />}
              chance={probabilities.equal}
              multiplier={multipliers.equal}
              disabled={pending}
              onClick={() => play("equal")}
            />
          </div>

          {lastPick && next !== null && (
            <p className="mt-4 text-sm text-muted-foreground">
              Last pick: <span className="font-bold text-foreground">{lastPick}</span> · Drawn card:
              <span className="ml-1 font-black text-foreground">{RANKS[next - 1]}</span>
            </p>
          )}
        </section>

        <section className="rounded-3xl border border-border bg-card/70 p-4 backdrop-blur-xl">
          <BetControls bet={bet} setBet={setBet} disabled={pending} />
          <div className="mt-3 rounded-2xl bg-background/60 p-3 text-sm">
            <p className="font-semibold">How this variant works</p>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              <li>• One card is shown face up.</li>
              <li>• You bet on the next card being higher, lower, or equal.</li>
              <li>• Payout scales with probability; rarer picks pay more.</li>
              <li>• Cards are sampled with replacement for each round.</li>
            </ul>
          </div>
          <Button disabled className="mt-3 w-full">
            <Layers className="mr-2 h-4 w-4" />
            Bet: {formatCoins(bet)}
          </Button>
        </section>
      </div>
    </div>
  );
}

function CardFace({
  label,
  rank,
  active,
  reveal,
}: {
  label: string;
  rank: string;
  active?: boolean;
  reveal?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/70 p-4 text-center">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p
        className={`mt-2 text-5xl font-black ${
          active
            ? "text-primary drop-shadow-[0_0_16px_hsl(var(--primary)/0.45)]"
            : reveal
              ? "text-foreground"
              : "text-foreground/40"
        }`}
      >
        {rank}
      </p>
    </div>
  );
}

function PickButton({
  label,
  icon,
  chance,
  multiplier,
  disabled,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  chance: number;
  multiplier: number;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-2xl border border-border bg-background/70 p-3 text-left transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
    >
      <p className="flex items-center gap-1 text-sm font-bold">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{(chance * 100).toFixed(2)}% chance</p>
      <p className="text-sm font-semibold text-primary">{multiplier.toFixed(2)}× payout</p>
    </button>
  );
}
