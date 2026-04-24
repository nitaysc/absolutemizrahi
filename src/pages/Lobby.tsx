import { Link } from "react-router-dom";
import { useUserProfile } from "@/hooks/useUserProfile";
import { usePresence } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { Dice5, Coins, Gift, TrendingUp, Bomb, Rocket, Zap, Spade, Bird, Triangle, Wind } from "lucide-react";
import { formatCoins } from "@/lib/format";
import mizrahi from "@/assets/absolute-mizrahi.gif";

export default function Lobby() {
  const { profile, refetch } = useUserProfile();
  const { counts: playing, total } = usePresence();
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
      key: "dice",
      title: "DICE",
      icon: Dice5,
      gradient: "from-violet-500 via-fuchsia-500 to-purple-700",
      iconColor: "text-white",
    },
    {
      to: "/crash",
      key: "crash",
      title: "CRASH",
      icon: Zap,
      gradient: "from-rose-500 via-red-500 to-orange-600",
      iconColor: "text-white",
    },
    {
      to: "/limbo",
      key: "limbo",
      title: "LIMBO",
      icon: Rocket,
      gradient: "from-orange-400 via-amber-500 to-yellow-500",
      iconColor: "text-white",
    },
    {
      to: "/mines",
      key: "mines",
      title: "MINES",
      icon: Bomb,
      gradient: "from-sky-400 via-blue-500 to-indigo-600",
      iconColor: "text-white",
    },
    {
      to: "/coinflip",
      key: "coinflip",
      title: "COINFLIP",
      icon: Coins,
      gradient: "from-emerald-400 via-green-500 to-teal-600",
      iconColor: "text-white",
    },
    {
      to: "/blackjack",
      key: "blackjack",
      title: "BLACKJACK",
      icon: Spade,
      gradient: "from-slate-700 via-zinc-800 to-black",
      iconColor: "text-white",
    },
    {
      to: "/chicken",
      key: "chicken",
      title: "CHICKEN",
      icon: Bird,
      gradient: "from-yellow-400 via-orange-500 to-red-600",
      iconColor: "text-white",
    },
    {
      to: "/plinko",
      key: "plinko",
      title: "PLINKO",
      icon: Triangle,
      gradient: "from-pink-500 via-fuchsia-500 to-purple-700",
      iconColor: "text-white",
    },
    {
      to: "/pump",
      key: "pump",
      title: "PUMP",
      icon: Wind,
      gradient: "from-cyan-400 via-teal-500 to-emerald-600",
      iconColor: "text-white",
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {games.map((g) => {
            const count = playing[g.key] ?? 0;
            return (
              <Link key={g.to} to={g.to} className="group block">
                <div
                  className={`relative aspect-[3/4] overflow-hidden rounded-2xl bg-gradient-to-br ${g.gradient} shadow-lg transition-transform duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_10px_30px_-5px_hsl(var(--primary)/0.5)]`}
                >
                  {/* glossy highlight */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
                  {/* big icon */}
                  <g.icon
                    className={`absolute left-1/2 top-[28%] h-20 w-20 -translate-x-1/2 ${g.iconColor} drop-shadow-[0_6px_12px_rgba(0,0,0,0.35)] transition-transform duration-300 group-hover:scale-110`}
                    strokeWidth={1.75}
                  />
                  {/* title block */}
                  <div className="absolute inset-x-0 bottom-0 p-3 text-center">
                    <h3 className="text-2xl font-black uppercase tracking-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] sm:text-3xl">
                      {g.title}
                    </h3>
                    <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-white/80">
                      Mizrahi Originals
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1.5 px-1 text-xs">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  <span className="font-bold tabular-nums text-foreground">
                    {count.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground">playing</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}