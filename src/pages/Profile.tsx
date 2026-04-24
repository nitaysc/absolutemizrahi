import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { supabase } from "@/integrations/supabase/client";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Bet {
  id: string;
  game: string;
  bet_amount: number;
  payout: number;
  multiplier: number;
  won: boolean;
  created_at: string;
}

export default function Profile() {
  const { user } = useAuth();
  const { profile, refetch, setLocalCoins } = useUserProfile();
  const [name, setName] = useState("");
  const [bets, setBets] = useState<Bet[]>([]);
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (profile?.username) setName(profile.username);
  }, [profile?.username]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("bets")
        .select("id, game, bet_amount, payout, multiplier, won, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      setBets(
        (data ?? []).map((b) => ({
          id: b.id,
          game: b.game,
          bet_amount: Number(b.bet_amount),
          payout: Number(b.payout),
          multiplier: Number(b.multiplier),
          won: b.won,
          created_at: b.created_at,
        })),
      );
    })();
  }, [user, profile?.coins]);

  async function saveName() {
    if (!user) return;
    const trimmed = name.trim();
    if (trimmed.length < 2) return toast.error("Name too short");
    const { error } = await supabase
      .from("profiles")
      .update({ username: trimmed })
      .eq("id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Username updated");
    refetch();
  }

  async function redeem() {
    const c = code.trim();
    if (!c) return toast.error("Enter a code");
    setRedeeming(true);
    const { data, error } = await supabase.rpc("redeem_code", { _code: c });
    setRedeeming(false);
    if (error) return toast.error(error.message);
    const r = data?.[0];
    if (r) {
      setLocalCoins(Number(r.new_balance));
      toast.success(`+${formatCoins(Number(r.awarded))} coins!`);
    }
    setCode("");
  }

  async function sendCoins() {
    const u = sendTo.trim();
    const amt = Math.floor(Number(sendAmount));
    if (!u) return toast.error("Enter a username");
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Enter a valid amount");
    if ((profile?.coins ?? 0) < amt) return toast.error("Insufficient coins");
    setSending(true);
    const { data, error } = await supabase.rpc("send_coins", {
      _recipient_username: u,
      _amount: amt,
    });
    setSending(false);
    if (error) return toast.error(error.message);
    const r = data?.[0];
    if (r) {
      setLocalCoins(Number(r.new_balance));
      toast.success(`Sent ${formatCoins(Number(r.amount))} to ${r.recipient_username}`);
      setSendTo("");
      setSendAmount("");
    }
  }

  const profit = (profile?.total_won ?? 0) - (profile?.total_wagered ?? 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight">PROFILE</h1>
        <p className="text-sm text-muted-foreground">{user?.email}</p>
      </header>

      <section className="rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Username</label>
        <div className="mt-2 flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
          <Button onClick={saveName}>Save</Button>
        </div>
      </section>

      <section className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-primary">
              🎁 Redeem code
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Got a code? Drop it in for free Mizrahi Coins.
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ENTER CODE"
            disabled={redeeming}
            className="uppercase tracking-widest"
            onKeyDown={(e) => {
              if (e.key === "Enter") redeem();
            }}
          />
          <Button onClick={redeem} disabled={redeeming || !code.trim()}>
            {redeeming ? "..." : "Redeem"}
          </Button>
        </div>
      </section>

      <section className="rounded-3xl border border-[hsl(var(--success))]/30 bg-gradient-to-br from-[hsl(var(--success))]/10 to-transparent p-5">
        <h2 className="text-sm font-black uppercase tracking-widest text-[hsl(var(--success))]">
          💸 Send coins
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Transfer Mizrahi Coins to another player by username.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_auto]">
          <Input
            value={sendTo}
            onChange={(e) => setSendTo(e.target.value)}
            placeholder="Username"
            disabled={sending}
          />
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={sendAmount}
            onChange={(e) => setSendAmount(e.target.value)}
            placeholder="Amount"
            disabled={sending}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendCoins();
            }}
          />
          <Button
            onClick={sendCoins}
            disabled={sending || !sendTo.trim() || !sendAmount}
          >
            {sending ? "..." : "Send"}
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <Stat label="Balance" value={formatCoins(profile?.coins ?? 0)} coin />
        <Stat label="Wagered" value={formatCoins(profile?.total_wagered ?? 0)} coin />
        <Stat
          label="Profit"
          value={`${profit >= 0 ? "+" : ""}${formatCoins(profit)}`}
          coin
          tone={profit >= 0 ? "good" : "bad"}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">Recent bets</h2>
        {bets.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
            No bets yet. Hit the lobby and start spinning.
          </div>
        ) : (
          <ul className="space-y-2">
            {bets.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between rounded-2xl border border-border bg-card/60 p-3"
              >
                <div>
                  <div className="text-sm font-bold capitalize">{b.game}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatCoins(b.bet_amount)} @ {Number(b.multiplier).toFixed(2)}×
                  </div>
                </div>
                <div
                  className={`flex items-center gap-1 font-black tabular-nums ${
                    b.won ? "text-[hsl(var(--success))]" : "text-destructive"
                  }`}
                >
                  <MizrahiCoin size={14} />
                  {b.won ? `+${formatCoins(b.payout - b.bet_amount)}` : `-${formatCoins(b.bet_amount)}`}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  coin,
  tone,
}: {
  label: string;
  value: string;
  coin?: boolean;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3 text-center">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className={`mt-1 flex items-center justify-center gap-1 text-base font-black tabular-nums ${
          tone === "good" ? "text-[hsl(var(--success))]" : tone === "bad" ? "text-destructive" : ""
        }`}
      >
        {coin && <MizrahiCoin size={14} />}
        {value}
      </div>
    </div>
  );
}