import { motion } from "framer-motion";
import { ProgressRing } from "@/components/ui/progress-ring";
import { StreakFlame } from "@/components/ui/streak-flame";

interface DailyHeaderProps {
  streak: number;
  progress: number;
  date: Date;
  displayName?: string | null;
}

function getGreeting(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
}

export function DailyHeader({ streak, progress, date, displayName }: DailyHeaderProps) {
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const timeStr = formatTime(date);
  const hour = date.getHours();
  const greeting = getGreeting(hour);
  const name = displayName || '';

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
        <div className="flex-1 min-w-0">
          {/* Greeting */}
          <motion.p 
            className="text-lg font-medium text-foreground mb-1"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 }}
          >
            {greeting}{name ? `, ${name}` : ''} 👋
          </motion.p>
          
          {/* Date and Time */}
          <motion.div 
            className="flex items-center gap-2 text-muted-foreground text-sm mb-1"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <span>{dayName}</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
            <span>{dateStr}</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
            <span>{timeStr}</span>
          </motion.div>
          
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
          className="shrink-0"
        >
          <ProgressRing progress={progress} size={90} strokeWidth={6} />
        </motion.div>
      </div>
    </motion.div>
  );
}
