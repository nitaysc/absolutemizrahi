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

  return (
    <div className="relative mx-auto w-full max-w-[760px] overflow-hidden rounded-2xl border border-border bg-[#071a2f] sm:rounded-3xl">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent_40%)]" />
      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/10" />

      <div className="relative h-[190px] p-3 sm:h-[220px] sm:p-4">
        <div className="absolute left-3 top-3 z-20 rounded-xl border border-primary/40 bg-background/70 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-primary backdrop-blur-md sm:left-4 sm:top-4">
          {active && !dead && step > 0
            ? `${(multipliers[step - 1] ?? 1).toFixed(2)}×`
            : "READY"}
        </div>

        <div className="absolute left-3 top-14 z-20 rounded-lg bg-black/25 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/80 sm:left-4 sm:top-16">
          2D Mode
        </div>

        <div className="absolute bottom-4 left-2 right-2 overflow-x-auto [scrollbar-width:thin] sm:left-4 sm:right-4">
          <div className="flex min-w-max items-end gap-1.5 pb-2">
            {Array.from({ length: totalLanes }).map((_, i) => {
              const laneState = lanes[i] ?? "hidden";
              const isCurrent = active && !dead && i === step;
              const wasHit = dead && deathLane === i;
              const wouldDie = !!cashedOut && nextDeathLane === i;

              return (
                <div
                  key={i}
                  className={`relative h-20 w-16 shrink-0 overflow-hidden rounded-xl border px-1.5 pt-1.5 text-center transition sm:h-24 sm:w-20 ${
                    laneState === "death"
                      ? "border-destructive/70 bg-destructive/20"
                      : laneState === "safe"
                        ? "border-[hsl(var(--success))/0.7] bg-[hsl(var(--success))/0.14]"
                        : "border-white/10 bg-white/5"
                  } ${isCurrent ? "ring-2 ring-primary/80" : ""}`}
                >
                  <div className="text-[10px] font-black tabular-nums text-white/90 sm:text-xs">
                    {(multipliers[i] ?? 1).toFixed(2)}×
                  </div>
                  <div className="mt-1.5 text-xl leading-none sm:mt-2.5 sm:text-2xl">
                    {laneState === "death" ? "🚗" : laneState === "safe" ? "✅" : "🕳️"}
                  </div>

                  {wouldDie && laneState !== "death" && (
                    <div className="mt-2 inline-flex animate-pulse rounded-full bg-destructive/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                      Close Call
                    </div>
                  )}

                  {wasHit && (
                    <div className="absolute inset-x-0 bottom-1 text-[10px] font-bold text-destructive-foreground/90">
                      SPLAT
                    </div>
                  )}

                  {isCurrent && (
                    <div className="absolute inset-x-2 bottom-1 h-1 rounded-full bg-primary/80" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div
          className="absolute bottom-[102px] z-30 text-2xl transition-all duration-300 sm:bottom-[122px] sm:text-3xl"
          style={{ left: `calc(0.5rem + ${chickenLane * 4.5}rem)` }}
        >
          {dead ? "💥🐔" : "🐔"}
        </div>
      </div>
    </div>
  );
}
