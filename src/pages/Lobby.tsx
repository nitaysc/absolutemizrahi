import { Link } from "react-router-dom";
import { useUserProfile } from "@/hooks/useUserProfile";
import { usePresence } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { motion } from "framer-motion";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { MagneticButton } from "@/components/MagneticButton";
import { Gift, TrendingUp, Package, Swords, Zap, Sparkles } from "lucide-react";
import { formatCoins } from "@/lib/format";
import mizrahi from "@/assets/absolute-mizrahi.gif";
import { cn } from "@/lib/utils";
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
import hiloImg from "@/assets/games/hilo.jpg";
import dartsImg from "@/assets/games/darts.jpg";
import rpsImg from "@/assets/games/rps.jpg";

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
    { to: "/hilo", key: "hilo", title: "HI-LO", img: hiloImg },
    { to: "/darts", key: "darts", title: "DARTS", img: dartsImg },
    { to: "/rps", key: "rps", title: "RPS", img: rpsImg },
  ];

  return (
    <div className="space-y-7">
      {/* CINEMATIC HERO */}
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-[2rem] border border-primary/20 bg-card/40 p-6 backdrop-blur-2xl shadow-[0_30px_80px_-20px_hsl(25_95%_53%_/_0.35)] sm:p-8"
      >
        {/* Floating texture layers */}
        <motion.div
          aria-hidden
          className="absolute -right-10 -top-10 h-56 w-56 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(closest-side, hsl(25 95% 53% / 0.7), transparent 70%)" }}
          animate={{ x: [0, 20, -15, 0], y: [0, -10, 12, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="absolute -bottom-16 left-[20%] h-64 w-64 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(closest-side, hsl(280 80% 60% / 0.7), transparent 70%)" }}
          animate={{ x: [0, -25, 18, 0], y: [0, 15, -12, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07] mix-blend-overlay"
          style={{ backgroundImage: `url(${mizrahi})`, backgroundSize: "150px" }}
        />

        <div className="relative">
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-primary"
          >
            <Sparkles className="h-3 w-3" /> Welcome back
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.6 }}
            className="mt-3 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl"
          >
            Ready to bet,
            <br />
            <span className="text-gradient drop-shadow-[0_0_30px_hsl(var(--primary)/0.4)]">
              {profile?.username ?? "player"}
            </span>
            ?
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 }}
            className="mt-5 flex flex-wrap items-center gap-4"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/50 px-4 py-2 backdrop-blur">
              <MizrahiCoin size={24} />
              <span className="text-xl font-black tabular-nums">
                {formatCoins(profile?.coins ?? 0)}
              </span>
              <span className="text-xs text-muted-foreground">balance</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {total.toLocaleString()} online
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* DAILY BONUS */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="group relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card/40 to-transparent p-5 backdrop-blur-xl"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-1000 group-hover:translate-x-full"
        />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ rotate: canClaim ? [0, -8, 8, -4, 4, 0] : 0 }}
              transition={{ duration: 1.6, repeat: canClaim ? Infinity : 0, repeatDelay: 1.4 }}
              className="rounded-2xl bg-primary/20 p-3 ring-1 ring-primary/30"
            >
              <Gift className="h-6 w-6 text-primary" />
            </motion.div>
            <div>
              <h2 className="font-black">Daily Bonus</h2>
              <p className="text-sm text-muted-foreground">+250 coins every 24h</p>
            </div>
          </div>
          <MagneticButton
            onClick={claim}
            disabled={!canClaim || claiming}
            className={cn(
              "px-5 py-2.5 font-black tracking-wide",
              canClaim
                ? "bg-primary text-primary-foreground shadow-[0_0_24px_hsl(var(--primary)/0.5)]"
                : "cursor-not-allowed bg-muted text-muted-foreground",
            )}
          >
            {canClaim ? "Claim" : "Claimed"}
          </MagneticButton>
        </div>
      </motion.section>

      {/* Games */}
      <section>
        <SectionHeader icon={<TrendingUp className="h-4 w-4" />} title="Mizrahi Originals" />
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.04, delayChildren: 0.1 } },
          }}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
        >
          {games.map((g) => {
            const count = playing[g.key] ?? 0;
            return (
              <motion.div
                key={g.to}
                variants={{
                  hidden: { opacity: 0, y: 16, scale: 0.96 },
                  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
                }}
              >
                <Link to={g.to} className="group block">
                  <motion.div
                    whileHover={{ y: -6, rotateX: 4, rotateY: -4 }}
                    transition={{ type: "spring", stiffness: 300, damping: 22 }}
                    style={{ transformPerspective: 700 }}
                    className="relative aspect-[3/4] overflow-hidden rounded-2xl shadow-lg ring-1 ring-border/40 transition-shadow duration-300 group-hover:shadow-[0_18px_40px_-10px_hsl(var(--primary)/0.55)] group-hover:ring-primary/40"
                  >
                    <img
                      src={g.img}
                      alt={`${g.title} - Mizrahi Originals`}
                      loading="lazy"
                      width={768}
                      height={1024}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    {/* sheen sweep */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full"
                    />
                    {/* bottom gradient label area */}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent p-2">
                      <p className="text-[11px] font-black tracking-widest text-foreground/90">
                        {g.title}
                      </p>
                    </div>
                  </motion.div>
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
              </motion.div>
            );
          })}
        </motion.div>
      </section>

      {/* Mizrahi Cases */}
      <section>
        <SectionHeader icon={<Package className="h-4 w-4" />} title="Mizrahi Cases" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            to="/cases"
            className="group relative flex items-center justify-between overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/20 via-card to-background p-5 shadow-lg transition hover:-translate-y-0.5 hover:border-primary hover:shadow-[0_10px_30px_-5px_hsl(var(--primary)/0.6)]"
          >
            <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary">
                Solo
              </p>
              <h3 className="text-2xl font-black">Open Cases</h3>
              <p className="text-xs text-muted-foreground">
                Spin reels and win Mizrahi loot
              </p>
            </div>
            <Package className="h-12 w-12 text-primary drop-shadow-[0_0_20px_hsl(var(--primary)/0.7)]" />
          </Link>
          <Link
            to="/cases/battles"
            className="group relative flex items-center justify-between overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-rose-500/25 via-card to-background p-5 shadow-lg transition hover:-translate-y-0.5 hover:border-rose-400 hover:shadow-[0_10px_30px_-5px_rgba(244,63,94,0.6)]"
          >
            <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-rose-300">
                Multiplayer
              </p>
              <h3 className="text-2xl font-black">Battles</h3>
              <p className="text-xs text-muted-foreground">
                Face off vs players or bots
              </p>
            </div>
            <Swords className="h-12 w-12 text-rose-400 drop-shadow-[0_0_20px_rgba(244,63,94,0.7)]" />
          </Link>
          <Link
            to="/upgrader"
            className="group relative flex items-center justify-between overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-fuchsia-500/25 via-card to-background p-5 shadow-lg transition hover:-translate-y-0.5 hover:border-fuchsia-400 hover:shadow-[0_10px_30px_-5px_rgba(217,70,239,0.6)]"
          >
            <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-fuchsia-300">
                Risk
              </p>
              <h3 className="text-2xl font-black">Upgrader</h3>
              <p className="text-xs text-muted-foreground">
                Risk items for bigger loot
              </p>
            </div>
            <Zap className="h-12 w-12 text-fuchsia-400 drop-shadow-[0_0_20px_rgba(217,70,239,0.7)]" />
          </Link>
          <Link
            to="/inventory"
            className="group relative flex items-center justify-between overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-amber-500/25 via-card to-background p-5 shadow-lg transition hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-[0_10px_30px_-5px_rgba(245,158,11,0.6)]"
          >
            <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
                Loot
              </p>
              <h3 className="text-2xl font-black">Inventory</h3>
              <p className="text-xs text-muted-foreground">
                Sell items for 100% value
              </p>
            </div>
            <Package className="h-12 w-12 text-amber-400 drop-shadow-[0_0_20px_rgba(245,158,11,0.7)]" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="mb-3 flex items-center gap-3"
    >
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
        {icon}
      </span>
      <h2 className="text-sm font-black uppercase tracking-[0.2em] text-foreground/80">{title}</h2>
      <span className="ml-1 h-px flex-1 bg-gradient-to-r from-border to-transparent" />
    </motion.div>
  );
}
