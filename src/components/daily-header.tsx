import { motion } from "framer-motion";
import { ProgressRing } from "@/components/ui/progress-ring";
import { StreakFlame } from "@/components/ui/streak-flame";

interface DailyHeaderProps {
  streak: number;
  progress: number;
  date: Date;
}

export function DailyHeader({ streak, progress, date }: DailyHeaderProps) {
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <motion.div
      initial={{ opacity: 0, y: -30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ 
        duration: 0.5, 
        type: "spring",
        stiffness: 300,
        damping: 25
      }}
      className="glass rounded-2xl p-6 mb-6 relative overflow-hidden"
    >
      {/* Animated background gradient */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 opacity-50"
        animate={{ 
          backgroundPosition: ["0% 0%", "100% 100%"],
        }}
        transition={{ duration: 10, repeat: Infinity, repeatType: "reverse" }}
      />
      
      <div className="relative flex items-center justify-between">
        <div>
          <motion.p 
            className="text-muted-foreground text-sm"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            {dateStr}
          </motion.p>
          <motion.h1 
            className="text-2xl font-bold text-foreground"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            {dayName}
          </motion.h1>
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, type: "spring", stiffness: 400 }}
          >
            <StreakFlame streak={streak} className="mt-3" />
          </motion.div>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.5, rotate: -180 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 15 }}
        >
          <ProgressRing progress={progress} size={100} strokeWidth={6} />
        </motion.div>
      </div>
    </motion.div>
  );
}
