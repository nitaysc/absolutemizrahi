import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimationControls, useMotionValue } from "framer-motion";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { Sparkles, Swords } from "lucide-react";
import { playReelTick, playReelLand } from "@/lib/sfx";
import empireSpinImg from "@/assets/empire-spin.png";
import duelSpinImg from "@/assets/duel-spin.png";

export type ReelItem = {
  name: string;
  image: string | null;
  value: number;
  rarity: string;
  // Marks a special virtual tile in the reel
  special?: "empire" | "duel" | null;
};

export type ReelResult = ReelItem & {
  special_spin?: string;
};

const RARITY_BG: Record<string, string> = {
  common: "from-slate-600/20 to-slate-900/70 border-slate-500/40",
  uncommon: "from-emerald-500/25 to-emerald-950/70 border-emerald-400/50",
  rare: "from-sky-500/30 to-blue-950/70 border-sky-400/60",
  epic: "from-fuchsia-500/30 to-purple-950/70 border-fuchsia-400/70",
  legendary: "from-amber-400/35 to-orange-950/70 border-amber-300/80",
  mythic: "from-rose-500/40 to-pink-950/75 border-rose-300/90",
};

const RARITY_GLOW: Record<string, string> = {
  common: "shadow-[0_0_18px_rgba(100,116,139,0.30)]",
  uncommon: "shadow-[0_0_22px_rgba(16,185,129,0.40)]",
  rare: "shadow-[0_0_26px_rgba(56,189,248,0.55)]",
  epic: "shadow-[0_0_32px_rgba(217,70,239,0.65)]",
  legendary: "shadow-[0_0_38px_rgba(245,158,11,0.75)]",
  mythic: "shadow-[0_0_46px_rgba(244,63,94,0.85)]",
};

const RARITY_TEXT: Record<string, string> = {
  common: "text-slate-300",
  uncommon: "text-emerald-300",
  rare: "text-sky-300",
  epic: "text-fuchsia-300",
  legendary: "text-amber-300",
  mythic: "text-rose-300",
};

type Props = {
  pool: ReelItem[];
  result: ReelResult | null;
  spinKey: string | number;
  durationMs?: number;
  size?: "xs" | "sm" | "md" | "lg";
  onComplete?: () => void;
  /** Deprecated — Empire/Duel are now in-reel special tiles via result.special_spin */
  preBadge?: "empire" | "duel" | null;
};

const ItemCard = forwardRef<
  HTMLDivElement,
  { item: ReelItem; size?: "xs" | "sm" | "md" | "lg"; height: number }
>(function ItemCard({ item, size = "md", height }, ref) {
  const emoji = size === "sm" ? "text-4xl" : size === "lg" ? "text-7xl" : "text-5xl";

  // SPECIAL virtual tiles (Empire / Duel)
  if (item.special === "empire" || item.special === "duel") {
    const isEmpire = item.special === "empire";
    return (
      <div
        ref={ref}
        className={`relative w-full overflow-hidden rounded-xl border-2 animate-pulse ${
          isEmpire
            ? "border-fuchsia-200 bg-gradient-to-b from-fuchsia-400/60 to-purple-950/90 shadow-[0_0_60px_12px_rgba(217,70,239,0.95)] ring-2 ring-fuchsia-300/70"
            : "border-amber-200 bg-gradient-to-b from-amber-300/60 to-orange-950/90 shadow-[0_0_60px_12px_rgba(245,158,11,0.95)] ring-2 ring-amber-300/70"
        }`}
        style={{ height }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.35),transparent_65%)]" />
        <div
          className={`absolute inset-0 ${
            isEmpire ? "bg-fuchsia-500/10" : "bg-amber-500/10"
          }`}
        />
        <img
          src={isEmpire ? empireSpinImg : duelSpinImg}
          alt={isEmpire ? "Empire Spin" : "Duel Spin"}
          className="absolute inset-0 h-full w-full object-contain p-1 drop-shadow-[0_0_18px_rgba(255,255,255,0.6)]"
          draggable={false}
        />
        <div
          className={`absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
            isEmpire
              ? "bg-fuchsia-100 text-fuchsia-900"
              : "bg-amber-100 text-amber-900"
          }`}
        >
          {isEmpire ? "Empire" : "Duel"}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`relative w-full overflow-hidden rounded-xl border-2 bg-gradient-to-b ${
        RARITY_BG[item.rarity] ?? RARITY_BG.common
      } ${RARITY_GLOW[item.rarity] ?? RARITY_GLOW.common}`}
      style={{ height }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(255,255,255,0.18),transparent_60%)]" />
      <div className="flex h-full flex-col items-center justify-center gap-1 p-2">
        {(() => {
          const nameIsUrl = item.name && /^https?:\/\//i.test(item.name);
          const imgSrc = item.image && /^https?:\/\//i.test(item.image)
            ? item.image
            : (nameIsUrl ? item.name : null);
          if (imgSrc) {
            return (
              <img
                src={imgSrc}
                alt={nameIsUrl ? "item" : item.name}
                className="max-h-[60%] w-auto object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
                draggable={false}
              />
            );
          }
          return (
            <div className={`${emoji} drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]`}>
              {item.image ?? "🎁"}
            </div>
          );
        })()}
        <div
          className={`w-full truncate text-center text-[10px] font-bold uppercase tracking-wide ${
            RARITY_TEXT[item.rarity] ?? "text-slate-200"
          }`}
        >
          {item.name && /^https?:\/\//i.test(item.name) ? "Item" : item.name}
        </div>
        <div className="inline-flex items-center gap-1 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] font-black text-white/90">
          <MizrahiCoin size={8} /> {formatCoins(item.value)}
        </div>
      </div>
    </div>
  );
});

/**
 * Vertical Empire-Drop / CSGO style rolling reel.
 *
 * Behaviour:
 * - Reel scrolls vertically and lands on `result`.
 * - A short "tick" sound plays each time an item passes the center marker,
 *   matching the visual to the audio.
 * - If `result.special_spin === "empire"`, the reel first lands on an EMPIRE
 *   tile, then spins a second time on the same lane and lands on the actual
 *   item (the better-of-two roll already done server side).
 * - If `result.special_spin === "duel"`, the reel first lands on a DUEL tile,
 *   then runs a 50/50 spin between a single low and single high item and
 *   lands on the actual item.
 */
export function CaseReel({
  pool,
  result,
  spinKey,
  durationMs = 6400,
  size = "md",
  onComplete,
}: Props) {
  const controls = useAnimationControls();
  const yMotion = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerH, setContainerH] = useState(0);
  const [phase, setPhase] = useState<"idle" | "spinning" | "landed">("idle");
  const [specialHitFx, setSpecialHitFx] = useState<"empire" | "duel" | null>(null);

  // Tile dimensions
  const tileH = size === "xs" ? 72 : size === "sm" ? 96 : size === "lg" ? 150 : 120;
  const gap = 14;
  const step = tileH + gap;
  const STRIP_LEN = 80;
  const LANDING_INDEX = 65;

  // Determine which "stage" we're in. For specials, we run a 2-stage animation.
  const isEmpire = result?.special_spin === "empire";
  const isDuel = result?.special_spin === "duel";
  const hasSpecial = isEmpire || isDuel;
  const [stage, setStage] = useState<0 | 1>(0); // 0 = first spin, 1 = follow-up

  // Pool used for the current stage strip
  const sortedPool = useMemo(
    () => (pool.length ? [...pool].sort((a, b) => b.value - a.value) : []),
    [pool],
  );
  const topItems = useMemo(
    () => sortedPool.slice(0, Math.max(1, Math.ceil(sortedPool.length * 0.2))),
    [sortedPool],
  );
  const bottomItems = useMemo(
    () => sortedPool.slice(-Math.max(1, Math.ceil(sortedPool.length * 0.2))),
    [sortedPool],
  );

  // Build the strip for the current stage
  const strip = useMemo(() => {
    if (!pool.length || !result) return [] as ReelItem[];
    const arr: ReelItem[] = [];

    // Helper to fill from a base pool with bait near landing
    const buildStrip = (basePool: ReelItem[], landed: ReelItem, baitPool: ReelItem[]) => {
      const out: ReelItem[] = [];
      for (let i = 0; i < STRIP_LEN; i++) {
        out.push(basePool[Math.floor(Math.random() * basePool.length)]);
      }
      out[LANDING_INDEX] = landed;
      // Bait positions — sometimes close to center, sometimes farther away.
      // This creates a more dramatic "near miss" feel without being every spin.
      const useCloseBaits = Math.random() < 0.45;
      const baitOffsets = useCloseBaits ? [-3, -2, -1, 1, 2, 3, 4] : [-7, -6, -5, 5, 6, 7, 8];
      baitOffsets.forEach((off, idx) => {
        const pos = LANDING_INDEX + off;
        if (pos < 0 || pos >= STRIP_LEN || pos === LANDING_INDEX) return;
        if (Math.random() < 0.55 && baitPool.length) {
          out[pos] = baitPool[idx % baitPool.length];
        }
      });
      // ~25% of normal spins, sprinkle 1-2 Empire/Duel "tease" tiles.
      if (Math.random() < 0.25) {
        const tease: ReelItem =
          Math.random() < 0.5
            ? { name: "Empire Spin", image: "✨", value: 0, rarity: "legendary", special: "empire" }
            : { name: "Duel Spin", image: "⚔️", value: 0, rarity: "epic", special: "duel" };
        const teaseCount = 1 + Math.floor(Math.random() * 2);
        for (let k = 0; k < teaseCount; k++) {
          // Usually farther from center, but sometimes close for hype.
          const safe = Math.floor(Math.random() * (LANDING_INDEX - 7));
          if (safe >= 0 && safe < STRIP_LEN && Math.abs(safe - LANDING_INDEX) > 3) {
            out[safe] = tease;
          }
        }
      }
      return out;
    };

    // STAGE 0: regular spin or first stage of special
    if (stage === 0) {
      if (hasSpecial) {
        // Land on the SPECIAL tile, sprinkle other specials + items in strip
        const specialTile: ReelItem = isEmpire
          ? { name: "Empire Spin", image: "✨", value: 0, rarity: "legendary", special: "empire" }
          : { name: "Duel Spin", image: "⚔️", value: 0, rarity: "epic", special: "duel" };
        const filler = [...pool];
        // Sprinkle a few specials elsewhere so it looks "in pool" (visual only)
        for (let i = 0; i < STRIP_LEN; i++) {
          arr.push(filler[Math.floor(Math.random() * filler.length)]);
        }
        // Plant special at landing
        arr[LANDING_INDEX] = specialTile;
        // Sprinkle 2-3 other special tiles randomly far away from center
        for (let k = 0; k < 3; k++) {
          const pos = Math.floor(Math.random() * (LANDING_INDEX - 10));
          arr[pos] = specialTile;
        }
        return arr;
      }
      // Normal spin: land on result, bait with top items
      return buildStrip(pool, result, topItems);
    }

    // STAGE 1: follow-up spin for specials
    if (isEmpire) {
      // Empire = upgraded pool (top items emphasised), land on actual result
      const upgraded = [...topItems, ...sortedPool.slice(0, Math.ceil(sortedPool.length / 2))];
      return buildStrip(upgraded.length ? upgraded : pool, result, topItems);
    }
    if (isDuel) {
      // Duel = strict 50/50 between one low and one high item
      const high = topItems[0] ?? result;
      const low = bottomItems[0] ?? result;
      const duelPool = [high, low];
      const out: ReelItem[] = [];
      for (let i = 0; i < STRIP_LEN; i++) {
        out.push(duelPool[i % 2]);
      }
      out[LANDING_INDEX] = result;
      // Make the neighbours visibly the OTHER outcome to tease
      const other = result.value >= high.value ? low : high;
      [-2, -1, 1, 2].forEach((off) => {
        const p = LANDING_INDEX + off;
        if (p >= 0 && p < STRIP_LEN) out[p] = other;
      });
      return out;
    }
    return buildStrip(pool, result, topItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey, pool.length, stage, hasSpecial, isEmpire, isDuel]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerH(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset stage whenever spinKey changes (new spin requested)
  useEffect(() => {
    setStage(0);
    setSpecialHitFx(null);
  }, [spinKey]);

  // Main animation effect — runs per stage
  useEffect(() => {
    if (!result || !containerH || !strip.length) {
      setPhase("idle");
      controls.set({ y: 0 });
      return;
    }
    setPhase("spinning");
    const center = containerH / 2;
    // Small jitter — keeps the marker safely INSIDE the result tile so we
    // never visually overlap a neighbour. (Bigger jitter caused the reel to
    // look like it landed on the wrong item.)
    const jitter = (Math.random() - 0.5) * (tileH * 0.25);
    const targetCenter = LANDING_INDEX * step + tileH / 2 + jitter;
    const offset = -(targetCenter - center);

    // Stage 1 (follow-up spin) is slightly shorter but still dramatic.
    const dur = stage === 1 ? Math.max(2300, durationMs * 0.82) : durationMs;

    controls.set({ y: center - tileH / 2 });
    const startedAt = performance.now();
    // Single smooth glide with a strong deceleration curve (csgo-style).
    // No bounce / overshoot — the reel must NEVER move after it stops, or
    // it looks like it changed which item you got.
    const glide = controls.start({
      y: offset,
      transition: { duration: dur / 1000, ease: [0.16, 0.84, 0.24, 1] },
    });
    glide.then(() => {
      void startedAt;
      playReelLand();
      // If this was the first stage of a special spin, queue stage 2.
      if (stage === 0 && hasSpecial) {
        setSpecialHitFx(isEmpire ? "empire" : "duel");
        setTimeout(() => setSpecialHitFx(null), 900);
        // brief beat before second spin
        setTimeout(() => setStage(1), 900);
      } else {
        setPhase("landed");
        onComplete?.();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey, containerH, strip.length, stage]);

  // Tick sound: fire each time a tile crosses the center marker
  const lastTickIdxRef = useRef<number>(-1);
  useEffect(() => {
    const center = containerH / 2;
    const unsub = yMotion.on("change", (y) => {
      if (phase !== "spinning" || !containerH) return;
      // The center of tile i is at: y + i*step + tileH/2  (relative to strip top, which is at y in container coords)
      // We want index where (y + idx*step + tileH/2) === center  => idx = (center - y - tileH/2) / step
      const idx = Math.floor((center - y - tileH / 2) / step + 0.5);
      if (idx !== lastTickIdxRef.current) {
        if (lastTickIdxRef.current !== -1) {
          playReelTick();
        }
        lastTickIdxRef.current = idx;
      }
    });
    return () => unsub();
  }, [containerH, phase, step, tileH, yMotion]);

  // Reset tick tracking on each new stage
  useEffect(() => {
    lastTickIdxRef.current = -1;
  }, [stage, spinKey]);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-background via-card/50 to-background"
      style={{ height: tileH * 2 + gap * 2 + 16 }}
    >
      {/* Edge fades top/bottom */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-16 bg-gradient-to-b from-background to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-16 bg-gradient-to-t from-background to-transparent" />

      {/* Special-hit burst when duel/empire lands */}
      {specialHitFx && (
        <>
          <motion.div
            key={`${specialHitFx}-burst`}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: [0, 0.95, 0], scale: [0.85, 1.04, 1.16] }}
            transition={{ duration: 0.85, ease: "easeOut" }}
            className={`pointer-events-none absolute inset-0 z-[25] ${
              specialHitFx === "empire"
                ? "bg-[radial-gradient(circle_at_50%_50%,rgba(245,158,11,0.65),rgba(249,115,22,0.28),transparent_70%)]"
                : "bg-[radial-gradient(circle_at_50%_50%,rgba(217,70,239,0.62),rgba(59,130,246,0.26),transparent_70%)]"
            }`}
          />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.7 }}
            className={`pointer-events-none absolute inset-x-0 top-1/2 z-[35] h-[6px] -translate-y-1/2 ${
              specialHitFx === "empire"
                ? "bg-amber-300 shadow-[0_0_25px_rgba(252,211,77,1)]"
                : "bg-fuchsia-300 shadow-[0_0_25px_rgba(244,114,182,1)]"
            }`}
          />
        </>
      )}

      {/* Center marker line + side arrows */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-30 h-[3px] -translate-y-1/2 bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
      <div className="pointer-events-none absolute left-0 top-1/2 z-30 -translate-y-1/2">
        <div className="h-0 w-0 border-b-[7px] border-l-[10px] border-t-[7px] border-b-transparent border-l-primary border-t-transparent" />
      </div>
      <div className="pointer-events-none absolute right-0 top-1/2 z-30 -translate-y-1/2">
        <div className="h-0 w-0 border-b-[7px] border-r-[10px] border-t-[7px] border-b-transparent border-r-primary border-t-transparent" />
      </div>

      {/* Strip */}
      <motion.div
        animate={controls}
        style={{ y: yMotion, willChange: "transform", gap }}
        className="absolute inset-x-2 top-0 flex flex-col"
      >
        {strip.map((it, i) => (
          <ItemCard key={i} item={it} size={size} height={tileH} />
        ))}
      </motion.div>

      {/* Stage 1 chip ("Reroll" / "Duel deciding") */}
      {stage === 1 && phase === "spinning" && (
        <div
          className={`pointer-events-none absolute left-2 top-2 z-40 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase backdrop-blur ${
            isEmpire
              ? "bg-amber-500/30 text-amber-100"
              : "bg-fuchsia-500/30 text-fuchsia-100"
          }`}
        >
          {isEmpire ? <Sparkles className="h-3 w-3" /> : <Swords className="h-3 w-3" />}
          {isEmpire ? "Empire Reroll" : "Duel Spin"}
        </div>
      )}

      {/* Landed glow ring */}
      {phase === "landed" && result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="pointer-events-none absolute inset-x-2 top-1/2 z-10 -translate-y-1/2 rounded-xl ring-2 ring-primary/60"
          style={{ height: tileH }}
        />
      )}

      {/* Persistent special-spin chip after landing */}
      {phase === "landed" && hasSpecial && (
        <div
          className={`pointer-events-none absolute left-2 top-2 z-40 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase backdrop-blur ${
            isEmpire
              ? "bg-amber-500/30 text-amber-100"
              : "bg-fuchsia-500/30 text-fuchsia-100"
          }`}
        >
          {isEmpire ? <Sparkles className="h-3 w-3" /> : <Swords className="h-3 w-3" />}
          {isEmpire ? "Empire" : "Duel"}
        </div>
      )}
    </div>
  );
}
