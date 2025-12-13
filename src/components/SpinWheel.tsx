import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useCoins } from "@/hooks/useCoins";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CoinEarnedPopup } from "@/components/shop/CoinEarnedPopup";

const WHEEL_SEGMENTS = [
  { coins: 5, label: "5", color: "hsl(var(--muted))" },
  { coins: 15, label: "15", color: "hsl(var(--primary) / 0.3)" },
  { coins: 10, label: "10", color: "hsl(var(--muted))" },
  { coins: 25, label: "25", color: "hsl(var(--primary) / 0.5)" },
  { coins: 5, label: "5", color: "hsl(var(--muted))" },
  { coins: 50, label: "50", color: "hsl(var(--primary) / 0.7)" },
  { coins: 10, label: "10", color: "hsl(var(--muted))" },
  { coins: 100, label: "100", color: "hsl(var(--primary))" },
];

const SEGMENT_ANGLE = 360 / WHEEL_SEGMENTS.length;

function getSpinKey(userId: string): string {
  const today = new Date().toISOString().split("T")[0];
  return `spin-${userId}-${today}`;
}

export function SpinWheel() {
  const { user } = useAuth();
  const { addCoins } = useCoins();
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [showReward, setShowReward] = useState(false);
  const [rewardAmount, setRewardAmount] = useState(0);
  const [open, setOpen] = useState(false);
  const hasSpunRef = useRef(false);

  const hasSpunToday = user ? localStorage.getItem(getSpinKey(user.id)) === "true" : false;

  const spin = () => {
    if (isSpinning || hasSpunToday || !user || hasSpunRef.current) return;
    
    hasSpunRef.current = true;
    setIsSpinning(true);

    // Weighted random - lower coins more likely
    const weights = [25, 15, 20, 10, 25, 3, 15, 2]; // Roughly matches segment order
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
    
    // Calculate rotation to land on selected segment
    // Add extra rotations for effect (5-8 full spins)
    const extraSpins = 5 + Math.random() * 3;
    const segmentCenter = selectedIndex * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
    // Wheel needs to stop with pointer at top, so we offset
    const finalRotation = extraSpins * 360 + (360 - segmentCenter + 90);
    
    setRotation(prev => prev + finalRotation);

    // After spin completes
    setTimeout(() => {
      setIsSpinning(false);
      setRewardAmount(segment.coins);
      setShowReward(true);
      
      // Mark as spun
      localStorage.setItem(getSpinKey(user.id), "true");
      
      // Award coins
      addCoins({ amount: segment.coins, reason: "daily_bonus" });
    }, 4000);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="relative flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500/20 to-primary/20 border border-primary/30 text-sm font-medium"
          >
            <motion.span
              animate={{ rotate: hasSpunToday ? 0 : [0, 10, -10, 0] }}
              transition={{ repeat: hasSpunToday ? 0 : Infinity, duration: 1.5, repeatDelay: 2 }}
            >
              🎡
            </motion.span>
            <span>Daily Spin</span>
            {!hasSpunToday && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            )}
          </motion.button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">Daily Spin 🎡</DialogTitle>
          </DialogHeader>
          
          <div className="flex flex-col items-center py-4">
            {/* Wheel container */}
            <div className="relative w-64 h-64">
              {/* Pointer */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-20">
                <div className="w-0 h-0 border-l-[12px] border-r-[12px] border-t-[20px] border-l-transparent border-r-transparent border-t-primary drop-shadow-lg" />
              </div>
              
              {/* Wheel */}
              <motion.div
                className="w-full h-full rounded-full border-4 border-primary/50 overflow-hidden shadow-xl"
                style={{ 
                  background: `conic-gradient(${WHEEL_SEGMENTS.map((seg, i) => 
                    `${seg.color} ${i * SEGMENT_ANGLE}deg ${(i + 1) * SEGMENT_ANGLE}deg`
                  ).join(", ")})`
                }}
                animate={{ rotate: rotation }}
                transition={{ duration: 4, ease: [0.2, 0.8, 0.2, 1] }}
              >
                {/* Segment labels */}
                {WHEEL_SEGMENTS.map((segment, i) => {
                  const angle = i * SEGMENT_ANGLE + SEGMENT_ANGLE / 2 - 90;
                  return (
                    <div
                      key={i}
                      className="absolute top-1/2 left-1/2 origin-left"
                      style={{
                        transform: `rotate(${angle}deg) translateX(30px)`,
                        width: "100px",
                      }}
                    >
                      <span className="text-xs font-bold text-foreground drop-shadow-md">
                        {segment.label} 🔥
                      </span>
                    </div>
                  );
                })}
                
                {/* Center circle */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-background border-2 border-primary flex items-center justify-center">
                  <span className="text-lg">🔥</span>
                </div>
              </motion.div>
            </div>

            {/* Spin button */}
            <div className="mt-6">
              {hasSpunToday ? (
                <div className="text-center">
                  <p className="text-muted-foreground text-sm">You've spun today!</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Come back tomorrow 🌅</p>
                </div>
              ) : (
                <Button
                  onClick={spin}
                  disabled={isSpinning}
                  size="lg"
                  className="bg-gradient-to-r from-amber-500 to-primary hover:from-amber-600 hover:to-primary/90 text-white font-bold px-8"
                >
                  {isSpinning ? "Spinning..." : "SPIN! 🎰"}
                </Button>
              )}
            </div>
          </div>
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
