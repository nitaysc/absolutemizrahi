import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Global big-win overlay. Listens for `window` "bigwin" CustomEvent with
 * `detail: { multiplier?: number; label?: string }`. Renders a fast confetti
 * burst + screen flash. Any game can trigger it without prop drilling:
 *
 *   window.dispatchEvent(new CustomEvent("bigwin", { detail: { multiplier: 25 } }));
 */

type Burst = {
  id: number;
  multiplier?: number;
  label?: string;
  particles: { dx: number; dy: number; rot: number; hue: number; delay: number }[];
};

let _id = 0;

function makeParticles(intensity: number) {
  const count = Math.min(80, 24 + Math.floor(intensity * 6));
  return Array.from({ length: count }, () => ({
    dx: (Math.random() - 0.5) * (220 + intensity * 14),
    dy: -120 - Math.random() * 220 - intensity * 6,
    rot: (Math.random() - 0.5) * 540,
    hue: Math.floor(Math.random() * 360),
    delay: Math.random() * 0.08,
  }));
}

export function WinBurst() {
  const [bursts, setBursts] = useState<Burst[]>([]);

  useEffect(() => {
    function onBurst(e: Event) {
      const detail = (e as CustomEvent<{ multiplier?: number; label?: string }>).detail ?? {};
      const mult = detail.multiplier ?? 1;
      const intensity = Math.max(1, Math.min(10, Math.log2(Math.max(2, mult))));
      const burst: Burst = {
        id: ++_id,
        multiplier: detail.multiplier,
        label: detail.label,
        particles: makeParticles(intensity),
      };
      setBursts((b) => [...b, burst]);
      // Auto-cleanup after animation completes
      setTimeout(() => {
        setBursts((b) => b.filter((x) => x.id !== burst.id));
      }, 1800);
    }
    window.addEventListener("bigwin", onBurst);
    return () => window.removeEventListener("bigwin", onBurst);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[80] overflow-hidden">
      <AnimatePresence>
        {bursts.map((b) => (
          <motion.div
            key={b.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
          >
            {/* Screen flash */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.35, 0] }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="absolute inset-0 bg-gradient-radial from-primary/40 via-primary/10 to-transparent"
              style={{
                background:
                  "radial-gradient(circle at 50% 50%, hsl(var(--primary)/0.45), hsl(var(--primary)/0.05) 45%, transparent 70%)",
              }}
            />
            {/* Big multiplier label */}
            {b.multiplier && b.multiplier >= 5 && (
              <motion.div
                initial={{ scale: 0.4, opacity: 0, y: 30 }}
                animate={{ scale: [0.4, 1.15, 1], opacity: [0, 1, 1, 0], y: [30, 0, 0, -20] }}
                transition={{ duration: 1.6, times: [0, 0.25, 0.7, 1] }}
                className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 text-center"
              >
                <p className="text-[12px] font-bold uppercase tracking-[0.4em] text-primary">
                  {b.label ?? "Big win"}
                </p>
                <p className="text-6xl font-black text-primary drop-shadow-[0_0_30px_hsl(var(--primary)/0.8)] sm:text-7xl">
                  {b.multiplier.toFixed(2)}×
                </p>
              </motion.div>
            )}
            {/* Confetti particles, launched from screen center */}
            <div className="absolute left-1/2 top-1/2">
              {b.particles.map((p, i) => (
                <motion.span
                  key={i}
                  initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
                  animate={{
                    x: p.dx,
                    y: [0, p.dy, p.dy + 600],
                    opacity: [1, 1, 0],
                    rotate: p.rot,
                    scale: [1, 1, 0.6],
                  }}
                  transition={{
                    duration: 1.5,
                    delay: p.delay,
                    times: [0, 0.45, 1],
                    ease: "easeOut",
                  }}
                  className="absolute h-2 w-3 rounded-sm"
                  style={{
                    background: `hsl(${p.hue} 90% 60%)`,
                    boxShadow: `0 0 10px hsl(${p.hue} 90% 60% / 0.7)`,
                  }}
                />
              ))}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Helper for game pages — fires a win burst with optional sound coupling. */
export function triggerBigWin(multiplier: number, label?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("bigwin", { detail: { multiplier, label } }));
}