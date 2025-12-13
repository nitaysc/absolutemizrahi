import { motion, AnimatePresence } from "framer-motion";
import { Lock, LockOpen } from "lucide-react";
import { hapticFeedback } from "@/hooks/useHaptics";
import { soundEffects } from "@/hooks/useSoundEffects";
import { useEffect } from "react";

interface LockBreakAnimationProps {
  isUnlocking: boolean;
  onComplete?: () => void;
}

export function LockBreakAnimation({ isUnlocking, onComplete }: LockBreakAnimationProps) {
  useEffect(() => {
    if (isUnlocking) {
      hapticFeedback("success");
      soundEffects.playLockBreak();
      const timer = setTimeout(() => {
        onComplete?.();
      }, 2000); // Slower - 2 seconds total
      return () => clearTimeout(timer);
    }
  }, [isUnlocking, onComplete]);

  return (
    <AnimatePresence>
      {isUnlocking && (
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.5, delay: 1 }} // Slower fade out
          className="absolute inset-0 bg-background/60 backdrop-blur-[2px] rounded-xl z-10 flex items-center justify-center overflow-hidden"
        >
          {/* Lock breaking apart */}
          <motion.div
            initial={{ scale: 1, rotate: 0 }}
            animate={{ 
              scale: [1, 1.2, 1.4, 1.6, 0],
              rotate: [0, -10, 10, -15, 15, 0],
            }}
            transition={{ duration: 1.2, ease: "easeOut" }} // Slower shake
            className="relative"
          >
            {/* Main lock that shakes and breaks */}
            <motion.div
              initial={{ opacity: 1 }}
              animate={{ 
                opacity: [1, 1, 1, 0],
                x: [0, -8, 8, -6, 6, -4, 4, 0],
              }}
              transition={{ 
                opacity: { duration: 0.8, delay: 0.4 },
                x: { duration: 0.6, repeat: 2 }
              }}
            >
              <Lock className="w-10 h-10 text-muted-foreground" />
            </motion.div>

            {/* Unlock icon appears */}
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0, 1, 1, 0], scale: [0, 1, 1.3, 1.8] }}
              transition={{ duration: 1, delay: 0.5 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <LockOpen className="w-10 h-10 text-primary" />
            </motion.div>
          </motion.div>

          {/* Shatter particles - more particles, slower */}
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ 
                opacity: 1, 
                x: 0, 
                y: 0,
                scale: 1,
                rotate: 0
              }}
              animate={{ 
                opacity: [1, 1, 0],
                x: Math.cos((i * Math.PI * 2) / 12) * 120,
                y: Math.sin((i * Math.PI * 2) / 12) * 120,
                scale: [1, 1.2, 0],
                rotate: Math.random() * 540
              }}
              transition={{ 
                duration: 1.2, 
                delay: 0.4,
                ease: "easeOut" 
              }}
              className="absolute w-2.5 h-2.5 bg-primary rounded-sm"
            />
          ))}

          {/* Secondary particles ring */}
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={`secondary-${i}`}
              initial={{ 
                opacity: 0.8, 
                x: 0, 
                y: 0,
                scale: 0.5,
              }}
              animate={{ 
                opacity: 0,
                x: Math.cos((i * Math.PI * 2) / 8 + 0.4) * 80,
                y: Math.sin((i * Math.PI * 2) / 8 + 0.4) * 80,
                scale: 0,
              }}
              transition={{ 
                duration: 1, 
                delay: 0.5,
                ease: "easeOut" 
              }}
              className="absolute w-1.5 h-1.5 bg-primary/70 rounded-full"
            />
          ))}

          {/* Spark/glow effect - bigger and slower */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 2.5, 4], opacity: [0, 0.9, 0] }}
            transition={{ duration: 1, delay: 0.4 }}
            className="absolute w-20 h-20 rounded-full bg-primary/40 blur-lg"
          />

          {/* Ring burst - multiple rings */}
          <motion.div
            initial={{ scale: 0, opacity: 0.9 }}
            animate={{ scale: 4, opacity: 0 }}
            transition={{ duration: 1.2, delay: 0.45 }}
            className="absolute w-14 h-14 rounded-full border-2 border-primary"
          />
          <motion.div
            initial={{ scale: 0, opacity: 0.7 }}
            animate={{ scale: 3, opacity: 0 }}
            transition={{ duration: 1, delay: 0.55 }}
            className="absolute w-14 h-14 rounded-full border border-primary/50"
          />

          {/* Unlocked text - slower */}
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.8 }}
            animate={{ opacity: [0, 1, 1, 0], y: [30, 0, 0, -15], scale: [0.8, 1, 1, 1.1] }}
            transition={{ duration: 1.4, delay: 0.5 }}
            className="absolute mt-24 text-base font-bold text-primary"
          >
            Unlocked! 🎉
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}