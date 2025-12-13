import { motion, AnimatePresence } from "framer-motion";
import { Lock, LockOpen } from "lucide-react";
import { hapticFeedback } from "@/hooks/useHaptics";
import { useEffect } from "react";

interface LockBreakAnimationProps {
  isUnlocking: boolean;
  onComplete?: () => void;
}

export function LockBreakAnimation({ isUnlocking, onComplete }: LockBreakAnimationProps) {
  useEffect(() => {
    if (isUnlocking) {
      hapticFeedback("success");
      const timer = setTimeout(() => {
        onComplete?.();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isUnlocking, onComplete]);

  return (
    <AnimatePresence>
      {isUnlocking && (
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="absolute inset-0 bg-background/60 backdrop-blur-[2px] rounded-xl z-10 flex items-center justify-center overflow-hidden"
        >
          {/* Lock breaking apart */}
          <motion.div
            initial={{ scale: 1, rotate: 0 }}
            animate={{ 
              scale: [1, 1.3, 1.5, 0],
              rotate: [0, -15, 15, 0],
            }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="relative"
          >
            {/* Main lock that shakes and breaks */}
            <motion.div
              initial={{ opacity: 1 }}
              animate={{ 
                opacity: [1, 1, 0],
                x: [0, -5, 5, -3, 3, 0],
              }}
              transition={{ 
                opacity: { duration: 0.5, delay: 0.2 },
                x: { duration: 0.3, repeat: 2 }
              }}
            >
              <Lock className="w-8 h-8 text-muted-foreground" />
            </motion.div>

            {/* Unlock icon appears */}
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0, 1, 0], scale: [0, 1.2, 1.5] }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <LockOpen className="w-8 h-8 text-primary" />
            </motion.div>
          </motion.div>

          {/* Shatter particles */}
          {[...Array(8)].map((_, i) => (
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
                opacity: 0,
                x: Math.cos((i * Math.PI * 2) / 8) * 80,
                y: Math.sin((i * Math.PI * 2) / 8) * 80,
                scale: 0,
                rotate: Math.random() * 360
              }}
              transition={{ 
                duration: 0.6, 
                delay: 0.2,
                ease: "easeOut" 
              }}
              className="absolute w-2 h-2 bg-primary rounded-sm"
            />
          ))}

          {/* Spark/glow effect */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 2, 3], opacity: [0, 0.8, 0] }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="absolute w-16 h-16 rounded-full bg-primary/30 blur-md"
          />

          {/* Ring burst */}
          <motion.div
            initial={{ scale: 0, opacity: 0.8 }}
            animate={{ scale: 3, opacity: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="absolute w-12 h-12 rounded-full border-2 border-primary"
          />

          {/* Unlocked text */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: [0, 1, 0], y: [20, 0, -10] }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="absolute mt-20 text-sm font-semibold text-primary"
          >
            Unlocked! 🎉
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
