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
          animate={isActive ? { scale: [1, 1.1, 1] } : {}}
          transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <Flame 
            className={`w-8 h-8 ${isActive ? 'text-primary drop-shadow-[0_0_8px_hsl(var(--primary))]' : 'text-muted-foreground'}`}
            fill={isActive ? "hsl(var(--primary))" : "none"}
          />
        </motion.div>
        {isActive && (
          <motion.div
            className="absolute inset-0 blur-md"
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <Flame className="w-8 h-8 text-primary" fill="hsl(var(--primary))" />
          </motion.div>
        )}
      </div>
      <div className="flex flex-col">
        <span className="text-2xl font-bold text-foreground">{streak}</span>
        <span className="text-xs text-muted-foreground -mt-1">day streak</span>
      </div>
    </motion.div>
  );
}
