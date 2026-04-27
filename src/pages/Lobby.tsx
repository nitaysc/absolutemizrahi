import { Link } from "react-router-dom";
import { useUserProfile } from "@/hooks/useUserProfile";
import { usePresence } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { Gift, TrendingUp, Package, Swords, Upload } from "lucide-react";
import { formatCoins } from "@/lib/format";
import mizrahi from "@/assets/absolute-mizrahi.gif";
import diceImg from "@/assets/games/dice.jpg";
import crashImg from "@/assets/games/crash.jpg";
import limboImg from "@/assets/games/limbo.jpg";
import minesImg from "@/assets/games/mines.jpg";
import coinflipImg from "@/assets/games/coinflip.jpg";
import blackjackImg from "@/assets/games/blackjack.jpg";
import chickenImg from "@/assets/games/chicken.jpg";
import plinkoImg from "@/assets/games/plinko.jpg";
import dragontowerImg from "@/assets/games/dragontower.jpg";
import pokerImg from "@/assets/games/poker.jpg";
import snakesImg from "@/assets/games/snakes.jpg";
import molesImg from "@/assets/games/moles.jpg";
import chessImg from "@/assets/games/chess.jpg";
import pumpImg from "@/assets/games/pump.jpg";
import rouletteImg from "@/assets/games/roulette.png";
import kenoImg from "@/assets/games/keno.png";
import slidesImg from "@/assets/games/slides.jpg";

export default function Lobby() {
  const { profile, refetch } = useUserProfile();
  const { counts: playing, total } = usePresence();
  const [claiming, setClaiming] = useState(false);
  const [cases, setCases] = useState<{ id: string; name: string; image: string | null; price: number }[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("cases")
        .select("id,name,image,price")
        .eq("status", "approved")
        .order("price")
        .limit(8);
      setCases(data ?? []);
    })();
  }, []);

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
    { to: "/dice", key: "dice", title: "DICE", img: diceImg },
    { to: "/crash", key: "crash", title: "CRASH", img: crashImg },
    { to: "/limbo", key: "limbo", title: "LIMBO", img: limboImg },
    { to: "/mines", key: "mines", title: "MINES", img: minesImg },
    { to: "/coinflip", key: "coinflip", title: "COINFLIP", img: coinflipImg },
    { to: "/blackjack", key: "blackjack", title: "BLACKJACK", img: blackjackImg },
    { to: "/chicken", key: "chicken", title: "CHICKEN", img: chickenImg },
    { to: "/plinko", key: "plinko", title: "PLINKO", img: plinkoImg },
    { to: "/dragontower", key: "dragontower", title: "DRAGON", img: dragontowerImg },
    { to: "/poker", key: "poker", title: "POKER", img: pokerImg },
    { to: "/snakes", key: "snakes", title: "SNAKES", img: snakesImg },
    { to: "/moles", key: "moles", title: "MOLES", img: molesImg },
    { to: "/chess", key: "chess", title: "CHESS", img: chessImg },
    { to: "/pump", key: "pump", title: "PUMP", img: pumpImg },
    { to: "/roulette", key: "roulette", title: "ROULETTE", img: rouletteImg },
    { to: "/keno", key: "keno", title: "KENO", img: kenoImg },
    { to: "/slides", key: "slides", title: "SLIDES", img: slidesImg },
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
          <TrendingUp className="h-4 w-4" /> Mizrahi Originals
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {games.map((g) => {
            const count = playing[g.key] ?? 0;
            return (
              <Link key={g.to} to={g.to} className="group block">
                <div className="relative aspect-[3/4] overflow-hidden rounded-2xl shadow-lg transition-transform duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_10px_30px_-5px_hsl(var(--primary)/0.5)]">
                  <img
                    src={g.img}
                    alt={`${g.title} - Mizrahi Originals`}
                    loading="lazy"
                    width={768}
                    height={1024}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
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

      {/* Mizrahi Cases */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
            <Package className="h-4 w-4" /> Mizrahi Cases
          </h2>
          <div className="flex gap-2">
            <Link
              to="/cases/battles"
              className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground"
            >
              <Swords className="h-3 w-3" /> Battles
            </Link>
            <Link
              to="/cases/upload"
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-bold"
            >
              <Upload className="h-3 w-3" /> Upload
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {cases.map((c) => (
            <Link key={c.id} to="/cases" className="group block">
              <div className="relative flex aspect-[3/4] flex-col items-center justify-between overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-card to-background p-4 shadow-lg transition-transform duration-200 group-hover:-translate-y-1 group-hover:border-primary group-hover:shadow-[0_10px_30px_-5px_hsl(var(--primary)/0.5)]">
                <div className="text-7xl drop-shadow-[0_0_20px_hsl(var(--primary)/0.6)]">
                  {c.image ?? "🎁"}
                </div>
                <div className="w-full text-center">
                  <div className="truncate text-sm font-bold">{c.name}</div>
                  <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-0.5 text-xs font-black text-primary">
                    <MizrahiCoin size={10} /> {formatCoins(c.price)}
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {cases.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground">Loading cases...</p>
          )}
        </div>
      </section>
    </div>
  );
}
