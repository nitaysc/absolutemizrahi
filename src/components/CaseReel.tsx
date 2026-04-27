import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { Sparkles } from "lucide-react";

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
  common: "from-slate-600/30 to-slate-900/60 border-slate-500/40",
  uncommon: "from-emerald-500/30 to-emerald-900/60 border-emerald-400/50",
  rare: "from-sky-500/30 to-blue-900/60 border-sky-400/60",
  epic: "from-fuchsia-500/30 to-purple-900/70 border-fuchsia-400/70",
  legendary: "from-amber-400/40 to-orange-900/70 border-amber-300/80",
  mythic: "from-rose-500/40 to-pink-900/70 border-rose-300/90",
};

const RARITY_GLOW: Record<string, string> = {
  common: "shadow-[0_0_20px_rgba(100,116,139,0.35)]",
  uncommon: "shadow-[0_0_24px_rgba(16,185,129,0.45)]",
  rare: "shadow-[0_0_28px_rgba(56,189,248,0.55)]",
  epic: "shadow-[0_0_34px_rgba(217,70,239,0.65)]",
  legendary: "shadow-[0_0_40px_rgba(245,158,11,0.75)]",
  mythic: "shadow-[0_0_50px_rgba(244,63,94,0.85)]",
};

type Props = {
  pool: ReelItem[];          // pool of items used to populate strip (e.g. case_items)
  result: ReelResult | null; // final landing item (null = idle / waiting)
  spinKey: string | number;  // change this to trigger a fresh spin
  durationMs?: number;       // total spin duration
  orientation?: "horizontal" | "vertical";
  size?: "sm" | "md" | "lg";
  onComplete?: () => void;
};

function ItemCard({ item, size = "md" }: { item: ReelItem; size?: "sm" | "md" | "lg" }) {
  const px = size === "sm" ? 96 : size === "lg" ? 160 : 128;
  const emoji = size === "sm" ? "text-3xl" : size === "lg" ? "text-6xl" : "text-5xl";
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-xl border-2 bg-gradient-to-b ${
        RARITY_BG[item.rarity] ?? RARITY_BG.common
      } ${RARITY_GLOW[item.rarity] ?? RARITY_GLOW.common}`}
      style={{ width: px, height: px }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.18),transparent_60%)]" />
      <div className="flex h-full flex-col items-center justify-center gap-1 p-2">
        <div className={`${emoji} drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]`}>
          {item.image ?? "🎁"}
        </div>
        <div className="w-full truncate text-center text-[10px] font-bold uppercase tracking-wide opacity-90">
          {item.name}
        </div>
        <div className="inline-flex items-center gap-1 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] font-black">
          <MizrahiCoin size={8} /> {formatCoins(item.value)}
        </div>
      </div>
    </div>
  );
}

/**
 * Empire Drop / CSGO style rolling reel.
 * Builds a long strip of items then animates it past a center ticker, landing on `result`.
 */
export function CaseReel({
  pool,
  result,
  spinKey,
  durationMs = 5500,
  orientation = "horizontal",
  size = "md",
  onComplete,
}: Props) {
  const controls = useAnimationControls();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState(0);
  const [phase, setPhase] = useState<"idle" | "spinning" | "landed">("idle");

  const itemPx = size === "sm" ? 96 : size === "lg" ? 160 : 128;
  const gap = 8;
  const step = itemPx + gap;
  const STRIP_LEN = 60; // items in the strip
  const LANDING_INDEX = 50; // where the result will sit

  // Build a deterministic strip using the pool + planted result
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

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setContainerSize(orientation === "horizontal" ? el.clientWidth : el.clientHeight);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [orientation]);

  // Run spin when result + key change
  useEffect(() => {
    if (!result || !containerSize || !strip.length) {
      setPhase("idle");
      controls.set(orientation === "horizontal" ? { x: 0 } : { y: 0 });
      return;
    }
    setPhase("spinning");
    // Center of container
    const center = containerSize / 2;
    // Target offset so item LANDING_INDEX lands at center, with small random jitter
    const jitter = (Math.random() - 0.5) * (itemPx * 0.5);
    const targetCenter = LANDING_INDEX * step + itemPx / 2 + jitter;
    const offset = -(targetCenter - center);
    const axis = orientation === "horizontal" ? "x" : "y";

    const startVal: any = { [axis]: orientation === "horizontal" ? containerSize / 2 - itemPx / 2 : 0 };
    const endVal: any = {
      [axis]: offset,
      transition: { duration: durationMs / 1000, ease: [0.16, 0.84, 0.24, 1] },
    };
    controls.set(startVal);
    controls.start(endVal).then(() => {
      setPhase("landed");
      onComplete?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey, containerSize, strip.length]);

  const isHorizontal = orientation === "horizontal";

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-background via-card to-background ${
        isHorizontal ? "w-full" : "h-full w-full"
      }`}
      style={isHorizontal ? { height: itemPx + 32 } : { width: itemPx + 32 }}
    >
      {/* Edge fades */}
      <div
        className={`pointer-events-none absolute z-20 ${
          isHorizontal ? "inset-y-0 left-0 w-16 bg-gradient-to-r" : "inset-x-0 top-0 h-16 bg-gradient-to-b"
        } from-background to-transparent`}
      />
      <div
        className={`pointer-events-none absolute z-20 ${
          isHorizontal ? "inset-y-0 right-0 w-16 bg-gradient-to-l" : "inset-x-0 bottom-0 h-16 bg-gradient-to-t"
        } from-background to-transparent`}
      />

      {/* Center ticker line */}
      <div
        className={`pointer-events-none absolute z-30 ${
          isHorizontal
            ? "left-1/2 top-0 h-full w-[3px] -translate-x-1/2"
            : "left-0 top-1/2 h-[3px] w-full -translate-y-1/2"
        } bg-primary shadow-[0_0_12px_hsl(var(--primary))]`}
      />
      {/* Ticker triangles */}
      {isHorizontal ? (
        <>
          <div className="pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2">
            <div className="h-0 w-0 border-l-[7px] border-r-[7px] border-t-[10px] border-l-transparent border-r-transparent border-t-primary" />
          </div>
          <div className="pointer-events-none absolute bottom-0 left-1/2 z-30 -translate-x-1/2">
            <div className="h-0 w-0 border-b-[10px] border-l-[7px] border-r-[7px] border-b-primary border-l-transparent border-r-transparent" />
          </div>
        </>
      ) : null}

      {/* Strip */}
      <motion.div
        animate={controls}
        className={`absolute ${isHorizontal ? "top-1/2 left-0 -translate-y-1/2 flex flex-row" : "left-1/2 top-0 -translate-x-1/2 flex flex-col"} gap-2 p-4`}
      >
        {strip.map((it, i) => (
          <ItemCard key={i} item={it} size={size} />
        ))}
      </motion.div>

      {/* Special spin badge */}
      {result?.special_spin && result.special_spin !== "none" && phase !== "idle" && (
        <div className="pointer-events-none absolute left-2 top-2 z-40 inline-flex items-center gap-1 rounded-full bg-fuchsia-500/30 px-2 py-0.5 text-[10px] font-black uppercase text-fuchsia-100 backdrop-blur">
          <Sparkles className="h-3 w-3" />
          {result.special_spin === "empire" ? "Empire Spin" : "Duel Spin"}
        </div>
      )}
    </div>
  );
}

export const RARITY_TOKENS = { RARITY_BG, RARITY_GLOW };
