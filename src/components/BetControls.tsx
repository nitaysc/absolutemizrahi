import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MizrahiCoin } from "./MizrahiCoin";
import { useUserProfile } from "@/hooks/useUserProfile";

interface Props {
  bet: number;
  setBet: (n: number) => void;
  disabled?: boolean;
}

/** Reusable bet-amount input with ½ / 2× / Max controls. */
export function BetControls({ bet, setBet, disabled }: Props) {
  const { profile } = useUserProfile();
  const max = profile?.coins ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Bet amount
        </label>
        <span className="text-xs text-muted-foreground">
          Bal: <span className="font-bold text-foreground">{max.toLocaleString()}</span>
        </span>
      </div>
      <div className="mt-2 flex gap-2">
        <div className="relative flex-1">
          <MizrahiCoin size={18} className="absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            type="number"
            min={1}
            value={bet}
            disabled={disabled}
            onChange={(e) => setBet(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
            className="pl-10 text-lg font-bold tabular-nums"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={() => setBet(Math.max(1, Math.floor(bet / 2)))}
        >
          ½
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={() => setBet(Math.min(max || bet * 2, bet * 2))}
        >
          2×
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={() => setBet(Math.max(1, max))}
        >
          Max
        </Button>
      </div>
    </div>
  );
}