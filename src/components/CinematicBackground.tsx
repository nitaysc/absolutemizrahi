import { motion } from "framer-motion";

/**
 * Premium cinematic background:
 *  - Slow-drifting aurora orbs (CSS gradients animated by framer)
 *  - Faint vertical scanline / grid texture
 *  - Soft vignette top + bottom
 *
 * Sits behind app content via `fixed inset-0 -z-10`. Pure visual; no logic.
 */
export function CinematicBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Base wash */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 700px at 50% -10%, hsl(25 95% 53% / 0.18), transparent 60%), radial-gradient(900px 500px at 90% 110%, hsl(280 75% 55% / 0.10), transparent 60%), var(--gradient-dark)",
        }}
      />

      {/* Aurora orb A */}
      <motion.div
        className="absolute -left-32 top-[-10%] h-[55vmax] w-[55vmax] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, hsl(25 95% 53% / 0.35), transparent 70%)",
        }}
        animate={{ x: [0, 60, -40, 0], y: [0, 40, -20, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Aurora orb B */}
      <motion.div
        className="absolute -right-32 bottom-[-15%] h-[60vmax] w-[60vmax] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, hsl(280 80% 55% / 0.28), transparent 70%)",
        }}
        animate={{ x: [0, -50, 30, 0], y: [0, -30, 25, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Aurora orb C (subtle accent) */}
      <motion.div
        className="absolute left-[40%] top-[35%] h-[40vmax] w-[40vmax] -translate-x-1/2 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, hsl(190 90% 55% / 0.18), transparent 70%)",
        }}
        animate={{ x: [0, 40, -30, 0], y: [0, -25, 20, 0] }}
        transition={{ duration: 34, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Grid texture */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--foreground) / 0.6) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground) / 0.6) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:
            "radial-gradient(ellipse at 50% 30%, black 30%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at 50% 30%, black 30%, transparent 75%)",
        }}
      />

      {/* Top + bottom vignette */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-background/80 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background/80 to-transparent" />
    </div>
  );
}