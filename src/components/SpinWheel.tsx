import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCoins } from "@/hooks/useCoins";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { CoinEarnedPopup } from "@/components/shop/CoinEarnedPopup";

const WHEEL_SEGMENTS = [
  { coins: 5, color: "#4a3728", glowColor: "#f97316" },
  { coins: 15, color: "#5c3d1e", glowColor: "#fb923c" },
  { coins: 10, color: "#4a3728", glowColor: "#f97316" },
  { coins: 25, color: "#6b4423", glowColor: "#fdba74" },
  { coins: 5, color: "#4a3728", glowColor: "#f97316" },
  { coins: 50, color: "#7c4a1a", glowColor: "#fbbf24" },
  { coins: 10, color: "#4a3728", glowColor: "#f97316" },
  { coins: 100, color: "#8b5116", glowColor: "#fcd34d" },
];

const SEGMENT_ANGLE = 360 / WHEEL_SEGMENTS.length;

function getSpinKey(userId: string): string {
  const today = new Date().toISOString().split("T")[0];
  return `spin-${userId}-${today}`;
}

// Floating ember particle
function Ember({ delay }: { delay: number }) {
  return (
    <motion.div
      className="absolute w-1 h-1 rounded-full bg-orange-400"
      initial={{ opacity: 0, y: 0, x: 0, scale: 0 }}
      animate={{
        opacity: [0, 1, 1, 0],
        y: [-5, -20, -35, -50],
        x: [0, Math.random() * 20 - 10, Math.random() * 30 - 15],
        scale: [0, 1, 0.8, 0],
      }}
      transition={{
        duration: 2,
        delay,
        repeat: Infinity,
        repeatDelay: Math.random() * 2,
        ease: "easeOut",
      }}
      style={{
        left: `${30 + Math.random() * 40}%`,
        bottom: "10%",
        boxShadow: "0 0 6px 2px rgba(251, 146, 60, 0.8)",
      }}
    />
  );
}

// Flying coin animation
function FlyingCoin({ onComplete }: { onComplete: () => void }) {
  return (
    <motion.div
      className="fixed z-50 text-2xl"
      initial={{ opacity: 1, scale: 1 }}
      animate={{
        opacity: [1, 1, 0],
        scale: [1, 1.2, 0.5],
        y: [0, -100, -200],
        x: [0, 50, 100],
      }}
      transition={{ duration: 1, ease: "easeOut" }}
      onAnimationComplete={onComplete}
      style={{ top: "50%", left: "50%" }}
    >
      🔥
    </motion.div>
  );
}

export function SpinWheel() {
  const { user } = useAuth();
  const { addCoins } = useCoins();
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [showReward, setShowReward] = useState(false);
  const [rewardAmount, setRewardAmount] = useState(0);
  const [open, setOpen] = useState(false);
  const [showWinEffect, setShowWinEffect] = useState(false);
  const [flyingCoins, setFlyingCoins] = useState<number[]>([]);
  const hasSpunRef = useRef(false);
  const tickIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check if user has spun today (persisted in localStorage)
  const hasSpunToday = user ? localStorage.getItem(getSpinKey(user.id)) === "true" : false;

  // Cleanup tick interval
  useEffect(() => {
    return () => {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    };
  }, []);

  const spin = () => {
    if (isSpinning || hasSpunToday || !user || hasSpunRef.current) return;

    hasSpunRef.current = true;
    setIsSpinning(true);

    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(50);

    // Weighted random - lower coins more likely
    const weights = [25, 15, 20, 10, 25, 3, 15, 2];
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    let selectedIndex = 0;

    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        selectedIndex = i;
        break;
      }
    }

    const segment = WHEEL_SEGMENTS[selectedIndex];

    // Calculate rotation - slower spin with fewer rotations
    const extraSpins = 4 + Math.random() * 1.5;
    const segmentCenter = selectedIndex * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
    const finalRotation = extraSpins * 360 + (360 - segmentCenter + 90);

    setRotation((prev) => prev + finalRotation);

    // Tick sound simulation via haptics
    let tickCount = 0;
    tickIntervalRef.current = setInterval(() => {
      tickCount++;
      if (navigator.vibrate) navigator.vibrate(5);
      if (tickCount > 40) {
        if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      }
    }, 80);

    // After spin completes - longer duration for slower spin
    setTimeout(() => {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      setIsSpinning(false);
      setShowWinEffect(true);

      // Haptic burst for win
      if (navigator.vibrate) navigator.vibrate([50, 30, 100]);

      // Flying coins effect
      setFlyingCoins([1, 2, 3, 4, 5]);

      setTimeout(() => {
        setShowWinEffect(false);
        setRewardAmount(segment.coins);
        setShowReward(true);
        localStorage.setItem(getSpinKey(user.id), "true");
        addCoins({ amount: segment.coins, reason: "daily_bonus" });
      }, 800);
    }, 6000);
  };

  const removeCoin = (id: number) => {
    setFlyingCoins((prev) => prev.filter((c) => c !== id));
  };

  return (
    <>
      {/* Compact Spin Button */}
      <motion.button
        onClick={() => setOpen(true)}
        className="relative flex items-center justify-center"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {/* Outer glow ring */}
        <motion.div
          className="absolute inset-0 rounded-full"
          animate={{
            boxShadow: hasSpunToday
              ? ["0 0 8px 1px rgba(100,100,100,0.3)", "0 0 12px 2px rgba(100,100,100,0.2)"]
              : [
                  "0 0 12px 2px rgba(251, 146, 60, 0.4), 0 0 20px 4px rgba(239, 68, 68, 0.2)",
                  "0 0 18px 4px rgba(251, 146, 60, 0.6), 0 0 30px 8px rgba(239, 68, 68, 0.3)",
                ],
          }}
          transition={{ duration: 2, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
          style={{ borderRadius: "9999px" }}
        />

        {/* Button body - smaller */}
        <motion.div
          className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-xs border ${
            hasSpunToday
              ? "bg-gradient-to-br from-zinc-700 to-zinc-800 border-zinc-600/50 text-zinc-400"
              : "bg-gradient-to-br from-orange-500 via-red-500 to-amber-600 border-orange-400/50 text-white"
          }`}
          animate={hasSpunToday ? {} : { scale: [1, 1.02, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          {/* Wheel icon with spin animation */}
          <motion.span
            className="text-sm"
            animate={hasSpunToday ? {} : { rotate: [0, 360] }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          >
            🎡
          </motion.span>
          <span>{hasSpunToday ? "Done" : "Spin"}</span>
        </motion.div>

        {/* Ready indicator - smaller */}
        {!hasSpunToday && (
          <motion.div
            className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full"
            animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            style={{ boxShadow: "0 0 6px 1px rgba(74, 222, 128, 0.6)" }}
          />
        )}
      </motion.button>

      {/* Spin Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md bg-gradient-to-b from-zinc-900 via-zinc-900 to-black border-orange-500/30 overflow-hidden [&>button[class*='absolute'][class*='right-4']]:hidden">
          {/* Custom Close Button - bigger and more satisfying */}
          <motion.button
            onClick={() => {
              if (navigator.vibrate) navigator.vibrate(10);
              setOpen(false);
            }}
            className="absolute right-3 top-3 z-50 w-10 h-10 rounded-full bg-zinc-800/80 border border-zinc-600/50 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.85 }}
          >
            <X className="w-5 h-5" />
          </motion.button>

          {/* Background flame effect */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <motion.div
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full opacity-20"
              animate={{
                background: [
                  "radial-gradient(circle, rgba(251,146,60,0.4) 0%, transparent 70%)",
                  "radial-gradient(circle, rgba(239,68,68,0.4) 0%, transparent 70%)",
                ],
              }}
              transition={{ duration: 2, repeat: Infinity, repeatType: "reverse" }}
            />
          </div>

          <div className="relative z-10 flex flex-col items-center py-6">
            {/* Title */}
            <motion.h2
              className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-red-400 to-amber-400 mb-6"
              animate={{ textShadow: ["0 0 20px rgba(251,146,60,0.5)", "0 0 40px rgba(251,146,60,0.8)"] }}
              transition={{ duration: 1.5, repeat: Infinity, repeatType: "reverse" }}
            >
              🔥 DAILY SPIN 🔥
            </motion.h2>

            {/* Wheel container */}
            <div className="relative w-72 h-72">
              {/* Outer glow ring */}
              <motion.div
                className="absolute -inset-4 rounded-full"
                animate={{
                  boxShadow: [
                    "0 0 30px 10px rgba(251, 146, 60, 0.3), inset 0 0 30px 10px rgba(251, 146, 60, 0.1)",
                    "0 0 50px 20px rgba(239, 68, 68, 0.4), inset 0 0 40px 15px rgba(239, 68, 68, 0.15)",
                  ],
                }}
                transition={{ duration: 2, repeat: Infinity, repeatType: "reverse" }}
              />

              {/* Pointer */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-30">
                <motion.div
                  animate={isSpinning ? { scale: [1, 1.1, 1] } : {}}
                  transition={{ duration: 0.1, repeat: isSpinning ? Infinity : 0 }}
                >
                  <div
                    className="w-0 h-0 border-l-[14px] border-r-[14px] border-t-[24px] border-l-transparent border-r-transparent border-t-orange-500"
                    style={{
                      filter: "drop-shadow(0 0 8px rgba(251, 146, 60, 0.8))",
                    }}
                  />
                </motion.div>
              </div>

              {/* Wheel shadow */}
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  boxShadow: "0 20px 40px -10px rgba(0,0,0,0.8)",
                }}
              />

              {/* The Wheel */}
              <motion.div
                className="w-full h-full rounded-full overflow-hidden relative"
                style={{
                  background: `conic-gradient(${WHEEL_SEGMENTS.map(
                    (seg, i) => `${seg.color} ${i * SEGMENT_ANGLE}deg ${(i + 1) * SEGMENT_ANGLE}deg`
                  ).join(", ")})`,
                  boxShadow: "inset 0 0 20px 5px rgba(0,0,0,0.5), 0 0 0 4px #8b5116, 0 0 0 8px #4a3728",
                }}
                animate={{ rotate: rotation }}
                transition={{
                  duration: 6,
                  ease: [0.15, 0.85, 0.25, 1],
                }}
              >
                {/* Segment dividers and labels */}
                {WHEEL_SEGMENTS.map((segment, i) => {
                  const angle = i * SEGMENT_ANGLE;
                  const labelAngle = angle + SEGMENT_ANGLE / 2;
                  // Position label at center of segment, halfway between center and edge
                  const labelRadius = 80; // distance from center
                  const labelX = Math.cos((labelAngle - 90) * Math.PI / 180) * labelRadius;
                  const labelY = Math.sin((labelAngle - 90) * Math.PI / 180) * labelRadius;
                  
                  return (
                    <div key={i}>
                      {/* Divider line */}
                      <div
                        className="absolute top-1/2 left-1/2 h-0.5 origin-left"
                        style={{
                          width: "50%",
                          transform: `rotate(${angle}deg)`,
                          background: "linear-gradient(90deg, transparent 0%, rgba(251,146,60,0.3) 50%, rgba(251,146,60,0.6) 100%)",
                        }}
                      />
                      {/* Label - centered in segment */}
                      <div
                        className="absolute flex items-center justify-center"
                        style={{
                          top: "50%",
                          left: "50%",
                          transform: `translate(calc(-50% + ${labelX}px), calc(-50% + ${labelY}px))`,
                        }}
                      >
                        <span
                          className="text-xs font-black text-white flex items-center gap-0.5"
                          style={{
                            textShadow: "0 2px 4px rgba(0,0,0,0.8), 0 0 10px rgba(251,146,60,0.5)",
                          }}
                        >
                          <Flame className="w-3 h-3 text-primary" fill="hsl(var(--primary))" />
                          {segment.coins}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Center hub */}
                <div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full flex items-center justify-center"
                  style={{
                    background: "radial-gradient(circle, #8b5116 0%, #4a3728 100%)",
                    boxShadow: "inset 0 -4px 8px rgba(0,0,0,0.5), 0 0 20px rgba(251,146,60,0.4)",
                  }}
                >
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <Flame className="w-7 h-7 text-primary" fill="hsl(var(--primary))" />
                  </motion.div>
                </div>
              </motion.div>

              {/* Win effect overlay */}
              <AnimatePresence>
                {showWinEffect && (
                  <motion.div
                    className="absolute inset-0 rounded-full pointer-events-none"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: [0, 1, 0], scale: [0.8, 1.3, 1.5] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8 }}
                    style={{
                      background: "radial-gradient(circle, rgba(251,146,60,0.6) 0%, transparent 70%)",
                    }}
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Spin button */}
            <div className="mt-8">
              {hasSpunToday ? (
                <motion.div
                  className="text-center"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <p className="text-orange-300/60 text-sm font-medium">Come back tomorrow</p>
                  <motion.p
                    className="text-xs text-orange-400/40 mt-1"
                    animate={{ opacity: [0.4, 0.7, 0.4] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    🌅 Resets at midnight
                  </motion.p>
                </motion.div>
              ) : (
                <motion.button
                  onClick={spin}
                  disabled={isSpinning}
                  className="relative px-10 py-4 rounded-full font-black text-lg text-white overflow-hidden disabled:cursor-not-allowed"
                  whileHover={isSpinning ? {} : { scale: 1.05 }}
                  whileTap={isSpinning ? {} : { scale: 0.95 }}
                  style={{
                    background: isSpinning
                      ? "linear-gradient(135deg, #6b7280 0%, #4b5563 100%)"
                      : "linear-gradient(135deg, #f97316 0%, #ef4444 50%, #f59e0b 100%)",
                    boxShadow: isSpinning
                      ? "0 4px 20px rgba(0,0,0,0.3)"
                      : "0 4px 30px rgba(251, 146, 60, 0.5), inset 0 1px 0 rgba(255,255,255,0.2)",
                  }}
                >
                  {/* Shine effect */}
                  {!isSpinning && (
                    <motion.div
                      className="absolute inset-0 opacity-30"
                      animate={{
                        background: [
                          "linear-gradient(90deg, transparent 0%, white 50%, transparent 100%)",
                          "linear-gradient(90deg, transparent 0%, white 50%, transparent 100%)",
                        ],
                        x: ["-100%", "200%"],
                      }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                    />
                  )}
                  <span className="relative z-10">
                    {isSpinning ? "🔥 SPINNING..." : "🎰 SPIN NOW!"}
                  </span>
                </motion.button>
              )}
            </div>
          </div>

          {/* Flying coins */}
          {flyingCoins.map((id) => (
            <FlyingCoin key={id} onComplete={() => removeCoin(id)} />
          ))}
        </DialogContent>
      </Dialog>

      <CoinEarnedPopup
        show={showReward}
        amount={rewardAmount}
        reason="Daily Spin"
        onComplete={() => setShowReward(false)}
      />
    </>
  );
}
