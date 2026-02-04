import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  progress: number;
  className?: string;
  showLabel?: boolean;
  color?: string;
}

export function ProgressBar({ progress, className, showLabel = false, color }: ProgressBarProps) {
  return (
    <div className={cn("w-full", className)}>
      <div className="relative h-3 bg-muted/50 rounded-full overflow-hidden">
        <motion.div
          className={cn("absolute inset-y-0 left-0 rounded-full", color || "bg-primary")}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, progress)}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>
      {showLabel && (
        <p className="text-xs text-muted-foreground mt-1 text-right">
          {Math.round(progress)}%
        </p>
      )}
    </div>
  );
}
