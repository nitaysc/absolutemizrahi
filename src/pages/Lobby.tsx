import { Link } from "react-router-dom";
import { useUserProfile } from "@/hooks/useUserProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { Dice5, Coins, Gift, TrendingUp } from "lucide-react";
import { formatCoins } from "@/lib/format";
import mizrahi from "@/assets/absolute-mizrahi.gif";

export default function Lobby() {
  const { profile, refetch } = useUserProfile();
  const [claiming, setClaiming] = useState(false);

  const canClaim =
    !profile?.last_daily_bonus ||
    Date.now() - new Date(profile.last_daily_bonus).getTime() > 24 * 3600 * 1000;

  async function claim() {
    setClaiming(true);
    const { data, error } = await supabase.rpc("claim_daily_bonus");
    setClaiming(false);
    if (error) return toast.error(error.message);
    toast.success(`+${data?.[0]?.awarded ?? 250} Mizrahi Coins!`);
    refetch();
  }

  const games = [
    {
      to: "/dice",
      title: "DICE",
      desc: "Roll over or under. Set your edge, pick your multiplier.",
      icon: Dice5,
      gradient: "from-primary/30 to-primary/5",
    },
    {
      to: "/coinflip",
      title: "COINFLIP",
      desc: "Heads or tails. 2× payout. 50/50 — almost.",
      icon: Coins,
      gradient: "from-amber-500/30 to-amber-500/5",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card/70 p-6 backdrop-blur-xl">
        <div
          aria-hidden
          className="absolute inset-0 opacity-20"
          style={{ backgroundImage: `url(${mizrahi})`, backgroundSize: "150px" }}
        />
        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Welcome back</p>
          <h1 className="mt-1 text-3xl font-black sm:text-4xl">
            Ready to bet, <span className="text-gradient">{profile?.username ?? "player"}</span>?
          </h1>
          <div className="mt-4 flex items-center gap-2 text-2xl font-black">
            <MizrahiCoin size={28} />
            <span className="tabular-nums">{formatCoins(profile?.coins ?? 0)}</span>
            <span className="text-sm font-medium text-muted-foreground">balance</span>
          </div>
        </div>
      </section>

      {/* Daily bonus */}
      <section className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/15 to-transparent p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/20 p-3">
              <Gift className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="font-bold">Daily Bonus</h2>
              <p className="text-sm text-muted-foreground">+250 coins every 24h</p>
            </div>
          </div>
          <button
            onClick={claim}
            disabled={!canClaim || claiming}
            className="rounded-full bg-primary px-5 py-2 font-bold text-primary-foreground shadow-[0_0_18px_hsl(var(--primary)/0.4)] transition disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
          >
            {canClaim ? "Claim" : "Claimed"}
          </button>
        </div>
      </section>

      {/* Games */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
          <TrendingUp className="h-4 w-4" /> Games
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {games.map((g) => (
            <Link
              key={g.to}
              to={g.to}
              className={`group relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br ${g.gradient} p-6 transition hover:border-primary/50 hover:shadow-[0_0_30px_hsl(var(--primary)/0.2)]`}
            >
              <g.icon className="mb-4 h-10 w-10 text-primary transition group-hover:scale-110" />
              <h3 className="text-2xl font-black tracking-tight">{g.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{g.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}