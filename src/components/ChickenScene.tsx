import { useMemo } from "react";

export type LaneState = "hidden" | "safe" | "death";

interface Props {
  totalLanes: number;
  step: number;
  lanes: LaneState[];
  multipliers: number[];
  dead: boolean;
  active: boolean;
  deathLane?: number | null;
  cashedOut?: boolean;
  nextDeathLane?: number | null;
}

const LANE_HEIGHT = 56;
const CHICKEN_ANCHOR_Y = 280;

export function ChickenScene({
  totalLanes,
  step,
  lanes,
  multipliers,
  dead,
  active,
  deathLane,
  cashedOut,
  nextDeathLane,
}: Props) {
  const chickenLane = Math.max(0, Math.min(step, totalLanes - 1));

  const laneTraffic = useMemo(
    () =>
      Array.from({ length: totalLanes }, (_, i) => ({
        duration: 2.2 + ((i * 37) % 110) / 50,
        delay: -((i * 23) % 100) / 35,
        direction: i % 2 === 0 ? "left" : "right",
      })),
    [totalLanes],
  );

  return (
    <div className="relative mx-auto w-full max-w-[760px] touch-none overflow-hidden rounded-2xl border border-border bg-[#040f1e] shadow-[0_20px_60px_rgba(0,0,0,0.45)] sm:rounded-3xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(56,189,248,0.16),transparent_45%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-black/45 to-transparent" />

      <div className="relative h-[380px] overflow-hidden sm:h-[430px]">
        <div className="absolute left-3 top-3 z-30 rounded-xl border border-primary/40 bg-background/70 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-primary backdrop-blur-md sm:left-4 sm:top-4">
          {active && !dead && step > 0 ? `${(multipliers[step - 1] ?? 1).toFixed(2)}×` : "READY"}
        </div>

        <div className="absolute right-3 top-3 z-30 rounded-lg bg-black/35 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/80 sm:right-4 sm:top-4">
          Chicken Run
        </div>

        <div
          className="absolute inset-0 transition-transform duration-500 ease-out"
          style={{ transform: `translateY(${CHICKEN_ANCHOR_Y - chickenLane * LANE_HEIGHT}px)` }}
        >
          {Array.from({ length: totalLanes }).map((_, i) => {
            const laneState = lanes[i] ?? "hidden";
            const wasHit = dead && deathLane === i;
            const isCurrent = active && !dead && i === step;
            const wouldDie = !!cashedOut && nextDeathLane === i;
            const carVisible = laneState === "death" || (laneState === "hidden" && active);
            const traffic = laneTraffic[i];

            return (
              <div
                key={i}
                className="absolute inset-x-0 border-y border-white/5"
                style={{ top: i * LANE_HEIGHT, height: LANE_HEIGHT }}
              >
                <div className="absolute inset-0 bg-[#0b1e34]" />
                <div className="absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[#1f7a3d] to-transparent opacity-45" />
                <div className="absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#1f7a3d] to-transparent opacity-45" />

                <div className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.6)_0_22px,transparent_22px_42px)] opacity-45" />

                {carVisible && (
                  <div
                    className={`absolute top-1/2 z-20 h-7 w-12 -translate-y-1/2 rounded-md border border-white/30 bg-gradient-to-b from-rose-400 to-rose-600 shadow-[0_0_20px_rgba(251,113,133,0.5)] ${
                      traffic.direction === "left"
                        ? "animate-[chicken-car-left_linear_infinite]"
                        : "animate-[chicken-car-right_linear_infinite]"
                    }`}
                    style={{ animationDuration: `${traffic.duration}s`, animationDelay: `${traffic.delay}s` }}
                  >
                    <div className="absolute -left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-yellow-100/90" />
                    <div className="absolute -right-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-red-200/90" />
                  </div>
                )}

                <div className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded bg-black/35 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-white/85">
                  {(multipliers[i] ?? 1).toFixed(2)}×
                </div>

                {isCurrent && <div className="absolute inset-0 z-10 ring-2 ring-primary/70" />}
                {wouldDie && (
                  <div className="absolute left-3 top-1/2 z-20 -translate-y-1/2 animate-pulse rounded-full bg-destructive/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                    close call
                  </div>
                )}
                {wasHit && (
                  <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-md bg-destructive/90 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-white">
                    splat
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div
          className="pointer-events-none absolute left-1/2 z-40 -translate-x-1/2 text-4xl drop-shadow-[0_0_14px_rgba(250,204,21,0.45)] transition-all duration-300"
          style={{ bottom: 66 }}
        >
          {dead ? "💥🐔" : "🐔"}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/65 to-transparent" />
      </div>
    </div>
  );
}
