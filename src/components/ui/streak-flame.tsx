import { motion } from "framer-motion";
import { Flame } from "lucide-react";

interface StreakFlameProps {
  streak: number;
  className?: string;
}

export function StreakFlame({ streak, className = "" }: StreakFlameProps) {
  const isActive = streak > 0;

  return (
    <motion.div 
      className={`flex items-center gap-2 ${className}`}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="relative">
        <motion.div
          animate={isActive ? { 
            scale: [1, 1.15, 1],
            rotate: [0, 5, -5, 0]
          } : {}}
          transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
        >
          <Flame 
            className={`w-8 h-8 ${isActive ? 'text-primary drop-shadow-[0_0_12px_hsl(var(--primary))]' : 'text-muted-foreground'}`}
            fill={isActive ? "hsl(var(--primary))" : "none"}
          />
        </motion.div>
        {isActive && (
          <>
            <motion.div
              className="absolute inset-0 blur-md"
              animate={{ opacity: [0.3, 0.7, 0.3], scale: [0.9, 1.1, 0.9] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <Flame className="w-8 h-8 text-primary" fill="hsl(var(--primary))" />
            </motion.div>
            {/* Sparkles */}
            {[...Array(3)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1 bg-primary rounded-full"
                style={{ 
                  top: `${-5 + i * 3}px`, 
                  left: `${10 + i * 5}px` 
                }}
                animate={{
                  y: [0, -15, 0],
                  opacity: [0, 1, 0],
                  scale: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: i * 0.3,
                }}
              />
            ))}
          </>
        )}
      </div>
      <div className="flex flex-col">
        <motion.span 
          className="text-2xl font-bold text-foreground"
          key={streak}
          initial={{ scale: 1.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 20 }}
        >
          {streak}
        </motion.span>
        <span className="text-xs text-muted-foreground -mt-1">day streak</span>
      </div>
    </motion.div>
  );
}
