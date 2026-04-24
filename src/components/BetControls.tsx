import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MizrahiCoin } from "./MizrahiCoin";
import { useUserProfile } from "@/hooks/useUserProfile";

interface Props {
  bet: number;
  setBet: (n: number) => void;
  disabled?: boolean;
}

/** Reusable bet-amount input with ½ / 2× / Max controls.
 *  Uses a local string buffer so the user can freely type, clear, or paste
 *  without the field snapping back to "1" on every keystroke. */
export function BetControls({ bet, setBet, disabled }: Props) {
  const { profile } = useUserProfile();
  const max = profile?.coins ?? 0;

  // Local string buffer — keeps cursor + intermediate values usable while typing.
  const [text, setText] = useState(String(bet));
  useEffect(() => {
    // Sync from external changes (½, 2×, Max) without clobbering active typing.
    if (Number(text) !== bet) setText(String(bet));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bet]);

  function commit(raw: string) {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 1) {
      setBet(1);
      setText("1");
    } else {
      setBet(n);
      setText(String(n));
    }
  }

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
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={text}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, "");
              setText(v);
              const n = Number(v);
              if (v !== "" && Number.isFinite(n) && n >= 1) setBet(n);
            }}
            onBlur={(e) => commit(e.target.value)}
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