import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { Sparkles, Swords } from "lucide-react";

export type ReelItem = {
  name: string;
  image: string | null;
  value: number;
  rarity: string;
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
  size?: "sm" | "md" | "lg";
  onComplete?: () => void;
  /** Optional pre-spin badge (e.g. EMPIRE/DUEL) shown briefly before spin */
  preBadge?: "empire" | "duel" | null;
};

function ItemCard({ item, size = "md", height }: { item: ReelItem; size?: "sm" | "md" | "lg"; height: number }) {
  const emoji = size === "sm" ? "text-4xl" : size === "lg" ? "text-7xl" : "text-5xl";
  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border-2 bg-gradient-to-b ${
        RARITY_BG[item.rarity] ?? RARITY_BG.common
      } ${RARITY_GLOW[item.rarity] ?? RARITY_GLOW.common}`}
      style={{ height }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(255,255,255,0.18),transparent_60%)]" />
      <div className="flex h-full flex-col items-center justify-center gap-1 p-2">
        <div className={`${emoji} drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]`}>
          {item.image ?? "🎁"}
        </div>
        <div className={`w-full truncate text-center text-[10px] font-bold uppercase tracking-wide ${RARITY_TEXT[item.rarity] ?? "text-slate-200"}`}>
          {item.name}
        </div>
        <div className="inline-flex items-center gap-1 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] font-black text-white/90">
          <MizrahiCoin size={8} /> {formatCoins(item.value)}
        </div>
      </div>
    </div>
  );
}

/**
 * Vertical Empire-Drop / CSGO style rolling reel.
 * Items scroll top → bottom past a center marker, slow down, and land on `result`.
 */
export function CaseReel({
  pool,
  result,
  spinKey,
  durationMs = 5500,
  size = "md",
  onComplete,
  preBadge,
}: Props) {
  const controls = useAnimationControls();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerH, setContainerH] = useState(0);
  const [phase, setPhase] = useState<"idle" | "spinning" | "landed">("idle");
  const [showPreBadge, setShowPreBadge] = useState(false);

  // Tile dimensions
  const tileH = size === "sm" ? 96 : size === "lg" ? 150 : 120;
  const gap = 8;
  const step = tileH + gap;
  const STRIP_LEN = 80;
  const LANDING_INDEX = 65;

  // Build a strip with the planted result at LANDING_INDEX
  const strip = useMemo(() => {
    if (!pool.length) return [] as ReelItem[];
    const arr: ReelItem[] = [];
    for (let i = 0; i < STRIP_LEN; i++) {
      arr.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    if (result) arr[LANDING_INDEX] = result;
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey, pool.length]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerH(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!result || !containerH || !strip.length) {
      setPhase("idle");
      controls.set({ y: 0 });
      return;
    }
    setPhase("spinning");
    setShowPreBadge(!!preBadge);
    const center = containerH / 2;
    const jitter = (Math.random() - 0.5) * (tileH * 0.4);
    const targetCenter = LANDING_INDEX * step + tileH / 2 + jitter;
    const offset = -(targetCenter - center);

    // Brief pre-badge then launch
    const preDelay = preBadge ? 700 : 0;
    const startVal: any = { y: center - tileH / 2 };
    const endVal: any = {
      y: offset,
      transition: { duration: durationMs / 1000, ease: [0.16, 0.84, 0.24, 1] },
    };
    controls.set(startVal);
    const t = setTimeout(() => {
      setShowPreBadge(false);
      controls.start(endVal).then(() => {
        setPhase("landed");
        onComplete?.();
      });
    }, preDelay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey, containerH, strip.length]);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-background via-card/50 to-background"
      style={{ height: tileH * 2 + gap * 2 + 16 }}
    >
      {/* Edge fades top/bottom */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-16 bg-gradient-to-b from-background to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-16 bg-gradient-to-t from-background to-transparent" />

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
        className="absolute inset-x-2 top-0 flex flex-col gap-2"
        style={{ willChange: "transform" }}
      >
        {strip.map((it, i) => (
          <ItemCard key={i} item={it} size={size} height={tileH} />
        ))}
      </motion.div>

      {/* Pre-badge overlay (EMPIRE / DUEL) */}
      {showPreBadge && preBadge && (
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-40 flex items-center justify-center backdrop-blur-sm"
        >
          <div
            className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-4 py-2 text-center font-black uppercase tracking-widest ${
              preBadge === "empire"
                ? "border-amber-400 bg-amber-500/20 text-amber-300 shadow-[0_0_30px_rgba(245,158,11,0.6)]"
                : "border-fuchsia-400 bg-fuchsia-500/20 text-fuchsia-200 shadow-[0_0_30px_rgba(217,70,239,0.6)]"
            }`}
          >
            {preBadge === "empire" ? <Sparkles className="h-5 w-5" /> : <Swords className="h-5 w-5" />}
            <span className="text-sm">{preBadge === "empire" ? "Empire Spin" : "Duel Spin"}</span>
          </div>
        </motion.div>
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

      {/* Persistent special-spin chip */}
      {result?.special_spin && result.special_spin !== "none" && phase === "landed" && (
        <div className="pointer-events-none absolute left-2 top-2 z-40 inline-flex items-center gap-1 rounded-full bg-fuchsia-500/30 px-2 py-0.5 text-[10px] font-black uppercase text-fuchsia-100 backdrop-blur">
          <Sparkles className="h-3 w-3" />
          {result.special_spin === "empire" ? "Empire" : "Duel"}
        </div>
      )}
    </div>
  );
}
