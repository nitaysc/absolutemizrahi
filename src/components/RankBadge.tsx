import { motion } from "framer-motion";
import { getRankFromXP, type Rank } from "@/lib/ranks";
import { cn } from "@/lib/utils";

interface RankBadgeProps {
  xp?: number;
  rank?: Rank;
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
  className?: string;
}

export function RankBadge({ xp, rank, size = 'md', showName = true, className }: RankBadgeProps) {
  const currentRank = rank || getRankFromXP(xp ?? 0);
  
  const sizeClasses = {
    sm: 'text-lg p-1.5',
    md: 'text-2xl p-2',
    lg: 'text-4xl p-3',
  };
  
  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-lg',
  };

  return (
    <motion.div 
      className={cn("flex items-center gap-2", className)}
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
    >
      <motion.div 
        className={cn(
          "rounded-xl flex items-center justify-center",
          currentRank.bgColor,
          sizeClasses[size],
          `shadow-lg ${currentRank.glowColor}`
        )}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <span>{currentRank.icon}</span>
      </motion.div>
      {showName && (
        <span className={cn("font-semibold", currentRank.color, textSizes[size])}>
          {currentRank.name}
        </span>
      )}
    </motion.div>
  );
}
