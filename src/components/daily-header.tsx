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
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="glass rounded-2xl p-6 mb-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-sm">{dateStr}</p>
          <h1 className="text-2xl font-bold text-foreground">{dayName}</h1>
          <StreakFlame streak={streak} className="mt-3" />
        </div>
        <ProgressRing progress={progress} size={100} strokeWidth={6} />
      </div>
    </motion.div>
  );
}
